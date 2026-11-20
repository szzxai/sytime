import type { Feature, Geometry, Polygon } from 'geojson';

// Local easting, northing and height in metres. Heights use campus paving as the datum.
export type PlanPoint = [number, number];
export type Vertex = [number, number, number];
export type Basis = 'scan' | 'aerial';
export type Properties = {
  kind: string;
  place?: string;
  name?: string;
  color?: string;
  height?: number;
  base?: number;
  width?: number;
  radius?: number;
  roofColor?: string;
  planOnly?: boolean;
  basis?: Basis;
};
export type SurveyFeature = Feature<Geometry, Properties>;
type Triangle = [Vertex, Vertex, Vertex];
export type Surface = { points: Triangle; color: string; place?: string };
export type Quad = [PlanPoint, PlanPoint, PlanPoint, PlanPoint];

export const scanOrigin: PlanPoint = [120.619360186, 31.298699551];
// Local linearization of EPSG:32651 at the LCC metadata offset (273410.957, 3465152.476).
export function coordinate([east, north]: PlanPoint): PlanPoint {
  return [
    scanOrigin[0] + east * 0.00001049872108 - north * 0.00000022674912,
    scanOrigin[1] + east * 0.00000019470335 + north * 0.00000901499102,
  ];
}

const wallColors = {
  plaster: '#e9deca',
  brick: '#c58566',
  stone: '#cfbea5',
  timber: '#9f6e54',
  white: '#eee8da',
};
const roofColors = { slate: '#686e71', red: '#b56648', zinc: '#829da8', flat: '#c5c0af' };
type Roof = keyof typeof roofColors;
type Wall = keyof typeof wallColors;
type RoofShape = 'hip' | 'gable' | 'curved' | 'barrel';

export function rect(x: number, y: number, width: number, depth: number): Quad {
  return [
    [x, y],
    [x + width, y],
    [x + width, y - depth],
    [x, y - depth],
  ];
}

export function mix(a: PlanPoint, b: PlanPoint, t: number): PlanPoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function inset(ring: Quad, along: number, across: number): Quad {
  const [a, b, c, d] = ring;
  return [
    mix(mix(a, b, along), mix(d, c, along), across),
    mix(mix(b, a, along), mix(c, d, along), across),
    mix(mix(c, d, along), mix(b, a, along), across),
    mix(mix(d, c, along), mix(a, b, along), across),
  ];
}

