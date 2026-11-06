import type { Point } from '../drawing/model';

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface Insets { top: number; right: number; bottom: number; left: number }

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;

/**
 * Pan and scale that show the whole drawing inside the part of the canvas not
 * covered by overlays — the lesson callout on the left, the switching sheet on
 * the right. Never zooms in past 1:1, so a small drawing is not blown up.
 */
export function fitCamera(bounds: Bounds, viewport: { width: number; height: number }, insets: Insets): { scale: number; pan: Point } {
  const availableWidth = Math.max(1, viewport.width - insets.left - insets.right);
  const availableHeight = Math.max(1, viewport.height - insets.top - insets.bottom);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.max(MIN_SCALE, Math.min(1, MAX_SCALE, availableWidth / width, availableHeight / height));
  return {
    scale,
    pan: {
      x: insets.left + (availableWidth - width * scale) / 2 - bounds.minX * scale,
      y: insets.top + (availableHeight - height * scale) / 2 - bounds.minY * scale
    }
  };
}
