import { elevation } from './architecture';
import { inset, mix, type CampusModel, type PlanPoint, type Quad, type Vertex } from './model';

// Registered LOD 0 picks. Values are in local metres above paving.
export const zhideProfile = {
  start: [-88.3, 26.26] as PlanPoint,
  end: [-78.05, 26.93] as PlanPoint,
  cornice: 4.34,
  thickness: 0.65,
  arches: [
    { center: 1.79, halfSpan: 1.0, spring: 2.03, rise: 0.94 },
    { center: 5.1, halfSpan: 1.32, spring: 2.18, rise: 1.23 },
    { center: 8.36, halfSpan: 1.0, spring: 2.03, rise: 0.94 },
  ],
};

export const ziyangFacades = [
  {
    place: 'west-ziyang',
    origin: [-147.2, 89.09] as PlanPoint,
    hi: [-99.9, 92.68] as PlanPoint,
    terrace: [16.8, 45.4],
    columns: [17.1, 21.1, 26.3, 31.5, 36.75, 42.05, 45.15],
    slabs: [2.53, 6.13, 9.73],
    guards: [1.09, 1.11, 1.1],
    observedWindows: [
      [23.8, 26.9, 29.4, 34.2, 37.1],
      [23.8, 26.9, 29.4, 34.2, 37.1],
      [26.9, 34.2],
    ],
  },
  {
    place: 'east-ziyang',
    origin: [-85, 96.2] as PlanPoint,
    hi: [-37.1, 100.03] as PlanPoint,
    terrace: [10.05, 36.0],
    columns: [10.23, 12.61, 17.76, 22.98, 28.17, 33.37, 35.77],
    slabs: [2.56, 6.16, 9.77],
    guards: [1.08, 1.12, 1.11],
    observedWindows: [
      [12.6, 17.4, 20.5, 24.0, 27.1, 31.7],
      [15.9, 18.9, 24.0, 26.2, 28.6, 31.7],
      [18.9, 24.0, 26.2, 28.6],
    ],
  },
];

export function addZiyang(model: CampusModel) {
  const plaster = '#dddcd0',
    column = '#b9b6a8',
    face = '#cecbbe';
  for (const {
    place,
    origin,
    hi,
    terrace: [a, b],
    columns,
    slabs,
    guards,
    observedWindows,
  } of ziyangFacades) {
    const el = elevation(model, place, origin, hi);
    const { length, box, opening } = el;
    const rearWall = elevation(
      model,
      place,
      el.world([0, 2.25, 0]).slice(0, 2) as PlanPoint,
      el.world([length, 2.25, 0]).slice(0, 2) as PlanPoint,
    );
    const depth = 12.4,
      eave = 13.55;
    // Open circulation galleries: recessed classroom wall plus floor slabs, columns and guards.
    const plan = [
      el.world([0, depth, 0]).slice(0, 2),
      el.world([length, depth, 0]).slice(0, 2),
      hi,
      origin,
    ] as Quad;
    model.wall(place, plan, eave, 'scan', { wall: 'white', roof: 'slate', planOnly: true });
    box(0, 2.25, 0, length, depth - 2.25, eave, plaster);
    box(0, 0, 0, a, 2.25, eave, plaster);
    box(b, 0, 0, length - b, 2.25, eave, plaster);
    box(a, 0, 0, b - a, 2.25, 2.51, '#b6b5a9');
    box(0, -0.2, eave - 0.34, length, depth + 0.5, 0.34, '#cbc9ba');
    for (const x of columns) {
      box(x - 0.17, -0.09, 0.12, 0.34, 0.43, eave - 0.45, column);
      box(x - 0.23, -0.15, 0, 0.46, 0.55, 0.17, '#8e8d81');
    }
    for (const [i, z] of slabs.entries()) {
      box(a, -0.15, z - 0.24, b - a, 2.4, 0.24, face);
      const panels = Math.round((b - a) / 1.32),
        pitch = (b - a) / panels;
      for (let p = 0; p < panels; p++) {
        const x = a + p * pitch;
        box(x + 0.018, 0.014, z + 0.09, pitch - 0.036, 0.06, guards[i] - 0.13, '#bec5bf');
        box(x, -0.015, z, 0.035, 0.112, guards[i], '#8a8e89');
      }
      box(a, 0.009, z + guards[i] - 0.043, b - a, 0.092, 0.043, '#7d827c');
      for (const x of observedWindows[i]) {
        // A separate frame referenced to the classroom wall behind the gallery.
        rearWall.opening(x, z + 0.82, 1.92, 1.73, 3, '#535c59', '#d5d4c8');
      }
    }
    for (let x = a + 0.67; x < b - 0.4; x += 1.62)
      opening(x, 0.32, 1.25, 1.85, 2, '#54776f', '#b3c2b1');
    // Air-photo roof silhouette and shallow stair volumes at the court edge.
    tiledRoof(model, place, plan, eave, 3.0, 0.0, '#77746c');
    for (const x of place === 'west-ziyang' ? [2.1, 38.3] : [1.55, 39.8]) {
      box(x, -3.85, 0, 5.35, 3.85, 8.35, '#9e7965');
      box(x - 0.11, -3.96, 8.35, 5.57, 4.12, 0.28, '#d8d4c4');
      box(x + 0.48, -3.98, 0.12, 0.7, 0.1, 7.95, '#778c8f');
    }
  }
}

