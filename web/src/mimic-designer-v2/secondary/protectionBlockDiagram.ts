import type { DrawingDocument, LearningTier, RelayFunction, RelaySettings } from '../drawing/model';
import { isTierAtLeast } from '../learning/tiers';
import { formatDeviceLabel, type SecondaryConvention } from './conventions';

/**
 * The protection block diagram, generated from the relay model.
 *
 * Columns read left to right exactly as the engine evaluates
 * (simulation/protection.ts): what a relay measures, the functions that decide,
 * the relay that trips if any function trips, the outputs it drives, and the
 * plant they act on. Nothing appears that the engine does not evaluate — and
 * where the engine falls back (a relay with no inputs and no zone watches the
 * whole network), the diagram says so instead of drawing a CT that is not there.
 */

export type BlockColumn = 'measure' | 'function' | 'relay' | 'output' | 'plant';
export const blockColumns: BlockColumn[] = ['measure', 'function', 'relay', 'output', 'plant'];

export type BlockState = 'normal' | 'picked-up' | 'tripped' | 'disabled' | 'closed' | 'open';

export interface DiagramBlock {
  id: string;
  column: BlockColumn;
  relayId: string;
  label: string;
  detail?: string;
  /** The plant or drawing object this block stands for, for cross-referencing. */
  objectId?: string;
  state: BlockState;
}

export interface DiagramLink {
  from: string;
  to: string;
  /** Carrying a decision right now: a pickup, a trip, a trip reaching plant. */
  active: boolean;
}

export interface ProtectionBlockDiagram {
  /** Simple diagrams fold functions and outputs away, for the youngest tiers. */
  detail: 'simple' | 'full';
  /** How devices are labelled. Changing it never changes the structure. */
  convention: SecondaryConvention;
  columns: BlockColumn[];
  blocks: DiagramBlock[];
  links: DiagramLink[];
  notes: string[];
}

const unitFor = (fn: RelayFunction) => (fn.requiredInputType === 'voltage' ? 'kV' : fn.requiredInputType === 'temperature' ? '°C' : 'A');

function relayState(relay: RelaySettings): BlockState {
  if (!relay.enabled || relay.state === 'disabled') return 'disabled';
  if (relay.state === 'tripped') return 'tripped';
  if (relay.state === 'picked-up') return 'picked-up';
  return 'normal';
}

function functionState(relay: RelaySettings, fn: RelayFunction): BlockState {
  if (!relay.enabled || !fn.enabled) return 'disabled';
  if (fn.state === 'tripped') return 'tripped';
  if (fn.state === 'picked-up' || fn.state === 'timing') return 'picked-up';
  // Relays without explicit functions report through the relay itself.
  if (!relay.functions?.length || relay.functions.length === 1) return relayState(relay);
  return 'normal';
}

