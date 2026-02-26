import type { Map as MlMap, MercatorCoordinate, CustomLayerInterface } from 'maplibre-gl';
import type { Corridor, GridNode } from '@scenarios/types';
import type { CorridorState } from '@sim-core/types';

interface OverlayData {
  nodes: GridNode[];
  corridors: Corridor[];
  corridorState: CorridorState[];
}

const voltageWidth: Record<number, number> = { 132: 1.5, 275: 2.5, 400: 3.5 };

function jitterCurve(a: [number, number], b: [number, number]): [number, number][] {
  const mx = (a[0] + b[0]) / 2 + (Math.random() - 0.5) * 0.3;
  const my = (a[1] + b[1]) / 2 + (Math.random() - 0.5) * 0.2;
  return [a, [mx, my], b];
}

export function createGridOverlay(getData: () => OverlayData): CustomLayerInterface {
  let map: MlMap;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  return {
    id: 'grid-overlay',
    type: 'custom',
    renderingMode: '2d',
    onAdd(m) {
      map = m;
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    },
    render() {
      const c = map.getCanvas();
      canvas.width = c.width;
      canvas.height = c.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const data = getData();
      const nodeById = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
      const stateById = Object.fromEntries(data.corridorState.map((s) => [s.id, s]));

      for (const corridor of data.corridors) {
        const from = map.project(nodeById[corridor.from].lngLat);
        const to = map.project(nodeById[corridor.to].lngLat);
        const [a, mid, b] = jitterCurve([from.x, from.y], [to.x, to.y]);
        const state = stateById[corridor.id];
        const overload = state.loadingPct > 90;
        ctx.strokeStyle = state.outOfService ? 'rgba(140,140,140,.6)' : overload ? '#ff5c5c' : state.loadingPct > 70 ? '#f6c744' : '#6ed39d';
        ctx.lineWidth = voltageWidth[corridor.voltageClass] ?? 2;
        ctx.setLineDash(state.outOfService ? [6, 5] : []);
        if (overload) ctx.globalAlpha = 0.75 + Math.sin(Date.now() / 170) * 0.25;

        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(mid[0], mid[1], b[0], b[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (const node of data.nodes) {
        const p = map.project(node.lngLat);
        ctx.fillStyle = node.type === 'generator' ? '#63b3ed' : node.type === 'load' ? '#f6ad55' : '#cbd5e0';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const target = c.getContext('2d');
      target?.drawImage(canvas, 0, 0);
      map.triggerRepaint();
    }
  };
}
