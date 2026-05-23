import type { DrawingDocument, Point } from '../drawing/model';
import { generateLabels } from '../nomenclature/engine';
import { MIMIC_DESIGNER_V2_SCHEMA_VERSION, migrateDrawingDocument } from '../schema/documentSchema';
import { breakerAndHalfTemplates } from './breakerAndHalf';
import { doubleBusbarTemplates } from './doubleBusbar';
import { busbar, conductor, createBaseDocument, symbol, type DrawingTemplate } from './factory';
import { meshCornerTemplates } from './meshCorner';
import { singleBusbarTemplates } from './singleBusbar';
import { teachingExamples } from './teachingExamples';

export type { DrawingTemplate } from './factory';

const transformerTertiaryTemplate: DrawingTemplate = {
  id: 'template-transformer-hv-lv-tertiary',
  name: 'Transformer bay with HV/LV/tertiary option',
  description: 'Transformer bay with tertiary metadata and editable HV/LV connections.',
  category: 'template',
  tags: ['transformer', 'tertiary', 'hv-lv'],
  voltageLevels: [275, 132, 33],
  create: () => createBaseDocument('template-transformer-hv-lv-tertiary', 'Transformer bay with HV/LV/tertiary option', {
    description: 'Transformer bay with tertiary metadata and editable HV/LV connections.',
    tags: ['transformer', 'tertiary'],
    voltageLevels: [275, 132, 33],
    objects: {
      symbols: [
        symbol('txopt-src', 'source', 80, 160, '275kV SRC', 275),
        symbol('txopt-hv-cb', 'circuit-breaker', 190, 160, 'HV CB', 275, 0, { operation: { switchState: 'closed' } }),
        symbol('txopt-hv-ct', 'ct', 250, 160, 'HV CT', 275),
        symbol('txopt-tx', 'transformer', 310, 160, 'T1', 275, 0, { engineering: { hasTertiary: true, tertiaryVoltageKv: 33, transformerPolarity: 'hv-left' } }),
        symbol('txopt-lv-ct', 'ct', 390, 160, 'LV CT', 132),
        symbol('txopt-lv-load', 'load', 500, 160, '132kV BUS', 132),
        symbol('txopt-ter-ct', 'ct', 310, 220, 'TER CT', 33, 90),
        symbol('txopt-ter-load', 'load', 310, 260, '33kV TER', 33, 90)
      ],
      busbars: [busbar('txopt-lv-bus', [{ x: 350, y: 160 }, { x: 460, y: 160 }], 132)],
      conductors: [
        conductor('txopt-hv', [{ x: 120, y: 160 }, { x: 160, y: 160 }, { x: 220, y: 160 }, { x: 230, y: 160 }, { x: 270, y: 160 }], 275),
        conductor('txopt-lv', [{ x: 350, y: 160 }, { x: 370, y: 160 }, { x: 410, y: 160 }, { x: 460, y: 160 }], 132),
        conductor('txopt-ter', [{ x: 310, y: 194 }, { x: 310, y: 200 }, { x: 310, y: 240 }], 33)
      ],
      labels: [],
      annotations: []
    }
  })
};

const ctVtTeachingTemplate: DrawingTemplate = {
  id: 'template-ct-vt-metering-protection',
  name: 'CT/VT metering/protection teaching bay',
  description: 'Feeder bay with CT and VT measurement points for protection teaching.',
  category: 'template',
  tags: ['ct', 'vt', 'metering', 'protection'],
  voltageLevels: [132],
  create: () => createBaseDocument('template-ct-vt-metering-protection', 'CT/VT metering/protection teaching bay', {
    description: 'Feeder bay with CT and VT measurement points for protection teaching.',
    tags: ['ct', 'vt', 'metering', 'protection'],
    voltageLevels: [132],
    objects: {
      symbols: [
        symbol('meter-src', 'source', 80, 160, 'SRC', 132),
        symbol('meter-cb', 'circuit-breaker', 190, 160, 'CB', 132, 0, { operation: { switchState: 'closed' } }),
        symbol('meter-ct', 'ct', 250, 160, 'CT', 132),
        symbol('meter-vt', 'vt', 310, 140, 'VT-B', 132, 0, { phaseApplicability: ['B'] }),
        symbol('meter-load', 'load', 410, 160, 'FEEDER', 132)
      ],
      busbars: [busbar('meter-bus', [{ x: 120, y: 160 }, { x: 160, y: 160 }, { x: 220, y: 160 }, { x: 270, y: 160 }, { x: 370, y: 160 }], 132)],
      conductors: [],
      labels: [],
      annotations: []
    }
  })
};

const basicFaultProtectionTemplate = teachingExamples.find((item) => item.id === 'example-overcurrent-trip')!;

export const builtInTemplates: DrawingTemplate[] = [
  ...singleBusbarTemplates,
  ...doubleBusbarTemplates,
  ...meshCornerTemplates,
  ...breakerAndHalfTemplates,
  transformerTertiaryTemplate,
  ctVtTeachingTemplate,
  { ...basicFaultProtectionTemplate, id: 'template-basic-fault-protection-teaching', name: 'Basic fault/protection teaching scenario', category: 'template' }
];

export const builtInExamples: DrawingTemplate[] = teachingExamples;

export const templateLibrary: DrawingTemplate[] = [...builtInTemplates, ...builtInExamples];

