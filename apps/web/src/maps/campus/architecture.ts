import type { CampusModel, PlanPoint, Vertex } from './model';

// Metre coordinates on an elevation: u along the wall, v inwards, z above paving.
export function elevation(model: CampusModel, place: string, origin: PlanPoint, end: PlanPoint) {
  const length = Math.hypot(end[0] - origin[0], end[1] - origin[1]);
  const east = (end[0] - origin[0]) / length;
  const north = (end[1] - origin[1]) / length;
  const world = ([u, v, z]: Vertex): Vertex => [
    origin[0] + east * u - north * v,
    origin[1] + north * u + east * v,
    z,
  ];
  function face(a: Vertex, b: Vertex, c: Vertex, d: Vertex, color: string) {
    model.quad(world(a), world(b), world(c), world(d), color, place);
  }
  function solid(ring: [number, number][], front: number, back: number, color: string) {
    for (const [i, [x, z]] of ring.entries()) {
      const [nx, nz] = ring[(i + 1) % ring.length];
      face([x, front, z], [nx, front, nz], [nx, back, nz], [x, back, z], color);
    }
    // End caps. All profiles passed here are convex.
    for (const v of [front, back]) {
      const [x, z] = ring[0];
      for (let i = 2; i < ring.length; i++) {
        const [a, b] = ring[i - 1],
          [c, d] = ring[i];
        model.face([world([x, v, z]), world([a, v, b]), world([c, v, d])], color, place);
      }
    }
  }
  function box(x: number, y: number, z: number, w: number, d: number, h: number, color: string) {
    solid(
      [
        [x, z],
        [x + w, z],
        [x + w, z + h],
        [x, z + h],
      ],
      y,
      y + d,
      color,
    );
  }
  function cylinder(x: number, y: number, z: number, radius: number, h: number, color: string) {
    const ring = Array.from({ length: 12 }, (_, i): PlanPoint => [
      x + Math.cos((i * Math.PI) / 6) * radius,
      y + Math.sin((i * Math.PI) / 6) * radius,
    ]);
    for (const [i, [u, v]] of ring.entries()) {
      const [nu, nv] = ring[(i + 1) % ring.length];
      face([u, v, z], [nu, nv, z], [nu, nv, z + h], [u, v, z + h], color);
      model.face(
        [world([x, y, z + h]), world([u, v, z + h]), world([nu, nv, z + h])],
        color,
        place,
      );
    }
  }
  function opening(
    x: number,
    z: number,
    width: number,
    height: number,
    panes: number,
    glass: string,
    frame: string,
  ) {
    // Protruding jambs, transoms and sill cast a readable outline at close zoom.
    const v = -0.16;
    const left = x - width / 2;
    const horizontal = (h: number, thick: number) => box(left, v, h, width, 0.145, thick, frame);
    box(left + 0.045, v + 0.045, z, width - 0.09, 0.055, height, glass);
    for (let i = 0; i <= panes; i++) {
      const u = left + ((width - 0.055) * i) / panes;
      box(u, v, z, 0.055, 0.145, height, frame);
    }
    horizontal(z, 0.055);
    horizontal(z + height - 0.055, 0.055);
    horizontal(z + height * 0.72, 0.048);
    if (z > 0.45) box(left - 0.09, v - 0.025, z - 0.075, width + 0.18, 0.2, 0.075, '#beb8a8');
  }
  return { world, face, solid, box, cylinder, opening, length };
}
