import { elevation } from './architecture';
import { tiledRoof } from './detail-north';
import { type CampusModel, type PlanPoint, type Quad, type Vertex } from './model';

// Surveyed in plan, with the courtyard faces picked independently from the outer elevations.
const north: Quad = [
  [-77.9, 10.78],
  [-30.3, 14.49],
  [-29.8, 5.23],
  [-77.32, 1.49],
];
const south: Quad = [
  [-74.45, -13.13],
  [-29.92, -9.7],
  [-29.28, -19.94],
  [-73.84, -23.46],
];
const east: Quad = [
  [-36.6, 13.77],
  [-25.53, 14.63],
  [-25.42, -19.74],
  [-35.62, -20.5],
];

export const scienceWindows = {
  courtyardNorth: [-74.1, -52.8, -49.57, -46.34, -43.15, -40.02],
  courtyardSouth: [
    -64.1, -61.6, -59.22, -56.62, -54.66, -52.68, -50.62, -46.42, -44.5, -42.53, -40.52, -38.53,
    -36.61,
  ],
  roadSouth: [
    -73.5, -71.13, -69.2, -65.73, -62.06, -58.85, -56.8, -54.82, -52.88, -50.91, -46.51, -44.54,
    -42.54, -40.46, -38.43, -36.42, -32.78, -29.75,
  ],
  roadNorth: [-74.6, -72.0, -68.7, -65.74, -62.68, -59.57, -56.04, -44.08, -41.65],
};

export const scienceSeating = [
  {
    center: [-48.13, 0.93] as PlanPoint,
    seats: [
      [-48.24, 1.52],
      [-48.68, 0.78],
      [-47.97, 0.31],
    ] as PlanPoint[],
  },
  {
    center: [-46.26, 1.03] as PlanPoint,
    seats: [
      [-46.24, 1.67],
      [-46.74, 0.87],
      [-46.17, 0.38],
    ] as PlanPoint[],
  },
  {
    center: [-44.36, 1.14] as PlanPoint,
    seats: [
      [-44.38, 1.77],
      [-44.83, 0.96],
      [-44.25, 0.49],
    ] as PlanPoint[],
  },
];

