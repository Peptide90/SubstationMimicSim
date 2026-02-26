import maplibregl, { type Map } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { getRegionPack } from './regions';
import { baseMinimalStyle, minimalBasemapLayers } from './style';

let protocolReady = false;

export function createOperatorMap(container: HTMLElement, regionId: string): Map {
  const region = getRegionPack(regionId);
  if (!region) throw new Error(`Unknown region: ${regionId}`);

  if (!protocolReady) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolReady = true;
  }

  const sourceId = `${region.id}-source`;
  const map = new maplibregl.Map({
    container,
    center: region.center,
    zoom: region.zoom,
    maxBounds: region.bounds,
    style: baseMinimalStyle,
    attributionControl: false
  });

  map.on('style.load', () => {
    map.addSource(sourceId, {
      type: 'vector',
      url: `pmtiles://${window.location.origin}${region.tilePath}`
    });
    for (const layer of minimalBasemapLayers(sourceId)) {
      map.addLayer(layer);
    }
  });

  return map;
}
