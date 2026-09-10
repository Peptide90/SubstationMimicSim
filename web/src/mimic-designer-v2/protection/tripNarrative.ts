import type { DrawingDocument, ElectricalSymbol, LearningTier, RelaySettings } from '../drawing/model';
import { explain } from '../learning/terminology';
import { isTierAtLeast } from '../learning/tiers';

/**
 * A plain-language account of the most recent protection operation, told at the
 * depth the learner is ready for.
 *
 * This is the one protection surface every tier can reach (see the `tripExplain`
 * panel in workbenches/registry.ts). A ten-year-old should get a true sentence
 * about what happened; a commissioning engineer should get timings and targets.
 * Nothing here invents detail the simulation does not hold.
 */
export interface TripNarrative {
  /** Headline: what happened, in this tier's words. */
  headline: string;
  /** Why it happened. */
  cause: string;
  /** What the operation achieved — the teaching point. */
  outcome: string;
  /** Extra rows shown from Apprentice upward. Empty for younger tiers. */
  detail: string[];
  relayId?: string;
  breakerIds: string[];
}

const nameOf = (symbol?: ElectricalSymbol, fallback = 'the equipment') =>
  symbol?.label?.text?.trim() || symbol?.id || fallback;

/** The relay that most recently tripped, if any. */
export function latestTrippedRelay(doc: DrawingDocument): RelaySettings | undefined {
  return doc.relays
    .filter((relay) => relay.state === 'tripped' && relay.trippedAt)
    .sort((a, b) => Date.parse(b.trippedAt!) - Date.parse(a.trippedAt!))[0];
}

export function buildTripNarrative(doc: DrawingDocument, tier: LearningTier): TripNarrative | undefined {
  const relay = latestTrippedRelay(doc);
  if (!relay) return undefined;

  const symbols = new Map(doc.objects.symbols.map((symbol) => [symbol.id, symbol]));
  const breakerIds = relay.tripTargetBreakerIds ?? [];
  const breakerNames = breakerIds.map((id) => nameOf(symbols.get(id), id));
  const breakerLabel = breakerNames.length ? breakerNames.join(' and ') : 'the circuit breaker';
  const protectedName = relay.protectedAssetId ? nameOf(symbols.get(relay.protectedAssetId)) : undefined;
  const earthFault = relay.type === 'earth-fault';
  const activeFault = doc.faults.find((fault) => fault.active);
  const faultedName = activeFault?.targetObjectId ? nameOf(symbols.get(activeFault.targetObjectId)) : undefined;

  const headline = isTierAtLeast(tier, 'Apprentice')
    ? `${relay.name} tripped ${breakerLabel}.`
    : `${breakerLabel} was switched off automatically.`;

  const cause = isTierAtLeast(tier, 'Apprentice')
    ? `${earthFault ? 'Earth fault' : 'Overcurrent'} protection picked up${
        faultedName ? ` for a fault on ${faultedName}` : ''
      } and issued a trip after ${relay.timeDelayMs} ms.`
    : explain('breaker-trip', tier);

  const outcome = isTierAtLeast(tier, 'Apprentice')
    ? `Opening ${breakerLabel} removed the supply from ${protectedName ?? 'the faulted section'}.`
    : explain('protection-relay', tier);

  const detail: string[] = [];
  if (isTierAtLeast(tier, 'Apprentice')) {
    const pickup = earthFault ? relay.earthFaultPickupA ?? relay.pickupCurrentA : relay.pickupCurrentA;
    detail.push(`Pickup setting: ${pickup} A`);
    detail.push(`Time delay: ${relay.timeDelayMs} ms`);
    detail.push(`Phases watched: ${relay.phases.join(', ')}`);
  }
  if (isTierAtLeast(tier, 'Engineer')) {
    if (relay.role) detail.push(`Role: ${relay.role}`);
    if (relay.zoneId) detail.push(`Zone: ${relay.zoneId}`);
    if (relay.directional) detail.push('Directional element enabled');
    detail.push(
      relay.breakerFailEnabled
        ? `Breaker-fail armed at ${relay.breakerFailDelayMs} ms, backing up to ${
            relay.backupTripTargetBreakerIds.map((id) => nameOf(symbols.get(id), id)).join(', ') || 'no assigned backup'
          }`
        : 'Breaker-fail protection disabled'
    );
  }

  return { headline, cause, outcome, detail, relayId: relay.id, breakerIds };
}

/** Shown when nothing has tripped, so the panel still teaches rather than sitting blank. */
export function idleProtectionSummary(doc: DrawingDocument, tier: LearningTier): string {
  const armed = doc.relays.filter((relay) => relay.enabled).length;
  if (!armed) return isTierAtLeast(tier, 'Apprentice')
    ? 'No protection relays are configured on this drawing yet.'
    : 'Nothing is watching this circuit yet.';
  return `${explain('protection-relay', tier)} ${
    isTierAtLeast(tier, 'Apprentice')
      ? `${armed} relay${armed === 1 ? '' : 's'} armed, none operated.`
      : 'Nothing has needed to switch off yet.'
  }`;
}