export function buildProtectionBlockDiagram(doc: DrawingDocument, tier: LearningTier = 'Apprentice', convention: SecondaryConvention = 'plain'): ProtectionBlockDiagram {
  const detail = isTierAtLeast(tier, 'Apprentice') ? 'full' : 'simple';
  const showSettings = isTierAtLeast(tier, 'Apprentice');
  const symbols = new Map(doc.objects.symbols.map((symbol) => [symbol.id, symbol]));
  const nameOf = (id?: string) => (id ? symbols.get(id)?.label?.text?.trim() || id : '');
  const blocks: DiagramBlock[] = [];
  const links: DiagramLink[] = [];
  const notes: string[] = [];
  const plantBlocks = new Map<string, DiagramBlock>();

  const plantBlock = (relayId: string, objectId: string): DiagramBlock => {
    const existing = plantBlocks.get(objectId);
    if (existing) return existing;
    const symbol = symbols.get(objectId);
    const block: DiagramBlock = {
      id: `plant:${objectId}`,
      column: 'plant',
      relayId,
      label: nameOf(objectId),
      detail: symbol ? symbol.type.replace(/-/g, ' ') : 'not on the drawing',
      objectId,
      state: symbol?.operation?.switchState === 'closed' ? 'closed' : 'open'
    };
    plantBlocks.set(objectId, block);
    blocks.push(block);
    return block;
  };

  for (const relay of doc.relays) {
    const state = relayState(relay);
    const tripped = state === 'tripped';
    const relayBlock: DiagramBlock = {
      id: `relay:${relay.id}`,
      column: 'relay',
      relayId: relay.id,
      label: relay.name,
      detail: detail === 'full' ? [relay.role?.replace(/-/g, ' '), state === 'normal' ? 'healthy' : state.replace('-', ' ')].filter(Boolean).join(' · ') : state === 'tripped' ? 'switched off the circuit' : 'watching',
      state
    };

    // What the relay measures — matching the engine's own fallback order.
    const zone = relay.zoneId ? doc.protectionZones.find((item) => item.id === relay.zoneId) : undefined;
    const measured = (relay.inputs ?? []).filter((input) => input.sourceObjectId || input.sourceLabel);
    const measures: DiagramBlock[] = measured.length
      ? measured.map((input) => ({
          id: `measure:${relay.id}:${input.id}`,
          column: 'measure' as const,
          relayId: relay.id,
          label: input.sourceLabel || nameOf(input.sourceObjectId),
          detail: [input.quantity.replace(/-/g, ' '), showSettings ? input.ctRatio ?? input.vtRatio : undefined].filter(Boolean).join(' · '),
          objectId: input.sourceObjectId,
          state: 'normal' as const
        }))
      : zone
        ? [{ id: `measure:${relay.id}:zone`, column: 'measure' as const, relayId: relay.id, label: zone.name, detail: `zone of ${zone.assignedObjectIds.length} item${zone.assignedObjectIds.length === 1 ? '' : 's'}`, state: 'normal' as const }]
        : [{ id: `measure:${relay.id}:network`, column: 'measure' as const, relayId: relay.id, label: 'Whole network', detail: 'no inputs or zone set', state: 'normal' as const }];
    if (!measured.length && !zone) notes.push(`${relay.name} has no measuring inputs and no zone, so it watches the whole network. Real relays only see what their CTs and VTs measure.`);
    if (!relay.tripTargetBreakerIds.length && !(relay.outputActions ?? []).some((output) => output.targetObjectId)) notes.push(`${relay.name} has nothing to trip.`);

    blocks.push(...measures);

    if (detail === 'simple') {
      blocks.push(relayBlock);
      measures.forEach((measure) => links.push({ from: measure.id, to: relayBlock.id, active: state === 'picked-up' || tripped }));
      for (const breakerId of relay.tripTargetBreakerIds) {
        const target = plantBlock(relay.id, breakerId);
        links.push({ from: relayBlock.id, to: target.id, active: tripped });
      }
      continue;
    }

    const functions = (relay.functions ?? []).map((fn): DiagramBlock => ({
      id: `function:${relay.id}:${fn.id}`,
      column: 'function',
      relayId: relay.id,
      label: formatDeviceLabel(fn.type, convention),
      detail: showSettings ? [fn.pickupThreshold !== undefined ? `pickup ${fn.pickupThreshold} ${unitFor(fn)}` : undefined, fn.instantaneous ? 'instantaneous' : `${fn.timeDelayMs} ms`].filter(Boolean).join(' · ') : undefined,
      state: functionState(relay, fn)
    }));
    blocks.push(...functions, relayBlock);
    for (const fn of functions) {
      measures.forEach((measure) => links.push({ from: measure.id, to: fn.id, active: fn.state === 'picked-up' || fn.state === 'tripped' }));
      links.push({ from: fn.id, to: relayBlock.id, active: fn.state === 'tripped' });
    }

    const outputs = relay.outputActions ?? [];
    for (const output of outputs) {
      const outputBlock: DiagramBlock = {
        id: `output:${relay.id}:${output.id}`,
        column: 'output',
        relayId: relay.id,
        label: formatDeviceLabel(`output:${output.action}`, convention),
        detail: output.delayMs ? `after ${output.delayMs} ms` : undefined,
        state: tripped ? 'tripped' : state === 'disabled' ? 'disabled' : 'normal'
      };
      blocks.push(outputBlock);
      links.push({ from: relayBlock.id, to: outputBlock.id, active: tripped });
      if (output.targetObjectId && (output.targetType === 'circuit-breaker' || output.targetType === 'disconnector')) {
        const target = plantBlock(relay.id, output.targetObjectId);
        links.push({ from: outputBlock.id, to: target.id, active: tripped && output.action === 'trip-open-breaker' });
      }
    }

    if (relay.breakerFailEnabled && relay.backupTripTargetBreakerIds.length) {
      const backup: DiagramBlock = {
        id: `output:${relay.id}:breaker-fail`,
        column: 'output',
        relayId: relay.id,
        label: formatDeviceLabel('breaker-fail-backup', convention),
        detail: `after ${relay.breakerFailDelayMs} ms if the main breaker does not open`,
        state: tripped ? 'picked-up' : state === 'disabled' ? 'disabled' : 'normal'
      };
      blocks.push(backup);
      links.push({ from: relayBlock.id, to: backup.id, active: tripped });
      for (const breakerId of relay.backupTripTargetBreakerIds) {
        const target = plantBlock(relay.id, breakerId);
        links.push({ from: backup.id, to: target.id, active: false });
      }
    }
  }

  const columns: BlockColumn[] = detail === 'simple' ? ['measure', 'relay', 'plant'] : blockColumns;
  return { detail, convention, columns, blocks, links, notes };
}