export function tiledRoof(
  model: CampusModel,
  place: string,
  outline: Quad,
  eave: number,
  rise: number,
  hip: number,
  color: string,
  cornerLift = 0,
  seam = '#676864',
  gableShoulder = 1,
) {
  const overhang = inset(outline, -0.011, -0.07);
  const [a, b, c, d] = overhang;
  const line = inset(outline, hip, 0.5);
  const slopes = [
    [a, b, line[0], line[1]],
    [d, c, line[3], line[2]],
  ];
  const edge = (
    p: PlanPoint,
    q: PlanPoint,
    r: PlanPoint,
    s: PlanPoint,
    u: number,
    v: number,
  ): Vertex => {
    const eaves = mix(p, q, u);
    const ridge = mix(r, s, u);
    const xy = mix(eaves, ridge, v);
    if (gableShoulder < 1) {
      const span = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const dx = (q[0] - p[0]) / (span || 1),
        dy = (q[1] - p[1]) / (span || 1);
      const along =
        ((ridge[0] - eaves[0]) * dx + (ridge[1] - eaves[1]) * dy) *
        (Math.min(v / gableShoulder, 1) - v);
      xy[0] += along * dx;
      xy[1] += along * dy;
    }
    const end = Math.pow(Math.abs(u * 2 - 1), 5);
    return [
      ...xy,
      eave + rise * (cornerLift ? 0.65 * v + 0.35 * v * v : v) + cornerLift * end * (1 - v),
    ];
  };
  for (const [p, q, r, s] of slopes) {
    const at = (u: number, v: number) => edge(p, q, r, s, u, v);
    const length = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const bays = Math.ceil(length / 0.38),
      rows = cornerLift ? 8 : 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < bays; i++) {
        const u = i / bays,
          v = j / rows,
          endU = (i + 1) / bays,
          endV = (j + 1) / rows;
        const divider = u + (endU - u) * 0.22;
        model.quad(at(u, v), at(divider, v), at(divider, endV), at(u, endV), seam, place);
        model.quad(at(divider, v), at(endU, v), at(endU, endV), at(divider, endV), color, place);
      }
    }
  }
  for (const u of [0, 1]) {
    const front = (v: number) => edge(a, b, line[0], line[1], u, v);
    const back = (v: number) => edge(d, c, line[3], line[2], u, v);
    const rows = cornerLift ? 8 : 1;
    for (let i = 0; i < rows; i++) {
      const v = i / rows;
      const next = (i + 1) / rows;
      const left = front(v),
        right = back(v),
        top = front(next);
      const finish = v >= gableShoulder ? '#70544a' : color;
      if (i === rows - 1) model.face([left, right, top], finish, place);
      else model.quad(left, right, back(next), top, finish, place);
    }
  }
  const ridge = elevation(model, place, line[0], line[1]);
  ridge.box(0, -0.087, eave + rise - 0.04, ridge.length, 0.174, 0.19, '#969185');
}

