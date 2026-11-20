import {
  inset,
  mix,
  rect,
  type CampusModel,
  type PlanPoint,
  type Quad,
  type Vertex,
} from './model';

import { addScience } from './detail-science';
import { addNorthGate, addRedHalls, addZhide, addZiyang } from './detail-north';
// The paths from both source districts meet at the same point south of the pond and pavilion.
export const libraryJunction: PlanPoint = [-75, -110];

// Control lines picked in metre coordinates from the LCC overhead and elevation sections.
export function addScanDistrict(model: CampusModel) {
  const { hall, wall, roof, polygon, line, point, tree, treeRow, lawn, basin } = model;
  const scan = 'scan',
    aerial = 'aerial';
  const path = (points: PlanPoint[], width: number, kind = 'path') =>
    line(points, { kind, width, basis: scan });
  const label = (place: string, at: PlanPoint) => point(at, { kind: 'place', place });

  addZiyang(model);
  addNorthGate(model);
  hall(
    'weichang-gate',
    rect(-158, 98, 4.8, 5.5),
    2.9,
    1.1,
    aerial,
    'slate',
    'white',
    'curved',
    2.2,
  );
  for (const x of [-158, -154.2])
    wall('weichang-gate', rect(x, 98, 0.9, 5.5), 2.5, aerial, { detail: true });

  addRedHalls(model);

  hall(
    'weichang',
    [
      [-191, 87],
      [-156, 89],
      [-155, 73],
      [-190, 72],
    ],
    13,
    3,
    aerial,
    'zinc',
    'white',
  );
  wall(
    'weichang',
    [
      [-164.5, 73],
      [-154, 74],
      [-153.5, 37],
      [-164.5, 36],
    ],
    10.1,
    scan,
    { wall: 'white' },
  );
  wall(
    'weichang',
    [
      [-198, 64],
      [-162, 65],
      [-162, 57],
      [-198, 56],
    ],
    7.8,
    scan,
  );
  wall(
    'weichang',
    [
      [-198, 42],
      [-161, 43],
      [-161, 35],
      [-198, 34],
    ],
    6.7,
    scan,
  );
  polygon(
    [
      [-194, 55],
      [-166, 57],
      [-166, 44],
      [-194, 43],
    ],
    { kind: 'garden', basis: scan },
  );

  // Lab: four distinct wings and a planted well, visible in the overhead reference.
  wall(
    'laboratory',
    [
      [-183, 28],
      [-160, 29],
      [-160, 22],
      [-183, 21],
    ],
    9.8,
    scan,
  );
  wall(
    'laboratory',
    [
      [-184, 24],
      [-176, 23],
      [-176, 0],
      [-183, 0],
    ],
    9.2,
    scan,
  );
  wall(
    'laboratory',
    [
      [-166, 22],
      [-160, 22],
      [-159, -3],
      [-165, -2],
    ],
    11.4,
    scan,
  );
  wall(
    'laboratory',
    [
      [-183, 1],
      [-165, 2],
      [-165, -6],
      [-182, -7],
    ],
    9.8,
    scan,
  );
  polygon(
    [
      [-175, 21],
      [-167, 21],
      [-166, 2],
      [-175, 2],
    ],
    { kind: 'green', basis: scan },
  );
  hall(
    'zhengdao',
    [
      [-178, -9],
      [-158, -8],
      [-157, -20],
      [-177, -21],
    ],
    6.4,
    2.25,
    aerial,
    'zinc',
    'white',
  );

  const sanyuan = [
    [-28, 126],
    [-0.5, 128],
    [0.5, 41],
    [-22, 40],
    [-24, 102],
    [-29, 102],
  ] satisfies PlanPoint[];
  wall('sanyuan', sanyuan, 12.8, aerial, { wall: 'white' });
  hall(
    'sanyuan',
    [
      [-30, 125],
      [0, 127],
      [0.3, 106],
      [-29.5, 104],
    ],
    16.7,
    3.9,
    aerial,
    'slate',
    'white',
    'hip',
    12.8,
  );
  for (const north of [97, 80, 63]) {
    const x = -23 + (97 - north) * 0.025;
    hall('sanyuan', rect(x, north, 23.4, 11.8), 14.6, 2.7, aerial, 'slate', 'white', 'hip', 12.8);
  }
  wall('sanyuan', rect(-15, 52, 13, 10), 14.7, aerial, { wall: 'white', detail: true });

  addScience(model);

  // Model the large eastern arrival court, its gatehouse and its low open boundary.
  polygon(
    [
      [-24, 36],
      [6, 37],
      [12, 29],
      [13, -11],
      [6, -22],
      [-17, -23],
      [-20, -8],
    ],
    {
      kind: 'paving',
      place: 'east-gate',
      basis: scan,
    },
  );
  hall(
    'east-gate',
    [
      [7, 33],
      [14, 33.4],
      [14.5, 26.2],
      [7.5, 26],
    ],
    2.8,
    1.15,
    scan,
    'slate',
    'white',
    'curved',
  );
  for (const y of [22, 7, -5])
    wall('east-gate', rect(14, y, 1.1, 1.1), 1.8, scan, { wall: 'stone', detail: true });
  polygon(rect(-9.2, 20.5, 5.2, 5.2), { kind: 'green', basis: scan });
  polygon(rect(-7.2, 4.5, 5.2, 4.2), { kind: 'garden', basis: scan });
  hall(
    'xiwen',
    [
      [5, -10],
      [21, -9.2],
      [22, -29],
      [6, -30],
    ],
    7.9,
    2,
    aerial,
  );

  addZhide(model);

  // The two turf panels sit inside separately traced bands of paving and planted borders.
  const lawns: [string, Quad][] = [
    [
      'west-lawn',
      [
        [-144, 58],
        [-100, 60.7],
        [-97.6, 29],
        [-141, 25.7],
      ],
    ],
    [
      'east-lawn',
      [
        [-77, 63],
        [-29.5, 65.5],
        [-27.3, 34],
        [-74.8, 30.4],
      ],
    ],
  ];
  for (const [place, ring] of lawns) {
    polygon(inset(ring, -0.1, -0.11), { kind: 'paving', basis: scan });
    lawn(place, ring, scan);
    const [a, b, c, d] = ring;
    label(place, mix(a, c, 0.5));
    treeRow(mix(a, d, 0.12), mix(a, d, 0.88), 6, 2.7, 6.5);
    treeRow(mix(b, c, 0.12), mix(b, c, 0.88), 6, 2.9, 7.8);
    treeRow(mix(d, a, 0.04), mix(c, b, 0.04), 8, 2.6, 5.8);
  }
  polygon(
    [
      [-150, 90],
      [-28, 98],
      [-28, 83],
      [-149, 78],
    ],
    { kind: 'paving', basis: scan },
  );
  path(
    [
      [-151, 86],
      [-100, 88.8],
      [-58, 92.4],
      [-26, 94],
    ],
    5,
  );
  path(
    [
      [-153, 92],
      [-151, 61],
      [-152, 28],
      [-151, -13],
      [-152, -46],
      [-151, -112],
    ],
    5.1,
  );
  path(
    [
      [-90, 93],
      [-87, 62],
      [-83.5, 33],
      [-83.2, 26.6],
      [-82.8, 15],
      [-81, -30],
      [-78, -75],
      libraryJunction,
    ],
    5.0,
  );
  path(
    [
      [-26, 101],
      [-24, 65],
      [-21, 35],
      [-18, -12],
      [-17, -31],
      [-15, -58],
      [-17, -101],
    ],
    4.8,
  );
  path(
    [
      [-151, 61],
      [-90, 65],
      [-24, 68.4],
    ],
    4.1,
  );
  path(
    [
      [-149, 23],
      [-87, 27],
      [-22, 31],
    ],
    4.6,
  );
  path(
    [
      [-147, -34],
      [-81, -29],
      [-18, -24],
    ],
    3.6,
  );
  path(
    [
      [-150, -76],
      [-78, -73],
      [-16, -69],
    ],
    3.5,
  );
  path([[-150, -108], libraryJunction, [-18, -101]], 4.0);

  // Include the pink north plot from the annotated campus map in the pond.
  basin(
    'chunyu',
    [
      [-146.4, 10.1],
      [-87, 15.2],
      [-86, -2.1],
      [-89.5, -16],
      [-89.4, -24],
      [-98, -27],
      [-123, -29],
      [-143, -29.5],
      [-146, -24],
    ],
    scan,
  );
  label('chunyu', [-119, -8]);
  // Pond pavilion: the roof and deck are separate and the water remains open between posts.
  const pavilion = rect(-121.5, -16, 5.6, 5.2);
  wall('chunyu', pavilion, 0.55, scan, { wall: 'stone', detail: true });
  roof('chunyu', pavilion, 3.1, 1.75, 'slate', 'curved');
  for (const [x, y] of inset(pavilion, 0.1, 0.1))
    wall('chunyu', rect(x - 0.13, y + 0.13, 0.26, 0.26), 3.1, scan, {
      wall: 'timber',
      detail: true,
    });

  basin(
    'bixia',
    [
      [-145, -83],
      [-135, -81],
      [-117, -80],
      [-101, -79],
      [-96, -82],
      [-95, -90],
      [-99, -101],
      [-106, -106],
      [-136, -108],
      [-144, -105],
      [-146, -96],
    ],
    scan,
  );
  label('bixia', [-123, -93]);
  for (const [at, radius, height] of [
    [[-148.5, -7], 3.5, 9],
    [[-85, -4], 3.2, 9.7],
    [[-104, -30], 3.6, 7.8],
    [[-147.5, -92], 4.2, 8.6],
    [[-106, -77.5], 4, 10],
    [[-97, -101], 4, 9],
    [[-132, -110], 3.6, 7],
  ] as [PlanPoint, number, number][])
    tree(at, radius, height);

  addDaoshan(model);
  for (const y of [-34, -54]) {
    for (const x of [-73, -44]) polygon(rect(x, y, 24, 16.5), { kind: 'garden', basis: scan });
  }
  path(
    [
      [-75, -51],
      [-23, -49],
    ],
    2.1,
    'walk',
  );
  path(
    [
      [-46, -30],
      [-44.5, -70],
    ],
    2.3,
    'walk',
  );
  for (const y of [-41, -62])
    for (const x of [-69, -59, -49, -38, -27])
      tree([x, y + Math.sin(x) * 2], 3.0, 7.0 + Math.cos(x) * 1.2);

  // Zunjing's 14–15 m ridge is visible in the scan. Separate eaves, terrace and upper drum.
  polygon(
    [
      [-67, -74],
      [-34, -73],
      [-33, -99],
      [-66, -100],
    ],
    { kind: 'paving', basis: scan },
  );
  wall('zunjing', rect(-63.5, -77, 25, 18.6), 0.95, scan, { wall: 'stone', detail: true });
  hall(
    'zunjing',
    [
      [-62, -78],
      [-39, -77.3],
      [-38.5, -90.9],
      [-61.7, -91.7],
    ],
    6.5,
    2.1,
    scan,
    'slate',
    'timber',
    'curved',
    0.95,
  );
  hall(
    'zunjing',
    [
      [-59.5, -79.7],
      [-41.3, -79.2],
      [-41, -89.2],
      [-59.1, -89.7],
    ],
    10.9,
    3.9,
    scan,
    'slate',
    'timber',
    'curved',
    7.7,
  );
  for (let i = 0; i < 4; i++)
    wall('zunjing', rect(-55.3, -95.1 - i * 0.53, 9.5, 0.53), 0.76 - i * 0.18, scan, {
      wall: 'stone',
      detail: true,
    });
  hall(
    'stele-gallery',
    [
      [-34, -76],
      [-30, -75.9],
      [-29.2, -97],
      [-33.2, -97.2],
    ],
    3.3,
    1.2,
    scan,
    'slate',
    'stone',
  );

  // Courts: visible edges and north–south circulation, aerial markings where trees occlude lines.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const x = -194 + col * 18.7,
        y = -31 - row * 26.8;
      polygon(rect(x, y, 17.5, 25.4), { kind: 'court', place: 'basketball', basis: scan });
      const boundary = rect(x + 1.3, y - 1, 14.9, 23.4);
      line([...boundary, boundary[0]], { kind: 'marking' });
      line(
        [
          [x + 1.3, y - 12.7],
          [x + 16.2, y - 12.7],
        ],
        { kind: 'marking' },
      );
      const circle = Array.from({ length: 25 }, (_, i): PlanPoint => {
        const a = (i / 24) * 2 * Math.PI;
        return [x + 8.75 + Math.cos(a) * 1.8, y - 12.7 + Math.sin(a) * 1.8];
      });
      line(circle, { kind: 'marking' });
    }
  }
  polygon(rect(-190, -115, 30, 24), { kind: 'court', place: 'basketball', basis: aerial });
  treeRow([-196, -33], [-195, -108], 15, 2.2, 6.4);
  label('basketball', [-176, -70]);
}