export const columnTitles: Record<BlockColumn, { full: string; simple: string }> = {
  measure: { full: 'Measures', simple: 'Watches' },
  function: { full: 'Functions', simple: 'Decides' },
  relay: { full: 'Relay', simple: 'Protection' },
  output: { full: 'Outputs', simple: 'Acts' },
  plant: { full: 'Plant', simple: 'Switches off' }
};

export interface PlacedBlock extends DiagramBlock { x: number; y: number; width: number; height: number }

/**
 * Columns left to right; each relay gets its own band, tall enough for its
 * busiest column. Plant shared by two relays sits in the band of the first.
 */
export function layoutBlockDiagram(diagram: ProtectionBlockDiagram, sizes = { width: 190, height: 50, columnGap: 70, rowGap: 14, bandGap: 34, top: 60, left: 30 }) {
  const columnX = new Map(diagram.columns.map((column, index) => [column, sizes.left + index * (sizes.width + sizes.columnGap)]));
  const placed: PlacedBlock[] = [];
  let y = sizes.top;
  const relayIds = [...new Set(diagram.blocks.map((block) => block.relayId))];
  for (const relayId of relayIds) {
    const band = diagram.blocks.filter((block) => block.relayId === relayId);
    const rows = Math.max(1, ...diagram.columns.map((column) => band.filter((block) => block.column === column).length));
    const bandHeight = rows * sizes.height + (rows - 1) * sizes.rowGap;
    for (const column of diagram.columns) {
      const inColumn = band.filter((block) => block.column === column);
      const columnHeight = inColumn.length * sizes.height + Math.max(0, inColumn.length - 1) * sizes.rowGap;
      inColumn.forEach((block, index) => placed.push({ ...block, x: columnX.get(column)!, y: y + (bandHeight - columnHeight) / 2 + index * (sizes.height + sizes.rowGap), width: sizes.width, height: sizes.height }));
    }
    y += bandHeight + sizes.bandGap;
  }
  const width = sizes.left * 2 + diagram.columns.length * sizes.width + (diagram.columns.length - 1) * sizes.columnGap;
  const columns = diagram.columns.map((column) => ({ column, x: columnX.get(column)!, width: sizes.width }));
  return { blocks: placed, columns, width, height: Math.max(y, sizes.top + sizes.height) + sizes.top };
}