export function addZhide(model: CampusModel) {
  const { start, end, cornice, thickness, arches } = zhideProfile;
  const place = 'zhide';
  const el = elevation(model, place, start, end);
  const { length, world, box, solid, face } = el;
  const stone = '#777971',
    base = '#a8a59a';
  const half = thickness / 2;
  const cap = 5.3;
  const at = (x: number, y: number): PlanPoint => world([x, y, 0]).slice(0, 2) as PlanPoint;
  model.wall(
    place,
    [at(0, half), at(length, half), at(length, -half), at(0, -half)],
    cornice,
    'scan',
    { wall: 'stone', roof: 'slate', planOnly: true },
  );
  model.point(at(5.1, 0), { kind: 'place', place });

  let edge = 0;
  const piers: [number, number][] = [];
  for (const { center, halfSpan, spring, rise } of arches) {
    const l = center - halfSpan,
      r = center + halfSpan;
    piers.push([edge, l]);
    edge = r;
    const top = (u: number) =>
      spring + rise * Math.sqrt(Math.max(0, 1 - ((u - center) / halfSpan) ** 2));
    for (let i = 0; i < 32; i++) {
      const left = center - halfSpan * Math.cos((i * Math.PI) / 32);
      const right = center - halfSpan * Math.cos(((i + 1) * Math.PI) / 32);
      solid(
        [
          [left, top(left)],
          [right, top(right)],
          [right, cornice],
          [left, cornice],
        ],
        -half,
        half,
        stone,
      );
    }
    // Voussoirs around each opening. Each wedge has its own brick seam.
    const arc = (t: number, offset: number): [number, number] => [
      center - (halfSpan + offset) * Math.cos(t),
      spring + (rise + offset) * Math.sin(t),
    ];
    for (let i = 0; i < 19; i++) {
      const a = ((i + 0.035) * Math.PI) / 19,
        b = ((i + 0.965) * Math.PI) / 19;
      solid(
        [arc(a, 0), arc(b, 0), arc(b, 0.22), arc(a, 0.22)],
        -half - 0.032,
        half + 0.032,
        i % 3 === 0 ? '#98968a' : '#898981',
      );
    }
    for (const x of [l, r])
      box(x - 0.16, -half - 0.09, spring - 0.115, 0.32, thickness + 0.18, 0.12, '#a09f91');
  }
  piers.push([edge, length]);
  for (const [from, to] of piers) {
    box(from, -half, 0, to - from, thickness, cornice, stone);
    box(from - 0.085, -half - 0.11, 0, to - from + 0.17, thickness + 0.22, 0.31, base);
    const center = (from + to) / 2;
    box(center - 0.2, -half - 0.06, 0.31, 0.4, thickness + 0.12, cap - 0.16, '#81827a');
    box(center - 0.277, -half - 0.13, cap + 0.09, 0.554, thickness + 0.26, 0.14, base);
  }
  for (const [z, h, offset] of [
    [4.31, 0.13, 0.095],
    [4.46, 0.08, 0.085],
    [5.27, 0.11, 0.08],
  ])
    box(-0.09, -half - offset, z, length + 0.18, thickness + 2 * offset, h, '#a5a397');
  box(0, -half + 0.06, 4.43, length, thickness - 0.12, 0.86, '#c0beb1');
  const profile: [number, number][] = [
    [3.75, 5.24],
    [6.45, 5.24],
    [6.45, 5.47],
    [6, 5.67],
    [5.48, 6.01],
    [5.11, 6.22],
    [4.81, 6.12],
    [4.28, 5.75],
    [3.75, 5.46],
  ];
  // Triangulate the curved crown in strips so the brickwork stays solid below the cap.
  for (let i = 2; i < profile.length - 1; i++) {
    const [x, z] = profile[i],
      [nx, nz] = profile[i + 1];
    solid(
      [
        [x, 5.25],
        [nx, 5.25],
        [nx, nz],
        [x, z],
      ],
      -0.26,
      0.26,
      '#bebbb0',
    );
    solid(
      [
        [x, z],
        [nx, nz],
        [nx, nz + 0.075],
        [x, z + 0.075],
      ],
      -0.31,
      0.31,
      '#71736a',
    );
  }

  // Thin masonry highlights follow individual courses without filling the arch openings.
  for (let z = 0.38, row = 0; z < 4.27; z += 0.124, row++) {
    for (let x = (row % 2) * 0.155; x + 0.25 < length; x += 0.31) {
      const r = x + 0.27;
      const overlaps = arches.some(({ center, halfSpan, spring, rise }) => {
        const dx = Math.max(0, x - center, center - r) / (halfSpan + 0.24);
        return dx < 1 && z < spring + (rise + 0.24) * Math.sqrt(1 - dx * dx);
      });
      if (overlaps) continue;
      for (const y of [-half - 0.008, half + 0.008])
        face(
          [x, y, z],
          [r, y, z],
          [r, y, z + 0.102],
          [x, y, z + 0.102],
          (row + Math.round(x * 7)) % 4 === 0 ? '#82847a' : '#74766e',
        );
    }
  }

  // Recessed panel below the shaped crown.
  for (const y of [-half + 0.047, half - 0.07]) {
    box(3.91, y, 4.59, 2.35, 0.025, 0.52, '#a5a79c');
    box(4.0, y - 0.013, 4.66, 2.17, 0.052, 0.38, '#c8c6ba');
  }
}

