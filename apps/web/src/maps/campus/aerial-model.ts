import { mix, type CampusModel, type PlanPoint, type Quad } from './model';
import { libraryJunction } from './scan-model';

// Register the campus plan to the LCC's local grid using the lawns, ponds, Science
// Building and Zunjing Pavilion. Used for plan/aerial infill outside reliable scan coverage.
export function planPoint([x, y]: PlanPoint): PlanPoint {
  return [0.386548 * x - 0.022312 * y - 370.686, -0.011853 * x - 0.361703 * y + 175.259];
}

export function addAerialDistrict(model: CampusModel) {
  const { wall, hall, facade, polygon, line, point, treeRow, basin, bridge } = model;
  const basis = 'aerial';
  const poly = (points: PlanPoint[], kind: string, place?: string) =>
    polygon(points.map(planPoint), { kind, place, basis });
  const path = (points: PlanPoint[], width: number, kind = 'path') =>
    line(points.map(planPoint), { kind, width, basis });
  const block = (
    place: string,
    bounds: Quad,
    height: number,
    options: Parameters<typeof wall>[4] = {},
  ) => wall(place, bounds.map(planPoint), height, basis, options);
  const wing = (
    place: string,
    bounds: Quad,
    eave: number,
    rise: number,
    material?: Parameters<typeof hall>[5],
    finish?: Parameters<typeof hall>[6],
    shape?: Parameters<typeof hall>[7],
    base?: number,
  ) => hall(place, bounds.map(planPoint) as Quad, eave, rise, basis, material, finish, shape, base);
  const trace = (x: number, y: number, width: number, depth: number, skew = 0.115): Quad => [
    [x, y],
    [x + width, y - skew * width],
    [x + width + depth * 0.112, y - skew * width + depth],
    [x + depth * 0.112, y + depth],
  ];

  poly(
    [
      [438, 184],
      [993, 111],
      [1029, 380],
      [1080, 391],
      [1096, 517],
      [1050, 537],
      [1077, 1016],
      [1121, 1348],
      [1006, 1364],
      [1006, 1381],
      [670, 1421],
      [412, 1403],
      [309, 916],
      [478, 875],
      [456, 563],
    ],
    'campus',
  );
  poly(
    [
      [1010, 67],
      [1068, 60],
      [1242, 1443],
      [1176, 1450],
    ],
    'street',
  );
  path(
    [
      [1039, 67],
      [1206, 1442],
    ],
    2,
    'street-center',
  );
  path(
    [
      [330, 174],
      [1028, 79],
    ],
    15,
    'street',
  );
  path(
    [
      [401, 1422],
      [1116, 1382],
    ],
    8,
    'street',
  );
  line(
    (
      [
        [357, 169],
        [991, 83],
      ] as PlanPoint[]
    ).map(planPoint),
    { kind: 'road-name', name: '书院巷' },
  );
  line(
    (
      [
        [1070, 364],
        [1188, 1310],
      ] as PlanPoint[]
    ).map(planPoint),
    { kind: 'road-name', name: '人民路' },
  );
  line(
    (
      [
        [805, 806],
        [853, 1190],
      ] as PlanPoint[]
    ).map(planPoint),
    { kind: 'road-name', name: '蔚然大道' },
  );

  for (const [x, y, w, d] of [
    [1148, 163, 107, 91],
    [1158, 290, 129, 86],
    [1194, 514, 102, 94],
    [1212, 665, 64, 100],
    [1222, 831, 87, 61],
    [1240, 958, 98, 78],
    [330, 253, 94, 45],
    [349, 344, 82, 54],
    [376, 456, 73, 57],
    [393, 563, 71, 60],
    [407, 672, 70, 57],
    [413, 781, 67, 59],
  ])
    poly(trace(x, y, w, d), 'context');

  // Keep the distinct western library wing, tiled east range and roof terrace.
  block('library', trace(603, 828, 125, 87), 7.8);
  block('library', trace(646, 792, 123, 80), 11.2);
  const libraryRange = trace(738, 783, 31, 119);
  wing('library', libraryRange, 12.8, 2.7, 'slate', 'white');
  facade(
    'library',
    [libraryRange[1], libraryRange[2], libraryRange[3], libraryRange[0]].map(planPoint) as Quad,
    9,
    [1.5, 4.45, 7.4, 10.35],
    1.47,
    '#6c8380',
  );
  block('library', trace(654, 799, 38, 48), 12.2, { wall: 'white', detail: true });

  // Lai Xiu Fang has a stepped L plan, a faceted auditorium cap and a glazed link.
  const laixiu: PlanPoint[] = [
    [605, 856],
    [642, 852],
    [649, 903],
    [783, 888],
    [800, 1022],
    [621, 1042],
    [610, 944],
    [584, 947],
    [576, 884],
  ];
  wall('laixiu', laixiu.map(planPoint), 8.2, basis);
  wall(
    'laixiu',
    [
      [655, 918],
      [747, 907],
      [774, 914],
      [785, 989],
      [762, 1002],
      [664, 1013],
    ].map((p) => planPoint(p as PlanPoint)),
    12.4,
    basis,
    { base: 8.2, wall: 'stone' },
  );
  wing('laixiu', trace(610, 875, 29, 54), 8.3, 1.2, 'zinc', 'white');
  for (let i = 0; i < 5; i++)
    block('laixiu', trace(630 + i * 4, 961 + i * 12, 9, 5), 9.2, {
      base: 8.2,
      wall: 'stone',
      detail: true,
    });

  // A shallow blue two-sided span with a separate covered spectator edge.
  const gym = trace(638, 1054, 131, 100);
  wing('gym', gym, 10.8, 1.8, 'zinc', 'white', 'gable');
  facade('gym', gym.map(planPoint) as Quad, 10, [5.5], 2.1, '#70898d');
  const canopy = trace(615, 1061, 20, 91);
  wing('gym', canopy, 3.7, 1.05, 'flat', 'white', 'barrel', 3);
  for (let i = 0; i <= 6; i++) {
    const [x, y] = mix(canopy[0], canopy[3], i / 6);
    block('gym', trace(x, y, 2.2, 2.2), 3.1, { wall: 'white', detail: true });
  }
  block('gym', trace(772, 1063, 8, 58), 4.4, { wall: 'white' });

  // Dorms wrap around an open central garden. The dining hall has its own stepped wings.
  wing('caiqin', trace(659, 1177, 137, 30), 14.8, 2.9);
  wing('caiqin', trace(659, 1177, 29, 177), 14.8, 2.9, 'slate', 'white');
  wing('caiqin', trace(675, 1329, 144, 29), 14.8, 2.9);
  wing('caiqin', trace(780, 1244, 30, 95), 14.8, 2.9, 'slate', 'white');
  poly(
    [
      [707, 1216],
      [734, 1223],
      [748, 1243],
      [772, 1238],
      [778, 1254],
      [755, 1270],
      [777, 1293],
      [772, 1306],
      [744, 1294],
      [715, 1311],
      [708, 1294],
      [733, 1265],
    ],
    'garden',
  );
  path(
    [
      [728, 1228],
      [747, 1256],
      [747, 1281],
      [766, 1298],
    ],
    1.35,
    'walk',
  );
  wing('panshui', trace(842, 1197, 98, 37), 9.4, 2.4);
  wing('panshui', trace(924, 1215, 42, 107), 11.4, 2.6, 'slate', 'white');
  wing('panshui', trace(847, 1287, 124, 54), 10.4, 2.6);
  block('panshui', trace(848, 1254, 34, 32), 5.5);
  wing('daomeng', trace(826, 1054, 146, 28), 4.5, 1.9, 'red', 'white');
  wing('daomeng', trace(935, 1073, 39, 25), 4.0, 1.44, 'red', 'white');

  // Walled heritage precinct with raised halls, covered corridors, Paifang and separate courts.
  poly(
    [
      [819, 754],
      [1037, 729],
      [1092, 1026],
      [861, 1056],
    ],
    'paving',
    'temple',
  );
  wing('temple', trace(831, 766, 74, 52), 8.1, 3.9, 'slate', 'timber', 'curved');
  wing('temple', trace(834, 819, 13, 222), 3.4, 1.1, 'slate', 'timber');
  wing('temple', trace(957, 756, 13, 268), 3.6, 1.12, 'slate', 'timber');
  wing('temple', trace(986, 725, 80, 50), 9.6, 4.3, 'red', 'timber', 'curved');
  wing('temple', trace(876, 1020, 103, 30), 4.2, 2.0, 'slate', 'timber', 'curved');
  wing('temple', trace(978, 991, 79, 32), 5.1, 2.2, 'slate', 'timber', 'curved');
  wing('temple', trace(855, 826, 35, 35), 3.7, 1.6, 'slate', 'timber', 'curved');
  wing('temple', trace(914, 960, 29, 35), 4.0, 1.6, 'slate', 'timber', 'curved');
  for (const x of [987, 1008, 1033, 1053])
    block('temple', trace(x, 890 - (x - 987) * 0.109, 3, 3), 5.5, { wall: 'stone', detail: true });
  wing('temple', trace(985, 888, 73, 4.1), 5.8, 1.6, 'slate', 'stone', 'curved', 4.8);
  for (const [x, y] of [
    [985, 794],
    [1017, 789],
    [996, 910],
    [1034, 905],
  ])
    poly(trace(x, y, 23, 48), 'garden');
  path(
    [
      [1024, 780],
      [1046, 991],
    ],
    3.8,
    'walk',
  );

  basin('temple', trace(858, 888, 18, 90).map(planPoint), basis);
  basin('temple', trace(889, 884, 18, 90).map(planPoint), basis);
  bridge('temple', trace(877, 878, 8.5, 115).map(planPoint) as Quad, 0.28, basis);

  basin('panchi', trace(835, 1105, 55, 65).map(planPoint), basis);
  basin('panchi', trace(904, 1097, 64, 65).map(planPoint), basis);
  bridge('panchi', trace(891, 1098, 12.4, 72).map(planPoint) as Quad, 0.65, basis);
  point(planPoint([900, 1134]), { kind: 'place', place: 'panchi' });
  poly(
    [
      [990, 1086],
      [1085, 1069],
      [1119, 1350],
      [1025, 1370],
    ],
    'garden',
  );

  wing('south-gate', trace(988, 1328, 22, 14), 3.45, 1.4, 'slate', 'stone', 'curved', 2.55);
  for (const [x, y] of [trace(988, 1328, 22, 14)[0], trace(988, 1328, 22, 14)[1]])
    block('south-gate', trace(x, y, 3.3, 12), 2.8, { wall: 'stone', detail: true });

  line(
    [
      libraryJunction,
      ...(
        [
          [814, 905],
          [828, 1032],
          [850, 1195],
          [872, 1371],
        ] as PlanPoint[]
      ).map(planPoint),
    ],
    { kind: 'path', width: 5, basis },
  );
  path(
    [
      [596, 782],
      [618, 1049],
      [667, 1377],
    ],
    3.3,
  );
  path(
    [
      [619, 1043],
      [822, 1020],
    ],
    3.5,
  );
  path(
    [
      [639, 1167],
      [977, 1125],
    ],
    3.4,
  );
  path(
    [
      [655, 1385],
      [1038, 1341],
    ],
    4.2,
  );
  path(
    [
      [981, 1160],
      [1008, 1337],
    ],
    2.4,
    'walk',
  );

  treeRow(planPoint([797, 793]), planPoint([860, 1330]), 25, 2.9, 8.4);
  treeRow(planPoint([981, 795]), planPoint([1010, 962]), 10, 2.6, 7.8);
  treeRow(planPoint([1008, 1120]), planPoint([1032, 1332]), 10, 2.7, 7.4);
  treeRow(planPoint([668, 1375]), planPoint([841, 1355]), 10, 2.35, 6.2);

  addStadium(model);
}

