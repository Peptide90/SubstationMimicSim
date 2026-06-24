import { totalDuration, DEFAULT_VISUAL_SETTINGS } from './animatedSequence.js';

export function renderPreviewScene(drawing, visualSettings = DEFAULT_VISUAL_SETTINGS) {
  return { drawing, visualSettings };
}

export function exportAnimatedSvg(sequence, drawing, visualSettings = DEFAULT_VISUAL_SETTINGS) {
  const duration = totalDuration(sequence);
  const width = sequence.settings.exportResolution.width || drawing.width || 1280;
  const height = sequence.settings.exportResolution.height || drawing.height || 720;
  const lines = [`<!-- Animated Sequence: ${escapeXml(sequence.name)}; duration: ${duration}s -->`, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" data-busbar-thickness="${visualSettings.busbarThickness}" data-symbol-size="${visualSettings.componentSymbolSize}">`];
  for (const o of drawing.objects || []) {
    const strokeWidth = o.type === 'busbar' ? visualSettings.busbarThickness : visualSettings.cableStrokeWidth;
    lines.push(`<g id="${escapeXml(o.id)}"><line x1="${o.x1 ?? 0}" y1="${o.y1 ?? 0}" x2="${o.x2 ?? 100}" y2="${o.y2 ?? 0}" stroke="currentColor" stroke-width="${strokeWidth}">`);
    if (sequence.settings.trimLineEnergisation) lines.push(`<animate attributeName="stroke-dashoffset" from="100" to="0" dur="${sequence.settings.busbarEnergisationDuration}s" fill="freeze" />`);
    lines.push(`</line><text font-size="${visualSettings.labelSize}">${escapeXml(o.label || o.id)}</text></g>`);
  }
  let t = 0;
  for (const step of sequence.steps.filter(s => s.enabled)) {
    if (sequence.settings.highlightOperatedLabels && step.targetId) lines.push(`<set href="#${escapeXml(step.targetId)}" attributeName="filter" to="url(#labelGlow)" begin="${t}s" dur="${step.eventDurationSeconds}s" />`);
    if (sequence.settings.showEventCaptions) lines.push(`<text x="24" y="${height - 24}" font-size="${visualSettings.textSize}"><animate attributeName="opacity" from="1" to="0" begin="${t}s" dur="${step.eventDurationSeconds}s" />${escapeXml(step.name)}</text>`);
    t += step.eventDurationSeconds + step.delayAfterSeconds;
  }
  lines.push('</svg>');
  return { svg: lines.join('\n'), warnings: [] };
}

export function getVideoExportCapabilities(env = globalThis) {
  const webm = !!env.MediaRecorder;
  return { webm, mp4: false, mp4Reason: 'Browser-native MP4 encoding is not generally available; export WebM or PNG frames for ffmpeg conversion.', frameSequence: true };
}

export function assertRendererSettingsShared(preview, visualSettings) { return preview.visualSettings === visualSettings; }
function escapeXml(v){ return String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
