import type { FeatureCollection, Geometry, Polygon as GeoPolygon } from 'geojson';
import clipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import { scanOrigin, type PlanPoint, type Properties, type SurveyFeature } from './model';
import { campusData } from './survey';

// True east/north axes all the way through the planar overlay. Units are metres at campus scale.
const metres = [0.00001049872108, 0.00000901499102];
const toMetres = ([x, y]: number[]): PlanPoint => [
  (x - scanOrigin[0]) / metres[0],
  (y - scanOrigin[1]) / metres[1],
];
const toMap = ([x, y]: PlanPoint): PlanPoint => [
  scanOrigin[0] + x * metres[0],
  scanOrigin[1] + y * metres[1],
];

function rectangle(w: number, s: number, e: number, n: number): Polygon {
  return [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ];
}

// Keep long edges and courtyard recesses, rotating each individual wall to its closest axis.
function squareWalls(ring: Ring): Ring {
  const edges = ring.slice(1).map((b, i) => {
    const a = ring[i];
    const axis = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 1 : 0;
    return { axis, fixed: Math.round((a[axis] + b[axis]) * 2) / 4 };
  });
  const corners: Ring = [];
  for (const [i, edge] of edges.entries()) {
    const previous = edges.at(i - 1)!;
    if (previous.axis !== edge.axis) {
      corners.push(edge.axis === 0 ? [edge.fixed, previous.fixed] : [previous.fixed, edge.fixed]);
    } else if (previous.fixed !== edge.fixed) {
      const join = Math.round(ring[i][1 - edge.axis] * 4) / 4;
      corners.push(
        ...(edge.axis === 0
          ? ([
              [previous.fixed, join],
              [edge.fixed, join],
            ] satisfies Ring)
          : ([
              [join, previous.fixed],
              [join, edge.fixed],
            ] satisfies Ring)),
      );
    }
  }
  return [...corners, corners[0]];
}

function roadPolygons(publicStreet: boolean): MultiPolygon {
  return campusData.features.flatMap(({ geometry, properties }) => {
    const { kind, width } = properties;
    if (publicStreet ? kind !== 'street' : kind !== 'path' && kind !== 'walk') return [];
    if (geometry.type === 'Polygon') return [geometry.coordinates.map((r) => r.map(toMetres))];
    if (geometry.type !== 'LineString' || !width) return [];
    const points = geometry.coordinates.map(toMetres);
    const radius = width / 2;
    const joints = points.map(([x, y]): Polygon => [
      Array.from({ length: 16 }, (_, i): PlanPoint => [
        x + radius * Math.cos((i * Math.PI) / 8),
        y + radius * Math.sin((i * Math.PI) / 8),
      ]),
    ]);
    return points
      .slice(1)
      .map((b, i): Polygon => {
        const a = points[i];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dx = (radius * (b[1] - a[1])) / length;
        const dy = (radius * (a[0] - b[0])) / length;
        return [
          [
            [a[0] - dx, a[1] - dy],
            [b[0] - dx, b[1] - dy],
            [b[0] + dx, b[1] + dy],
            [a[0] + dx, a[1] + dy],
          ],
        ];
      })
      .concat(joints);
  });
}

// Cover road cuts with orthogonal rectangles. A cut against the exact diagonal line would
// reintroduce diagonal walls. Only roads that actually touch the footprint can cause a cut.
function roadClearance(building: MultiPolygon): MultiPolygon {
  const overlap = clipping.intersection(building, roads);
  return overlap.flatMap(([ring]) => {
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    const roundDown = (n: number) => Math.floor((n - 0.15) * 4) / 4;
    const roundUp = (n: number) => Math.ceil((n + 0.15) * 4) / 4;
    return [
      rectangle(
        roundDown(Math.min(...xs)),
        roundDown(Math.min(...ys)),
        roundUp(Math.max(...xs)),
        roundUp(Math.max(...ys)),
      ),
    ];
  });
}