export function addNorthGate(model: CampusModel) {
  const place = 'north-gate';
  const start: PlanPoint = [-92.9, 93.4],
    end: PlanPoint = [-85.1, 94.57];
  const el = elevation(model, place, start, end);
  const { box, length, world, solid, opening } = el;
  const depth = 6.9,
    eave = 15.82,
    masonry = '#83827d';
  const back = (u: number) => world([u, depth, 0]).slice(0, 2) as PlanPoint;
  const outline: Quad = [back(0), back(length), end, start];
  model.wall(place, outline, eave, 'scan', { wall: 'stone', roof: 'slate', planOnly: true });

  const l = 1.48,
    r = length - 1.42,
    spring = 3.02,
    rise = 2.31;
  const center = (l + r) / 2;
  box(0, 0, 0, l, depth, 6.05, masonry);
  box(r, 0, 0, length - r, depth, 6.05, masonry);
  const arch = (t: number, trim: number): [number, number] => [
    center - ((r - l) / 2 + trim) * Math.cos(t),
    spring + (rise + trim) * Math.sin(t),
  ];
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 32,
      b = ((i + 1) * Math.PI) / 32;
    const left = arch(a, 0),
      right = arch(b, 0);
    solid([left, right, [right[0], 6.05], [left[0], 6.05]], 0, depth, masonry);
    solid(
      [left, right, arch(b, 0.17), arch(a, 0.17)],
      -0.055,
      0.012,
      i % 4 === 0 ? '#aaa79d' : '#97968d',
    );
  }
  box(0, 0, 6.05, length, depth, eave - 6.05, '#aaa8a1');
  box(-0.1, -0.19, 5.69, length + 0.2, depth + 0.38, 0.36, '#a3a196');
  box(-0.12, -0.16, 15.35, length + 0.24, depth + 0.32, 0.47, '#b9b5a7');
  for (const u of [0.17, 1.55, 2.92, 4.32, 5.75, length - 0.17])
    box(u - 0.14, -0.13, 6.04, 0.28, 0.19, 9.34, '#8e8c84');
  for (const u of [0.86, 2.23, 3.62, 5.04, 6.46]) {
    for (const z of [6.44, 8.66, 10.9, 13.14]) opening(u, z, 0.85, 1.79, 2, '#46525a', '#9a9d99');
  }
  tiledRoof(model, place, outline, eave, 2.18, 0.19, '#676b68');
}

