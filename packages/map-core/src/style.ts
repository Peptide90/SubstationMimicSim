import type { AnyLayer, StyleSpecification } from 'maplibre-gl';

export const baseMinimalStyle: StyleSpecification = {
  version: 8,
  name: 'minimal-operator',
  sources: {},
  glyphs: '',
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0d1117' }
    }
  ]
};

export const minimalBasemapLayers = (sourceId: string): AnyLayer[] => [
  {
    id: 'water',
    type: 'fill',
    source: sourceId,
    'source-layer': 'water',
    paint: { 'fill-color': '#111f30', 'fill-opacity': 0.7 }
  },
  {
    id: 'landuse',
    type: 'fill',
    source: sourceId,
    'source-layer': 'landcover',
    paint: { 'fill-color': '#121a1f', 'fill-opacity': 0.25 }
  },
  {
    id: 'boundaries',
    type: 'line',
    source: sourceId,
    'source-layer': 'boundary',
    paint: { 'line-color': '#26323d', 'line-width': 0.6, 'line-opacity': 0.6 }
  }
];