export function createDrawingFromTemplate(template: DrawingTemplate, name = template.name): DrawingDocument {
  const now = new Date().toISOString();
  return migrateDrawingDocument({
    ...template.create(),
    id: `drawing-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    name,
    drawingType: 'user',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    schemaVersion: MIMIC_DESIGNER_V2_SCHEMA_VERSION
  })!;
}

export function exportCurrentDrawingAsTemplate(doc: DrawingDocument): DrawingTemplate {
  const templateDoc = migrateDrawingDocument({ ...doc, drawingType: 'template' })!;
  return {
    id: `user-template-${doc.id}`,
    name: doc.name,
    description: doc.description ?? '',
    category: 'template',
    tags: doc.tags,
    voltageLevels: doc.voltageLevels,
    notes: doc.templateNotes,
    create: () => templateDoc
  };
}

export function insertTemplateIntoDrawing(doc: DrawingDocument, template: DrawingTemplate, position: Point): DrawingDocument {
  const source = template.create();
  const bounds = boundsFor(source);
  const offset = { x: position.x - bounds.minX, y: position.y - bounds.minY };
  const prefix = `ins-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const idMap = new Map<string, string>();
  const nextId = (id: string) => {
    const mapped = `${prefix}-${id}`;
    idMap.set(id, mapped);
    return mapped;
  };
  const existingLabels = new Set(doc.objects.symbols.map((item) => item.label?.text).filter(Boolean) as string[]);
  const symbols = source.objects.symbols.map((item) => ({
    ...item,
    id: nextId(item.id),
    position: movePoint(item.position, offset),
    label: item.label ? { ...item.label, text: uniqueLabel(item.label.text, existingLabels) } : item.label
  }));
  const busbars = source.objects.busbars.map((item) => ({
    ...item,
    id: nextId(item.id),
    vertices: item.vertices.map((point) => movePoint(point, offset)),
    connectionPoints: item.connectionPoints.map((cp) => ({ ...cp, id: `${idMap.get(item.id) ?? item.id}-cp-${cp.id.split('-cp-').pop() ?? '0'}`, position: movePoint(cp.position, offset) }))
  }));
  const conductors = source.objects.conductors.map((item) => ({
    ...item,
    id: nextId(item.id),
    vertices: item.vertices.map((point) => movePoint(point, offset)),
    connectionPoints: item.connectionPoints.map((cp) => ({ ...cp, id: `${idMap.get(item.id) ?? item.id}-cp-${cp.id.split('-cp-').pop() ?? '0'}`, position: movePoint(cp.position, offset) }))
  }));
  const remap = (id: string) => idMap.get(id) ?? id;
  return generateLabels(migrateDrawingDocument({
    ...doc,
    updatedAt: new Date().toISOString(),
    objects: {
      ...doc.objects,
      symbols: [...doc.objects.symbols, ...symbols],
      busbars: [...doc.objects.busbars, ...busbars],
      conductors: [...doc.objects.conductors, ...conductors]
    },
    faults: [...doc.faults, ...source.faults.map((fault) => ({ ...fault, id: nextId(fault.id), targetObjectId: fault.targetObjectId ? remap(fault.targetObjectId) : undefined, location: fault.location ? movePoint(fault.location, offset) : undefined }))],
    hotJoints: [...doc.hotJoints, ...source.hotJoints.map((joint) => ({ ...joint, id: nextId(joint.id), targetObjectId: joint.targetObjectId ? remap(joint.targetObjectId) : undefined }))],
    protectionZones: [...doc.protectionZones, ...source.protectionZones.map((zone) => ({ ...zone, id: nextId(zone.id), assignedObjectIds: zone.assignedObjectIds.map(remap), ctInputIds: zone.ctInputIds.map(remap), vtInputIds: zone.vtInputIds.map(remap), vertices: zone.vertices.map((point) => movePoint(point, offset)) }))],
    relays: [...doc.relays, ...source.relays.map((relay) => ({ ...relay, id: nextId(relay.id), zoneId: relay.zoneId ? remap(relay.zoneId) : undefined, tripTargetBreakerIds: relay.tripTargetBreakerIds.map(remap), backupTripTargetBreakerIds: relay.backupTripTargetBreakerIds.map(remap) }))],
    protection: [...doc.protection, ...source.protection.map((element) => ({ ...element, id: nextId(element.id), watchedObjectId: element.watchedObjectId ? remap(element.watchedObjectId) : undefined, tripTargetBreakerIds: element.tripTargetBreakerIds.map(remap) }))]
  })!);
}

function boundsFor(doc: DrawingDocument) {
  const points = [...doc.objects.symbols.map((item) => item.position), ...doc.objects.conductors.flatMap((item) => item.vertices), ...doc.objects.busbars.flatMap((item) => item.vertices)];
  if (!points.length) return { minX: 0, minY: 0 };
  return { minX: Math.min(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)) };
}

function movePoint(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function uniqueLabel(label: string, existingLabels: Set<string>): string {
  if (!existingLabels.has(label)) {
    existingLabels.add(label);
    return label;
  }
  const match = label.match(/^(.*?)(\d+)$/);
  const stem = match?.[1] ?? `${label} `;
  let index = match ? Number(match[2]) + 1 : 2;
  let candidate = `${stem}${index}`;
  while (existingLabels.has(candidate)) {
    index += 1;
    candidate = `${stem}${index}`;
  }
  existingLabels.add(candidate);
  return candidate;
}