const streets = clipping.union(roadPolygons(true));
const paths = clipping.union(roadPolygons(false));
const roads = clipping.union(streets, paths);
const buildings = new Map<string, Polygon[]>();
for (const { properties, geometry } of campusData.features) {
  const { place, kind } = properties;
  if (!place || kind !== 'building' || geometry.type !== 'Polygon') continue;
  const squared = squareWalls(geometry.coordinates[0].map(toMetres));
  if (squared.length < 4) continue;
  const group = buildings.get(place) ?? [];
  group.push([squared]);
  buildings.set(place, group);
}

// The full gate spans the walkway. Keep two masonry blocks north of the junction in plan.
buildings.set('zhide', [
  rectangle(-89.25, 28.75, -86.75, 30.25),
  rectangle(-81, 28.75, -78.5, 30.25),
]);

export const overviewHeight = 6;
// Building colors from the YourTJ-Hub map palette.
const buildingPalette: Record<string, string> = {
  library: '#dfb58e',
  panshui: '#e8c990',
  caiqin: '#c5cddb',
  gym: '#e4b89e',
  'east-gate': '#d6d8cf',
  'north-gate': '#d6d8cf',
  'south-gate': '#d6d8cf',
  'weichang-gate': '#d6d8cf',
  zhide: '#d6d8cf',
};
function area(ring: Ring) {
  return Math.abs(
    ring.slice(1).reduce((sum, [x, y], i) => sum + ring[i][0] * y - x * ring[i][1], 0) / 2,
  );
}

const simplified: SurveyFeature[] = [];
for (const [place, polygons] of buildings) {
  const joined =
    place === 'laixiu'
      ? clipping.difference(polygons, buildings.get('library')!)
      : clipping.union(polygons);
  const clearance = roadClearance(joined);
  const parts = clearance.length ? clipping.difference(joined, clearance) : joined;
  for (const rings of parts) {
    if (area(rings[0]) < 1) continue;
    simplified.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: rings.map((ring) => ring.map(toMap)) },
      properties: {
        place,
        kind: 'building',
        color: buildingPalette[place] ?? '#ede3cc',
        height: overviewHeight,
      },
    });
  }
}

// Represent each pond as a simple geometric fill. Preserve the two separate basins at 泮池.
const pondPlans = new Map<string, Ring[]>([
  [
    'bixia',
    [
      [
        [-144, -86],
        [-132, -83],
        [-102, -81],
        [-94, -86],
        [-95, -97],
        [-104, -108],
        [-141, -110],
        [-144, -104],
      ],
    ],
  ],
]);
const retainedKinds = new Set([
  'campus',
  'context',
  'green',
  'garden',
  'water',
  'court',
  'track',
  'field',
  'infield',
  'field-stripe',
  'marking',
]);
for (const feature of campusData.features) {
  const { kind, place } = feature.properties;
  if (!retainedKinds.has(kind) || (kind === 'water' && place && pondPlans.has(place))) continue;
  if (kind === 'garden' && place !== 'daoshan') continue;
  if (kind === 'garden' && place === 'daoshan') {
    const hill: Ring = [
      [-143, -49],
      [-128, -37],
      [-105, -37],
      [-73, -49],
      [-77, -64],
      [-98, -74],
      [-132, -75],
      [-144, -64],
    ];
    simplified.push({
      ...feature,
      geometry: { type: 'Polygon', coordinates: [[...hill, hill[0]].map(toMap)] },
    });
  } else {
    simplified.push(feature);
  }
}
for (const [place, rings] of pondPlans) {
  for (const ring of rings) {
    simplified.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]].map(toMap)] },
      properties: { place, kind: 'water' },
    });
  }
}

export const overviewData: FeatureCollection<Geometry, Properties> = {
  type: 'FeatureCollection',
  features: simplified,
};
export const overviewRoadSurface: FeatureCollection<GeoPolygon, Properties> = {
  type: 'FeatureCollection',
  features: [
    ...streets.map((rings) => ({ rings, kind: 'street' })),
    ...paths.map((rings) => ({ rings, kind: 'path' })),
  ].map(({ rings, kind }) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: rings.map((ring) => ring.map(toMap)) },
    properties: { kind },
  })),
};
export function overviewBoundary(id: string) {
  return simplified.filter((f) => f.geometry.type === 'Polygon' && f.properties.place === id);
}
