import type { Scenario } from './types';

export const ukBandATutorial: Scenario = {
  id: 'uk-band-a-co2-wind',
  title: 'UK Tutorial: Wind, Carbon, and Cross-Border Trade',
  regionId: 'uk',
  durationSec: 360,
  ageBand: 'A',
  description:
    'Balance emissions and reliability while wind output swings and interconnector economics shift.',
  network: {
    nodes: [
      { id: 'scot-wind', name: 'Scotland Wind', type: 'generator', lngLat: [-4.5, 57.4], baseMw: 2200, co2Intensity: 20 },
      { id: 'north-demand', name: 'North Demand', type: 'load', lngLat: [-2.6, 54.9], baseMw: -1800 },
      { id: 'midland-hub', name: 'Midland Hub', type: 'substation', lngLat: [-1.8, 52.6], baseMw: 0 },
      { id: 'south-demand', name: 'South Demand', type: 'load', lngLat: [-0.3, 51.1], baseMw: -2500 },
      { id: 'south-gas', name: 'South CCGT', type: 'generator', lngLat: [0.2, 51.6], baseMw: 1700, co2Intensity: 420 },
      { id: 'fr-link', name: 'FR Interconnector', type: 'interconnector', lngLat: [1.4, 50.9], baseMw: 500, co2Intensity: 180 }
    ],
    corridors: [
      { id: 'c1', from: 'scot-wind', to: 'north-demand', thermalLimitMw: 2800, voltageClass: 400 },
      { id: 'c2', from: 'north-demand', to: 'midland-hub', thermalLimitMw: 1800, voltageClass: 400 },
      { id: 'c3', from: 'midland-hub', to: 'south-demand', thermalLimitMw: 2100, voltageClass: 400 },
      { id: 'c4', from: 'south-gas', to: 'south-demand', thermalLimitMw: 1900, voltageClass: 275 },
      { id: 'c5', from: 'fr-link', to: 'south-demand', thermalLimitMw: 1200, voltageClass: 132 }
    ]
  },
  events: [
    {
      id: 'e1',
      atSecond: 50,
      log: '00:50 Wind ramps down by 600 MW.',
      updates: { nodeDeltasMw: { 'scot-wind': -600 } }
    },
    {
      id: 'e2',
      atSecond: 150,
      log: '02:30 Market spread favors FR import +300 MW.',
      updates: { nodeDeltasMw: { 'fr-link': 300 } }
    },
    {
      id: 'e3',
      atSecond: 240,
      log: '04:00 Evening demand +450 MW in the south.',
      updates: { nodeDeltasMw: { 'south-demand': -450 } }
    }
  ],
  pauses: [
    {
      id: 'p1',
      atSecond: 150,
      message: 'Import offer received. Choose carbon or congestion strategy.',
      allowedActions: [
        { id: 'a1', label: 'Import +300 MW from FR', type: 'toggle-interconnector', payload: { nodeId: 'fr-link', deltaMw: 300 } },
        { id: 'a2', label: 'Dispatch +300 MW South CCGT', type: 'dispatch', payload: { nodeId: 'south-gas', deltaMw: 300 } }
      ]
    }
  ],
  objectives: [
    { id: 'o1', text: 'Keep corridor c3 below 95% loading.', metric: 'corridorLoading', target: 95, comparator: 'lte' },
    { id: 'o2', text: 'Maintain average CO2 intensity below 280 g/kWh.', metric: 'co2', target: 280, comparator: 'lte' },
    { id: 'o3', text: 'End frequency at or above 49.8 Hz.', metric: 'frequency', target: 49.8, comparator: 'gte' }
  ]
};
