import type { AnimationSequence } from '../animation/sequence';
import { EXPORT_FONT_FAMILY, exportThemeColors } from './exportTheme';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatSequenceTime(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export interface SequenceLogBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function buildSequenceEventLogOverlay(
  sequence: AnimationSequence,
  bounds: SequenceLogBounds,
  theme: 'light' | 'dark'
): string {
  if (!sequence.settings.showEventCaptions) return '';

  const colors = exportThemeColors(theme);
  const enabledSteps = sequence.steps.filter((step) => step.enabled);
  if (!enabledSteps.length) return '';

  const panelWidth = 460;
  const lineHeight = 18;
  const maxLines = 6;
  const panelHeight = maxLines * lineHeight + 14;
  const panelX = bounds.minX + 16;
  const panelY = bounds.maxY - panelHeight - 16;

  const stepBegins: number[] = [];
  let elapsed = 0;
  enabledSteps.forEach((step) => {
    stepBegins.push(elapsed);
    elapsed += step.eventDurationSeconds + step.delayAfterSeconds;
  });
  const sequenceEnd = elapsed;

  const lines = enabledSteps.map((step, index) => {
    const begin = stepBegins[index];
    const hideAt = index + maxLines < enabledSteps.length ? stepBegins[index + maxLines] : sequenceEnd;
    const lineSlot = index % maxLines;
    const y = panelY + 18 + lineSlot * lineHeight;
    const label = escapeXml(`[${formatSequenceTime(begin)}] ${step.name}`);
    return `<text x="${panelX + 10}" y="${y}" font-size="12" font-family="${EXPORT_FONT_FAMILY}" fill="${colors.text}" opacity="0">
      <set attributeName="opacity" to="1" begin="${begin}s"/>
      <set attributeName="opacity" to="0" begin="${hideAt}s"/>
      ${label}
    </text>`;
  }).join('');

  return `<g id="sequence-event-log">
    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="4" fill="${colors.background}" stroke="${colors.mutedText}" stroke-width="1" opacity="0.94"/>
    ${lines}
  </g>`;
}