function addStadium({ polygon, line, point, treeRow }: CampusModel) {
  // Fit the capsule to both ends of the oval in the aerial plan. Track markings use metre offsets.
  const endA = planPoint([449, 1009]),
    endB = planPoint([511, 1263]);
  const length = Math.hypot(endB[0] - endA[0], endB[1] - endA[1]);
  const dx = (endB[0] - endA[0]) / length,
    dy = (endB[1] - endA[1]) / length;
  const at = (along: number, across: number): PlanPoint => [
    endA[0] + dx * along - dy * across,
    endA[1] + dy * along + dx * across,
  ];
  const outline = (radius: number) => {
    const ends: PlanPoint[] = [];
    for (let cap = 0; cap < 2; cap++) {
      for (let i = 0; i <= 32; i++) {
        const angle = (i * Math.PI) / 32 + cap * Math.PI;
        ends.push(at(cap * length - Math.sin(angle) * radius, Math.cos(angle) * radius));
      }
    }
    return ends;
  };
  polygon(outline(38.5), { kind: 'track', place: 'track', basis: 'aerial' });
  polygon(outline(30.25), { kind: 'infield', place: 'track', basis: 'aerial' });
  for (let lane = 0; lane <= 6; lane++) {
    const points = outline(30.65 + lane * 1.22);
    line([...points, points[0]], { kind: 'marking' });
  }
  const pitch = [at(-6, -23), at(length + 6, -23), at(length + 6, 23), at(-6, 23)] as Quad;
  polygon(pitch, { kind: 'field', place: 'track', basis: 'aerial' });
  for (let i = 0; i < 10; i += 2) {
    const start = -6 + (i * (length + 12)) / 10;
    const end = start + (length + 12) / 10;
    polygon([at(start, -23), at(end, -23), at(end, 23), at(start, 23)], { kind: 'field-stripe' });
  }
  line([...pitch, pitch[0]], { kind: 'marking' });
  line([at(length / 2, -23), at(length / 2, 23)], { kind: 'marking' });
  const centerCircle = Array.from({ length: 41 }, (_, i) => {
    const angle = (i * Math.PI) / 20;
    return at(length / 2 + 6 * Math.cos(angle), 6 * Math.sin(angle));
  });
  line(centerCircle, { kind: 'marking' });
  for (const [edge, inner] of [
    [-6, 6],
    [length + 6, length - 6],
  ]) {
    line([at(edge, -13), at(inner, -13), at(inner, 13), at(edge, 13)], { kind: 'marking' });
  }
  point(at(length / 2, 0), { kind: 'place', place: 'track' });
  treeRow(at(-2, -42), at(length, -42), 13, 2.55, 7.6);
  treeRow(at(length + 40, -22), at(length + 40, 22), 8, 2.55, 7.1);
}
