export const EXPORT_FONT_FAMILY = '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

export interface ExportThemeColors {
  background: string;
  busbar: string;
  cable: string;
  text: string;
  mutedText: string;
  live: string;
  earth: string;
  warning: string;
  symbolStroke: string;
  symbolFill: string;
}

export function exportThemeColors(theme: 'light' | 'dark'): ExportThemeColors {
  if (theme === 'dark') {
    return {
      background: '#0f172a',
      busbar: '#f8fafc',
      cable: '#38bdf8',
      text: '#f8fafc',
      mutedText: '#94a3b8',
      live: '#4ade80',
      earth: '#f59e0b',
      warning: '#fb7185',
      symbolStroke: '#f8fafc',
      symbolFill: '#0f172a'
    };
  }
  return {
    background: '#ffffff',
    busbar: '#111827',
    cable: '#0284c7',
    text: '#0f172a',
    mutedText: '#64748b',
    live: '#20a05b',
    earth: '#b7791f',
    warning: '#cf4d2c',
    symbolStroke: '#0f172a',
    symbolFill: '#ffffff'
  };
}

export function exportLineStroke(colors: ExportThemeColors, state: 'dead' | 'live' | 'earth' | 'fault', base: string): string {
  if (state === 'fault') return colors.warning;
  if (state === 'earth') return colors.earth;
  if (state === 'live') return colors.live;
  return base;
}
