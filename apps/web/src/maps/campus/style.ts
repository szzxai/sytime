import type { LayerSpecification, StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import { campusData } from './survey';
import { overviewData, overviewHeight, overviewRoadSurface } from './overview';
const kind = (...values: string[]): ExpressionSpecification => [
  'in',
  ['get', 'kind'],
  ['literal', values],
];
const layers: LayerSpecification[] = [
  { id: 'paper', type: 'background', paint: { 'background-color': '#f0eee5' } },
  {
    id: 'context-blocks',
    type: 'fill',
    source: 'survey',
    filter: kind('context'),
    paint: { 'fill-color': '#e3dfd6' },
  },
  {
    id: 'campus-ground',
    type: 'fill',
    source: 'survey',
    filter: kind('campus'),
    paint: { 'fill-color': '#e4e9d4' },
  },
  {
    id: 'street-surface',
    type: 'fill',
    source: 'survey',
    filter: ['all', kind('street'), ['==', ['geometry-type'], 'Polygon']],
    paint: { 'fill-color': '#e5ddc8' },
  },
  {
    id: 'street-lines',
    type: 'line',
    source: 'survey',
    filter: ['all', kind('street'), ['==', ['geometry-type'], 'LineString']],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': '#e5ddc8',
      'line-width': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        16,
        ['get', 'width'],
        21,
        ['*', ['get', 'width'], 32],
      ],
    },
  },
  {
    id: 'street-divider',
    type: 'line',
    source: 'survey',
    filter: kind('street-center'),
    paint: { 'line-color': '#fffaf0', 'line-width': 1.2, 'line-dasharray': [5, 4] },
  },
  {
    id: 'paving',
    type: 'fill',
    source: 'survey',
    filter: kind('paving'),
    paint: { 'fill-color': '#e2daca', 'fill-outline-color': '#d5cdbb' },
  },
  {
    id: 'planting',
    type: 'fill',
    source: 'survey',
    filter: kind('green', 'garden'),
    paint: { 'fill-color': ['match', ['get', 'kind'], 'garden', '#cbdcb8', '#c1d7ac'] },
  },
  {
    id: 'water-basins',
    type: 'fill',
    source: 'survey',
    filter: kind('water'),
    paint: { 'fill-color': '#a3d2d8', 'fill-outline-color': '#84bdc6' },
  },
  {
    id: 'court-surfaces',
    type: 'fill',
    source: 'survey',
    filter: kind('court'),
    paint: { 'fill-color': '#82b3ac', 'fill-outline-color': '#f8fbef' },
  },
  {
    id: 'running-surface',
    type: 'fill',
    source: 'survey',
    filter: kind('track'),
    paint: { 'fill-color': '#cb927e' },
  },
  {
    id: 'stadium-grass',
    type: 'fill',
    source: 'survey',
    filter: kind('infield', 'field'),
    paint: { 'fill-color': ['match', ['get', 'kind'], 'infield', '#8cae8d', '#a0bb81'] },
  },
  {
    id: 'turf-stripes',
    type: 'fill',
    source: 'survey',
    filter: kind('field-stripe'),
    paint: { 'fill-color': '#a9c696', 'fill-opacity': 0.5 },
  },
  {
    id: 'paths-edge',
    type: 'line',
    source: 'survey',
    filter: kind('path', 'walk'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#d0d3bf',
      'line-width': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        16,
        ['*', ['get', 'width'], 1.3],
        19,
        ['*', ['get', 'width'], 10.4],
      ],
    },
  },
  {
    id: 'paths-paving',
    type: 'line',
    source: 'survey',
    filter: kind('path', 'walk'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#fffdf4',
      'line-width': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        16,
        ['get', 'width'],
        19,
        ['*', ['get', 'width'], 8],
      ],
    },
  },
  {
    id: 'court-inlay',
    type: 'line',
    source: 'survey',
    minzoom: 18,
    filter: kind('court-inlay'),
    paint: {
      'line-color': '#b2ada0',
      'line-width': ['interpolate', ['exponential', 2], ['zoom'], 18, 1, 22, 16],
    },
  },

  {
    id: 'sport-markings',
    type: 'line',
    source: 'survey',
    filter: kind('marking'),
    paint: {
      'line-color': '#fffbed',
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.35, 20, 1.6],
      'line-opacity': 0.85,
    },
  },
  {
    id: 'tree-shadows',
    type: 'circle',
    source: 'survey',
    filter: kind('tree'),
    paint: {
      'circle-radius': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        16,
        ['*', ['get', 'radius'], 0.95],
        21,
        ['*', ['get', 'radius'], 30],
      ],
      'circle-color': '#82976b',
      'circle-opacity': 0.18,
      'circle-translate': [2, 3],
      'circle-pitch-alignment': 'map',
    },
  },

  {
    id: 'wall-shadows',
    type: 'fill',
    source: 'survey',
    filter: kind('building'),
    paint: { 'fill-color': '#777e67', 'fill-opacity': 0.15, 'fill-translate': [4, 6] },
  },

  {
    id: 'volumes',
    type: 'fill-extrusion',
    source: 'survey',
    filter: ['all', kind('building', 'structure'), ['!=', ['get', 'planOnly'], true]],
    paint: {
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#dab890',
        ['boolean', ['feature-state', 'hover'], false],
        '#e6cfae',
        ['get', 'color'],
      ],
      'fill-extrusion-opacity': 1,
    },
  },
  {
    id: 'selected-ground',
    type: 'fill',
    source: 'selected',
    paint: { 'fill-color': '#bf8d55', 'fill-opacity': 0.18 },
  },
  {
    id: 'selected-edge',
    type: 'line',
    source: 'selected',
    paint: { 'line-color': '#b47e42', 'line-width': 2, 'line-dasharray': [2, 1] },
  },
  {
    id: 'place-labels',
    type: 'symbol',
    source: 'survey',
    filter: kind('place'),
    layout: {
      'icon-image': ['concat', 'place-', ['get', 'place']],
      'icon-size': 0.5,
      'icon-anchor': 'center',
      'icon-padding': 6,
      'icon-allow-overlap': false,
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
    },
  },
  {
    id: 'street-labels',
    type: 'symbol',
    source: 'survey',
    filter: kind('road-name'),
    layout: {
      'symbol-placement': 'line',
      'icon-image': ['concat', 'street-', ['get', 'name']],
      'icon-size': 0.5,
      'icon-padding': 8,
      'icon-rotation-alignment': 'map',
    },
  },
];
// The experimental layers retain their original source and paint. Both overview modes
// share the same ground plan, with a separate layer for the uniform block height.
const overviewLayers: LayerSpecification[] = [
  ...layers.flatMap((layer): LayerSpecification[] => {
    if (
      !('source' in layer) ||
      ![
        'context-blocks',
        'campus-ground',
        'planting',
        'water-basins',
        'court-surfaces',
        'running-surface',
        'stadium-grass',
        'turf-stripes',
        'sport-markings',
      ].includes(layer.id)
    )
      return [];
    const copy = {
      ...layer,
      id: 'overview-' + layer.id,
      source: 'overview',
    } as LayerSpecification;
    if (copy.type !== 'fill') return [copy];
    if (layer.id === 'planting') copy.paint = { 'fill-color': '#c1d7ac', 'fill-opacity': 0.9 };
    if (layer.id === 'court-surfaces')
      copy.paint = { 'fill-color': '#d8a185', 'fill-outline-color': '#ffffff' };
    if (layer.id === 'running-surface') copy.paint = { 'fill-color': '#bb675b' };
    if (layer.id === 'stadium-grass') copy.paint = { 'fill-color': '#84b078' };
    if (layer.id === 'turf-stripes') copy.paint = { 'fill-color': '#91b980' };
    return [copy];
  }),
  {
    id: 'overview-streets',
    type: 'fill',
    source: 'overview-roads',
    filter: kind('street'),
    paint: { 'fill-color': '#d5d6c7' },
  },
  {
    id: 'overview-paths',
    type: 'fill',
    source: 'overview-roads',
    filter: kind('path'),
    paint: { 'fill-color': '#fffdf4', 'fill-outline-color': '#d5d6c7' },
  },
  {
    id: 'overview-shadows',
    type: 'fill',
    source: 'overview',
    filter: kind('building'),
    paint: { 'fill-color': '#707b60', 'fill-opacity': 0.13, 'fill-translate': [3, 5] },
  },
  {
    id: 'overview-roofs',
    type: 'fill',
    source: 'overview',
    filter: kind('building'),
    paint: { 'fill-color': ['get', 'color'], 'fill-outline-color': '#bfb69f' },
  },
  {
    id: 'overview-blocks',
    type: 'fill-extrusion',
    source: 'overview',
    filter: kind('building'),
    paint: { 'fill-extrusion-height': overviewHeight, 'fill-extrusion-color': ['get', 'color'] },
  },
];
const shared = new Set([
  'paper',
  'place-labels',
  'street-labels',
  'selected-ground',
  'selected-edge',
]);
export const experimentalLayers = layers.filter(({ id }) => !shared.has(id)).map(({ id }) => id);
export const overviewLayerIds = overviewLayers.map(({ id }) => id);