export function addScience(model: CampusModel) {
  const place = 'science';
  const red = '#956a71',
    glass = '#394444',
    frame = '#aaa49a',
    light = '#d8d4c8';
  const rings = [
    { ring: north, eave: 7.83, rise: 2.21, hip: 0.08, lift: 0.21 },
    { ring: south, eave: 7.96, rise: 2.23, hip: 0.082, lift: 0.22 },
    { ring: east, eave: 8.09, rise: 3.3, hip: 0.125, lift: 0.31 },
  ];
  for (const { ring, eave, rise, hip, lift } of rings) {
    model.wall(place, ring, eave, 'scan', { wall: 'white', roof: 'slate', planOnly: true });
    for (const [i, a] of ring.entries()) {
      const b = ring[(i + 1) % ring.length];
      model.quad([...a, 0], [...b, 0], [...b, eave], [...a, eave], '#ecebe7', place);
    }
    const roofOutline: Quad = ring === east ? [east[1], east[2], east[3], east[0]] : ring;
    tiledRoof(
      model,
      place,
      roofOutline,
      eave,
      rise,
      hip,
      '#696965',
      lift,
      '#585c5c',
      ring === east ? 0.5 : 1,
    );
  }

  function facade(
    a: PlanPoint,
    b: PlanPoint,
    xs: number[],
    sills: number[],
    width: number,
    height: number,
    pilasters: number[],
    doorBays: number[] = [],
  ) {
    const el = elevation(model, place, a, b);
    const u = (x: number) => ((x - a[0]) / (b[0] - a[0])) * el.length;
    for (const x of xs)
      for (const [level, z] of sills.entries())
        if (level > 0 || !doorBays.includes(x)) el.opening(u(x), z, width, height, 3, glass, frame);
    for (const x of pilasters) {
      el.box(u(x) - 0.12, -0.23, 0.14, 0.24, 0.27, 7.58, red);
      el.box(u(x) - 0.21, -0.3, 0.015, 0.42, 0.34, 0.32, '#b8aa9f');
    }
    el.box(0, -0.15, 0, el.length, 0.19, 0.24, '#b9b5a9');
    el.box(0, -0.19, 7.63, el.length, 0.23, 0.16, light);
    return { el, u };
  }

  // Court south: paired rows of framed panes with rose pilasters and red-brown doors.
  const s = facade(
    south[1],
    south[0],
    scienceWindows.courtyardSouth,
    [1.04, 5.27],
    1.52,
    2.0,
    [
      -65.6, -63.15, -60.72, -58.15, -56.0, -53.98, -51.94, -47.53, -45.34, -43.34, -41.37, -39.39,
      -37.42, -35.7,
    ],
  );
  s.el.opening(s.u(-48.85), 0.16, 1.24, 2.68, 2, '#65463a', '#8a6556');

  const n = facade(
    north[3],
    north[2],
    scienceWindows.courtyardNorth,
    [1.05, 4.92],
    1.98,
    2.43,
    [-55.1, -51.6, -48.38, -45.23, -42.06, -38.82],
    [-74.1, -52.8],
  );
  n.el.opening(n.u(-74.1), 0.15, 1.15, 2.87, 2, '#713f36', '#a17f6f');
  n.el.opening(n.u(-53.04), 0.15, 1.26, 2.87, 2, '#71493c', '#a17f6f');
  facade(north[1], north[0], scienceWindows.roadNorth, [0.84, 4.94], 1.86, 1.92, []);
  const exterior = facade(
    south[3],
    south[2],
    scienceWindows.roadSouth,
    [1.08, 5.12],
    1.46,
    1.92,
    [
      -73.8, -69.8, -59.85, -57.88, -55.88, -53.93, -51.94, -47.31, -45.31, -43.35, -41.38, -39.42,
      -37.42,
    ],
  );
  for (const x of [-49.35, -48.5, -47.65])
    exterior.el.opening(exterior.u(x), 3.17, 0.52, 3.63, 1, '#4b4d47', '#a49b8c');

  // East return and portal seen against the arrival plaza. Lower roof lines have separate edges.
  const plaza = elevation(model, place, east[2], east[1]);
  plaza.box(13.2, -2.58, 0.04, 7.9, 2.6, 0.19, '#afa597');
  for (const x of [13.55, 19.2]) {
    plaza.box(x, -2.15, 0.19, 1.28, 2.15, 3.28, '#d1cec3');
    plaza.box(x - 0.12, -2.26, 3.4, 1.52, 2.28, 0.18, '#a6a496');
  }
  plaza.box(13.37, -2.24, 3.45, 7.25, 2.35, 0.55, '#d2cdc1');
  for (const u of [5.4, 8.3, 11.2, 23.1, 26.0, 28.9]) {
    plaza.opening(u, 1.06, 1.52, 1.97, 3, glass, frame);
    plaza.opening(u, 5.15, 1.52, 1.97, 3, glass, frame);
  }

  // Courtside planting beds and paved path traced from the overhead scan. Dark bands mark stone inlays.
  model.polygon(
    [
      [-77.21, 1.51],
      [-36.65, 4.72],
      [-36.01, -10.24],
      [-73.92, -13.2],
      [-78.18, -10.88],
    ],
    { kind: 'paving', place, basis: 'scan' },
  );
  model.polygon(
    [
      [-72.6, 0.97],
      [-56.5, 2.07],
      [-55.5, -1.13],
      [-70.45, -4.3],
      [-74.29, -2.85],
    ],
    { kind: 'garden', basis: 'scan' },
  );
  model.polygon(
    [
      [-43.35, 2.7],
      [-37.3, 3.2],
      [-36.87, -7.95],
      [-39.2, -9.2],
      [-43.5, -4.97],
    ],
    { kind: 'garden', basis: 'scan' },
  );
  model.polygon(
    [
      [-72.85, -7.36],
      [-58.52, -5.91],
      [-55.7, -8.27],
      [-59.5, -11.75],
      [-72.4, -12.2],
    ],
    { kind: 'garden', basis: 'scan' },
  );
  model.line(
    [
      [-54.9, 2.56],
      [-54.7, -8.35],
      [-50.2, -10.1],
      [-43.15, -9.49],
      [-36.42, -9.0],
    ],
    { kind: 'court-inlay', basis: 'scan' },
  );
  for (const [x, y, r, h] of [
    [-68.4, -1.2, 1.68, 4.2],
    [-64.6, -0.1, 1.75, 4.1],
    [-59.6, 0.73, 1.76, 4.0],
    [-64.5, -8.3, 1.85, 4.0],
    [-57.8, -7.65, 1.48, 3.48],
    [-40.62, -6.78, 1.8, 4.25],
    [-40.1, -3.05, 2.02, 4.44],
  ])
    model.tree([x, y], r, h, 0, '#7c8c57');

  // Three fixed circular tables, each surrounded by three stools. Diameters are
  // fitted to the individual silhouettes, with slim legs below the tops.
  const furniture = elevation(model, place, [0, 0], [1, 0]);
  for (const {
    center: [x, y],
    seats,
  } of scienceSeating) {
    furniture.cylinder(x, y, 0, 0.105, 0.68, '#b7b7aa');
    furniture.cylinder(x, y, 0.67, 0.31, 0.07, '#edece0');
    for (const [sx, sy] of seats) {
      furniture.cylinder(sx, sy, 0, 0.081, 0.41, '#aeb0a3');
      furniture.cylinder(sx, sy, 0.4, 0.18, 0.065, '#eceadf');
    }
  }

  // Threshold slabs and adjacent stone pads are independent of the walls.
  for (const [a, b, c, d] of [
    [
      [-55.08, 1.57],
      [-51.91, 1.85],
      [-51.78, 1.12],
      [-55.02, 0.91],
    ],
    [
      [-50.39, -11.15],
      [-47.41, -10.91],
      [-47.31, -10.29],
      [-50.35, -10.53],
    ],
  ] as Quad[])
    model.quad(
      ...([a, b, c, d].map((p): Vertex => [...p, 0.12]) as [Vertex, Vertex, Vertex, Vertex]),
      '#beb7a7',
      place,
    );
}
