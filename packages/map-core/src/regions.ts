export interface RegionPack {
  id: string;
  name: string;
  bounds: [[number, number], [number, number]];
  center: [number, number];
  zoom: number;
  tilePath: string;
}

const packs: Record<string, RegionPack> = {
  uk: {
    id: 'uk',
    name: 'United Kingdom',
    bounds: [[-9.2, 49.8], [2.5, 59.2]],
    center: [-2.5, 54.3],
    zoom: 5.1,
    tilePath: '/tiles/uk.pmtiles'
  },
  iberia: {
    id: 'iberia',
    name: 'Iberia (stub)',
    bounds: [[-10.3, 35.7], [4.9, 44.2]],
    center: [-3.5, 40.3],
    zoom: 5,
    tilePath: '/tiles/iberia.pmtiles'
  }
};

export const getRegionPack = (id: string): RegionPack | undefined => packs[id];
export const listRegionPacks = (): RegionPack[] => Object.values(packs);