export function addRedHalls(model: CampusModel) {
  const halls = [
    {
      place: 'west-red',
      front: [-145.35, 64.0] as PlanPoint,
      end: [-95.25, 67.36] as PlanPoint,
      posts: [
        0.35, 3.84, 7.18, 10.63, 14.12, 17.63, 20.96, 24.54, 28, 31.43, 34.9, 38.3, 41.78, 45.18,
        49.7,
      ],
    },
    {
      place: 'east-red',
      front: [-82.24, 68.3] as PlanPoint,
      end: [-33.08, 71.6] as PlanPoint,
      posts: [
        0.31, 3.65, 7.02, 10.41, 13.87, 17.29, 20.74, 24.14, 27.65, 31.18, 34.68, 38.12, 41.61,
        45.07, 48.95,
      ],
    },
  ];
  const eave = 8.43,
    flight = 3.98,
    brick = '#985c49',
    coping = '#d8d8cc',
    depth = 9.45,
    walk = 1.97;
  for (const { place, front, end, posts } of halls) {
    const el = elevation(model, place, front, end);
    const { length, world, box, solid } = el;
    const at = (u: number, v: number) => world([u, v, 0]).slice(0, 2) as PlanPoint;
    const outline: Quad = [at(0, depth), at(length, depth), end, front];
    model.wall(place, outline, eave, 'scan', { wall: 'brick', roof: 'red', planOnly: true });
    box(0, 0, 0, length, depth, 0.39, '#91877a');
    box(0, walk, 0.39, length, depth - walk, eave - 0.39, brick);
    box(0, 0, flight - 0.22, length, walk, 0.22, '#9d715f');
    box(0, -0.07, eave - 0.26, length, walk + 0.1, 0.26, '#765e4d');

    const back = elevation(model, place, outline[1], outline[0]);
    const gallery = elevation(model, place, at(0, walk), at(length, walk));
    for (const u of posts) {
      box(u - 0.25, -0.04, 0.39, 0.5, 0.59, eave - 0.39, brick);
      box(u - 0.32, -0.09, 0.39, 0.64, 0.66, 0.23, '#9b8676');
    }
    for (let i = 1; i < posts.length; i++) {
      const left = posts[i - 1] + 0.25,
        right = posts[i] - 0.25;
      const u = (left + right) / 2;
      const span = right - left;
      // Open masonry lattice. The diamond and short crosspieces are separate solids.
      for (const z of [flight + 0.05, flight + 1.12]) box(left, 0.075, z, span, 0.23, 0.09, coping);
      for (const x of [left + 0.12, u - 0.76, u + 0.76, right - 0.24])
        box(x, 0.08, flight + 0.14, 0.11, 0.21, 0.98, coping);
      const diamond: [number, number][] = [
        [u - 0.67, flight + 0.63],
        [u, flight + 1.1],
        [u + 0.67, flight + 0.63],
        [u, flight + 0.17],
      ];
      for (const [j, [x, z]] of diamond.entries()) {
        const [nx, nz] = diamond[(j + 1) % diamond.length];
        const dx = (u - x) * 0.22,
          dz = (flight + 0.63 - z) * 0.22;
        solid(
          [
            [x, z],
            [nx, nz],
            [nx + (u - nx) * 0.22, nz + (flight + 0.63 - nz) * 0.22],
            [x + dx, z + dz],
          ],
          0.08,
          0.29,
          coping,
        );
      }
      box(left + 0.12, 0.08, flight + 0.59, Math.max(0.1, span / 2 - 0.78), 0.21, 0.1, coping);
      box(u + 0.76, 0.08, flight + 0.59, Math.max(0.1, span / 2 - 0.88), 0.21, 0.1, coping);

      for (const [facade, x] of [
        [gallery, u],
        [back, length - u],
      ] as const) {
        for (const z of [0.98, 5.18]) facade.opening(x, z, 1.76, 2.08, 3, '#47504a', '#827064');
      }
    }
    tiledRoof(model, place, outline, eave, 2.08, 0.09, '#a26b4f', 0, '#83543e');
  }
}