export function makeStyle(): StyleSpecification {
  const selectionIndex = layers.findIndex(({ id }) => id === 'selected-ground');
  return {
    version: 8,
    light: { anchor: 'viewport', color: '#fff9e9', intensity: 0.28, position: [1.5, 200, 35] },
    sources: {
      survey: { type: 'geojson', data: campusData, generateId: true },
      overview: { type: 'geojson', data: overviewData },
      'overview-roads': { type: 'geojson', data: overviewRoadSurface },
      selected: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      ...layers
        .slice(0, selectionIndex)
        .map((layer): LayerSpecification =>
          layer.id === 'paper'
            ? layer
            : ({ ...layer, layout: { ...layer.layout, visibility: 'none' } } as LayerSpecification),
        ),
      ...overviewLayers.map(
        (layer): LayerSpecification =>
          ({
            ...layer,
            layout: {
              ...layer.layout,
              visibility: layer.id === 'overview-roofs' ? 'none' : 'visible',
            },
          }) as LayerSpecification,
      ),
      ...layers.slice(selectionIndex),
    ],
  };
}

export const selectableLayers = [
  'overview-blocks',
  'overview-roofs',
  'overview-planting',
  'overview-water-basins',
  'overview-court-surfaces',
  'overview-running-surface',
  'overview-stadium-grass',
  'volumes',
  'place-labels',
  'paving',
  'planting',
  'water-basins',
  'court-surfaces',
  'running-surface',
  'stadium-grass',
];