export function createCampusModel() {
  const features: SurveyFeature[] = [];
  const surfaces: Surface[] = [];
  const footprints = new Map<string, PlanPoint[][]>();
  const polygon = (outline: PlanPoint[], properties: Properties, holes: PlanPoint[][] = []) => {
    const coordinates = [outline, ...holes].map((points) => {
      const ring = points.map(coordinate);
      return [...ring, ring[0]];
    });
    const feature: Feature<Polygon, Properties> = {
      type: 'Feature',
      properties,
      geometry: { type: 'Polygon', coordinates },
    };
    features.push(feature);
    return feature;
  };
  function line(points: PlanPoint[], properties: Properties) {
    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'LineString', coordinates: points.map(coordinate) },
    });
  }
  function point(location: PlanPoint, properties: Properties) {
    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: coordinate(location) },
    });
  }
  function face(points: Triangle, color: string, place?: string) {
    surfaces.push({ points, color, place });
  }
  function quad(a: Vertex, b: Vertex, c: Vertex, d: Vertex, color: string, place?: string) {
    face([a, b, c], color, place);
    face([a, c, d], color, place);
  }
  function band(lower: Vertex[], upper: Vertex[], color: string, place?: string) {
    lower.forEach((a, i) => {
      const j = (i + 1) % lower.length;
      quad(a, lower[j], upper[j], upper[i], color, place);
    });
  }
  function wall(
    place: string,
    points: PlanPoint[],
    height: number,
    basis: Basis,
    options: { wall?: Wall; roof?: Roof; base?: number; detail?: boolean; planOnly?: boolean } = {},
  ) {
    const { wall = 'plaster', roof = 'flat', base = 0, detail = false, planOnly } = options;
    polygon(points, {
      kind: detail ? 'structure' : 'building',
      place,
      height,
      base,
      basis,
      color: wallColors[wall],
      roofColor: roofColors[roof],
      planOnly,
    });
    if (!detail) {
      const shapes = footprints.get(place) ?? [];
      // SVG thumbnails use screen coordinates, with north at the top.
      shapes.push(points.map(([x, y]) => [x, -y]));
      footprints.set(place, shapes);
    }
  }

  function roof(
    place: string,
    ring: Quad,
    eave: number,
    rise: number,
    material: Roof,
    shape: RoofShape,
  ) {
    const horizontal = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]);
    const vertical = Math.hypot(ring[3][0] - ring[0][0], ring[3][1] - ring[0][1]);
    const [a, b, c, d] = horizontal >= vertical ? ring : [ring[1], ring[2], ring[3], ring[0]];
    const length = Math.max(horizontal, vertical),
      span = Math.min(horizontal, vertical);
    const color = roofColors[material];
    if (shape === 'barrel') {
      // A shallow curved metal span with vertical glazed gable ends.
      for (let i = 0; i < 12; i++) {
        const u = i / 12,
          v = (i + 1) / 12;
        const z = eave + Math.sin(u * Math.PI) * rise;
        const nz = eave + Math.sin(v * Math.PI) * rise;
        const left = mix(a, d, u),
          right = mix(b, c, u);
        const nextLeft = mix(a, d, v),
          nextRight = mix(b, c, v);
        quad([...left, z], [...right, z], [...nextRight, nz], [...nextLeft, nz], color, place);
        quad(
          [...left, eave],
          [...left, z],
          [...nextLeft, nz],
          [...nextLeft, eave],
          '#aab7b6',
          place,
        );
        quad(
          [...right, eave],
          [...right, z],
          [...nextRight, nz],
          [...nextRight, eave],
          '#aab7b6',
          place,
        );
      }
      return;
    }

    const hip = shape === 'gable' ? 0 : Math.min(0.48, span / (2 * length));
    const outline = inset([a, b, c, d], -0.38 / length, -0.38 / span);
    const ridge = inset([a, b, c, d], hip, 0.5);
    const corners = outline.map((p): Vertex => [...p, eave]);
    const apex = ridge.map((p): Vertex => [...p, eave + rise]);
    if (shape === 'curved') {
      // Two sloping panels meet above turned-up eaves instead of concentric terraces.
      const knees = inset([a, b, c, d], hip * 0.32, 0.16).map((p): Vertex => [
        ...p,
        eave + rise * 0.2,
      ]);
      corners.forEach((p) => {
        p[2] += 0.18;
      });
      band(corners, knees, color, place);
      band(knees, apex, color, place);
    } else {
      band(corners, apex, color, place);
    }
  }

  function hall(
    place: string,
    ring: Quad,
    eave: number,
    rise: number,
    basis: Basis,
    material: Roof = 'slate',
    finish: Wall = 'plaster',
    shape: RoofShape = 'hip',
    base = 0,
  ) {
    wall(place, ring, eave, basis, { base, wall: finish, roof: material });
    roof(place, ring, eave, rise, material, shape);
  }

  function facade(
    place: string,
    [a, b, c, d]: Quad,
    count: number,
    sills: number[],
    windowHeight: number,
    color: string,
  ) {
    // Pull the windows just in front of the wall to avoid coincident mesh faces.
    for (const [left, right, inward] of [
      [a, b, d],
      [d, c, a],
    ]) {
      for (let i = 0; i < count; i++) {
        const p = mix(mix(left, right, (i + 0.26) / count), inward, -0.011);
        const q = mix(mix(left, right, (i + 0.71) / count), inward, -0.011);
        for (const sill of sills)
          quad(
            [...p, sill],
            [...q, sill],
            [...q, sill + windowHeight],
            [...p, sill + windowHeight],
            color,
            place,
          );
      }
    }
  }

  function tree(location: PlanPoint, radius: number, height: number, base = 0, color = '#7e9b63') {
    point(location, { kind: 'tree', radius });
    const ring = (r: number, z: number) =>
      Array.from({ length: 9 }, (_, i): Vertex => {
        const a = (i * 2 * Math.PI) / 9;
        return [location[0] + r * Math.cos(a), location[1] + r * Math.sin(a), z];
      });
    const crown = ring(radius, base + height * 0.64);
    const shoulder = ring(radius * 0.7, base + height * 0.85);
    band(ring(radius * 0.48, base + height * 0.42), crown, color);
    band(crown, shoulder, color);
    shoulder.forEach((p, i) =>
      face([p, shoulder[(i + 1) % 9], [...location, base + height]], color),
    );
    const trunk = ring(radius * 0.08, base);
    band(trunk, ring(radius * 0.07, base + height * 0.53), '#85705a');
  }

  function treeRow(a: PlanPoint, b: PlanPoint, count: number, radius: number, height: number) {
    for (let i = 0; i < count; i++) {
      const n = 1 + Math.sin(i * 8.3) * 0.12;
      tree(mix(a, b, i / (count - 1)), radius * n, height * n);
    }
  }

  function lawn(place: string, outline: Quad, basis: Basis) {
    polygon(outline, { kind: 'green', place, basis });
    const rim = outline.map((p): Vertex => [...p, 0.16]);
    const turf = inset(outline, 0.01, 0.014).map((p): Vertex => [...p, 0.12]);
    band(
      outline.map((p): Vertex => [...p, 0]),
      rim,
      '#aba88d',
      place,
    );
    band(rim, turf, '#cccaac', place);
    quad(turf[0], turf[1], turf[2], turf[3], '#bace9d', place);
  }

  function basin(place: string, outline: PlanPoint[], basis: Basis) {
    polygon(outline, { kind: 'water', place, basis });
    const center: PlanPoint = [0, 0];
    for (const [x, y] of outline) {
      center[0] += x / outline.length;
      center[1] += y / outline.length;
    }
    // Raise the coping around the flat water plane, leaving the complete surface visible.
    const outer = outline.map((p): Vertex => [...mix(p, center, -0.022), 0.28]);
    const inner = outline.map((p): Vertex => [...p, 0.28]);
    band(
      outer.map(([x, y]): Vertex => [x, y, 0]),
      outer,
      '#acaa94',
      place,
    );
    band(outer, inner, '#cfc9ae', place);
    band(
      inner,
      outline.map((p): Vertex => [...p, 0]),
      '#8a9b8f',
      place,
    );
  }

  function bridge(place: string, [a, b, c, d]: Quad, rise: number, basis: Basis) {
    polygon([a, b, c, d], { kind: 'bridge-deck', place, basis });
    for (let i = 0; i < 10; i++) {
      const t = i / 10,
        u = (i + 1) / 10;
      const z = 0.12 + Math.sin(t * Math.PI) * rise;
      const nz = 0.12 + Math.sin(u * Math.PI) * rise;
      const left = mix(a, d, t),
        right = mix(b, c, t);
      const nextLeft = mix(a, d, u),
        nextRight = mix(b, c, u);
      quad([...left, z], [...right, z], [...nextRight, nz], [...nextLeft, nz], '#d6cbb4', place);
      for (const [p, q] of [
        [left, nextLeft],
        [right, nextRight],
      ])
        quad([...p, z], [...q, nz], [...q, nz + 0.48], [...p, z + 0.48], '#bdb39c', place);
    }
  }
  return {
    features,
    surfaces,
    footprints,
    polygon,
    line,
    point,
    quad,
    face,
    wall,
    roof,
    hall,
    facade,
    tree,
    treeRow,
    lawn,
    basin,
    bridge,
  };
}
export type CampusModel = ReturnType<typeof createCampusModel>;
