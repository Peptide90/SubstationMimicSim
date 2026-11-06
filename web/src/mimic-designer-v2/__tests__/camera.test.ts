import { describe, expect, it } from 'vitest';
import { fitCamera } from '../ui/camera';

const toScreen = (camera: ReturnType<typeof fitCamera>, x: number, y: number) => ({ x: camera.pan.x + x * camera.scale, y: camera.pan.y + y * camera.scale });

describe('fitCamera', () => {
  const viewport = { width: 1600, height: 900 };
  const insets = { top: 12, right: 404, bottom: 12, left: 384 };

  it('keeps the whole drawing clear of the overlays', () => {
    const bounds = { minX: 0, minY: 100, maxX: 1300, maxY: 400 };
    const camera = fitCamera(bounds, viewport, insets);
    const topLeft = toScreen(camera, bounds.minX, bounds.minY);
    const bottomRight = toScreen(camera, bounds.maxX, bounds.maxY);
    expect(topLeft.x).toBeGreaterThanOrEqual(insets.left - 0.001);
    expect(bottomRight.x).toBeLessThanOrEqual(viewport.width - insets.right + 0.001);
    expect(topLeft.y).toBeGreaterThanOrEqual(insets.top - 0.001);
    expect(bottomRight.y).toBeLessThanOrEqual(viewport.height - insets.bottom + 0.001);
  });

  it('does not enlarge a small drawing beyond 1:1', () => {
    expect(fitCamera({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, viewport, insets).scale).toBe(1);
  });

  it('centres the drawing in the free area', () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const camera = fitCamera(bounds, viewport, insets);
    const centre = toScreen(camera, 50, 50);
    expect(centre.x).toBeCloseTo(insets.left + (viewport.width - insets.left - insets.right) / 2);
  });
});