function addDaoshan({ polygon, point, quad, roof, wall, tree }: CampusModel) {
  // Interpreted bare-earth cross-sections. The low return was inspected to exclude
  // the summit pavilion and the tree canopy before fitting this continuous surface.
  const west = -146,
    north = -34,
    spacingX = 7.6,
    spacingY = 6.3;
  const terrain = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0.4, 0.9, 1.4, 2.1, 2.5, 2.8, 2.1, 1.3, 0],
    [0, 1.3, 2.4, 3.4, 5.4, 5.8, 4.8, 3.9, 2.8, 0],
    [0, 1.6, 2.8, 4.1, 6.5, 6.8, 5.9, 4.3, 3.1, 0],
    [0, 1.3, 2.5, 3.6, 6.15, 6.3, 5.4, 3.7, 2.3, 0],
    [0, 0.5, 1.7, 2.75, 3.2, 3.5, 2.8, 1.8, 0.8, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const width = terrain[0].length - 1,
    length = terrain.length - 1;
  function altitude(x: number, y: number) {
    const u = (x - west) / spacingX,
      v = (north - y) / spacingY;
    const i = Math.min(width - 1, Math.max(0, Math.floor(u)));
    const j = Math.min(length - 1, Math.max(0, Math.floor(v)));
    const a = u - i,
      b = v - j;
    const nw = terrain[j][i],
      ne = terrain[j][i + 1],
      sw = terrain[j + 1][i],
      se = terrain[j + 1][i + 1];
    return a >= b ? nw * (1 - a) + ne * (a - b) + se * b : nw * (1 - b) + sw * (b - a) + se * a;
  }
  const hill = rect(west, north, width * spacingX, length * spacingY);
  polygon(hill, { kind: 'garden', place: 'daoshan', basis: 'scan' });
  for (let j = 0; j < length; j++) {
    for (let i = 0; i < width; i++) {
      const [a, b, c, d] = rect(west + i * spacingX, north - j * spacingY, spacingX, spacingY).map(
        ([x, y]): Vertex => [x, y, altitude(x, y) + 0.035],
      );
      quad(a, b, c, d, '#acbc83', 'daoshan');
    }
  }
  point([-113, -53], { kind: 'place', place: 'daoshan' });

  // Path ribbons follow the registered grade. Each segment is subdivided to follow the slope.
  for (const route of [
    [
      [-144, -52],
      [-136, -51],
      [-127, -54],
      [-115, -54],
      [-106, -51],
      [-94, -46],
      [-81, -43],
    ],
    [
      [-112, -36],
      [-114, -44],
      [-115, -54],
      [-117, -62],
      [-125, -66],
      [-128, -71],
    ],
  ] as PlanPoint[][]) {
    const groundRibbon: PlanPoint[] = [];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const normal = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const edge = (t: number, side: number): Vertex => {
        const [x, y] = mix(a, b, t);
        const px = x + normal[0] * side * 0.85,
          py = y + normal[1] * side * 0.85;
        return [px, py, altitude(px, py) + 0.13];
      };
      for (let t = 0; t < 12; t++) {
        const u = t / 12,
          v = (t + 1) / 12;
        quad(edge(u, 1), edge(u, -1), edge(v, -1), edge(v, 1), '#d7c9aa', 'daoshan');
      }
      groundRibbon.push(a);
    }
    groundRibbon.push(route[route.length - 1]);
    for (let i = 1; i < groundRibbon.length; i++) {
      const a = groundRibbon[i - 1],
        b = groundRibbon[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (-(b[1] - a[1]) / length) * 0.85,
        dy = ((b[0] - a[0]) / length) * 0.85;
      polygon(
        [
          [a[0] + dx, a[1] + dy],
          [b[0] + dx, b[1] + dy],
          [b[0] - dx, b[1] - dy],
          [a[0] - dx, a[1] - dy],
        ],
        {
          kind: 'hill-path',
          place: 'daoshan',
          basis: 'scan',
        },
      );
    }
  }
  const footprint = rect(-119, -50.5, 7.1, 6.8);
  wall('daoshan', footprint, 6.75, 'scan', { base: 6, wall: 'stone', detail: true });
  roof('daoshan', footprint, 9.8, 2.65, 'slate', 'curved');
  for (const [x, y] of inset(footprint, 0.12, 0.12))
    wall('daoshan', rect(x - 0.22, y + 0.22, 0.44, 0.44), 9.8, 'scan', {
      base: 6.55,
      wall: 'timber',
      detail: true,
    });
  for (const [x, y, radius, height] of [
    [-139, -40, 3.3, 6],
    [-130, -43, 3.5, 7.1],
    [-120, -40, 3.1, 6.3],
    [-108, -41, 4.2, 7.6],
    [-96, -39, 3.8, 7.7],
    [-88, -49, 3.3, 6.8],
    [-96, -56, 4.4, 8.2],
    [-106, -61, 3.7, 7.3],
    [-114, -67, 3.2, 6.5],
    [-135, -61, 3.9, 7.4],
    [-142, -67, 3.0, 6.2],
    [-126, -60, 3.2, 6.9],
  ])
    tree([x, y], radius, height, altitude(x, y));
}
