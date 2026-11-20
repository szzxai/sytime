import { MercatorCoordinate, type CustomLayerInterface, type Point } from 'maplibre-gl';
import { coordinate, scanOrigin, type Vertex } from './model';
import { surfaces } from './survey';

const vertexSource = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 color;
layout(location = 2) in float place;
uniform mat4 matrix;
uniform float selected;
uniform float hovered;
out vec3 faceColor;
void main() {
  float amount = place == selected ? 0.14 : place == hovered ? 0.09 : 0.0;
  faceColor = mix(color, vec3(0.88, 0.69, 0.43), amount);
  gl_Position = matrix * vec4(position, 1.0);
}`;
const fragmentSource = `#version 300 es
precision mediump float;
in vec3 faceColor;
out vec4 pixel;
void main() {
  pixel = vec4(faceColor, 1.0);
}`;

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const result = gl.createShader(type);
  if (!result) throw new Error('Campus surface shader allocation failed');
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (gl.getShaderParameter(result, gl.COMPILE_STATUS)) return result;
  const log = gl.getShaderInfoLog(result);
  gl.deleteShader(result);
  throw new Error(log || 'Campus surface shader compilation failed');
}

const origin = MercatorCoordinate.fromLngLat(scanOrigin);
const placeNumbers = new Map<string, number>();
const pickable = new Map<string, { triangles: Vertex[][]; low: Vertex; high: Vertex }>();
const data = new Float32Array(surfaces.length * 3 * 7);
for (const [
  i,
  {
    points: [a, b, c],
    color,
    place,
  },
] of surfaces.entries()) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const norm = Math.hypot(nx, ny, nz);
  const orientation = nz < 0 ? -1 : 1;
  const light = norm
    ? 0.8 + (0.2 * (orientation * (-0.31 * nx + 0.43 * ny + 0.83 * nz))) / norm
    : 0.8;
  const rgb = [1, 3, 5].map((j) => (parseInt(color.slice(j, j + 2), 16) / 255) * light);
  if (place && !placeNumbers.has(place)) placeNumbers.set(place, placeNumbers.size + 1);
  const id = place ? placeNumbers.get(place)! : 0;
  const triangle = [a, b, c].map(([x, y, z], j): Vertex => {
    const p = MercatorCoordinate.fromLngLat(coordinate([x, y]), z);
    const relative: Vertex = [p.x - origin.x, p.y - origin.y, p.z];
    data.set([...relative, ...rgb, id], (i * 3 + j) * 7);
    return relative;
  });
  if (place) {
    const group = pickable.get(place) ?? {
      triangles: [],
      low: [...triangle[0]],
      high: [...triangle[0]],
    };
    group.triangles.push(triangle);
    for (const vertex of triangle) {
      for (let axis = 0; axis < 3; axis++) {
        group.low[axis] = Math.min(group.low[axis], vertex[axis]);
        group.high[axis] = Math.max(group.high[axis], vertex[axis]);
      }
    }
    pickable.set(place, group);
  }
}

export function campusSurfaces() {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let matrixUniform: WebGLUniformLocation | null;
  let selectedUniform: WebGLUniformLocation | null;
  let hoveredUniform: WebGLUniformLocation | null;
  let enabled = true,
    active = -1,
    hover = -1;
  // Translate on the CPU before sending to WebGL. Small local coordinates retain
  // the precision needed to line up eaves and walls even at the closest zoom.
  const matrix = new Float32Array(16);
  let width = 0,
    height = 0;
  const layer: CustomLayerInterface = {
    id: 'campus-surfaces',
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      try {
        program = gl.createProgram();
        buffer = gl.createBuffer();
        vao = gl.createVertexArray();
        if (!program || !buffer || !vao) throw new Error('Campus surface allocation failed');
        const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
        gl.attachShader(program, vertex);
        gl.deleteShader(vertex);
        const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, fragment);
        gl.deleteShader(fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) || 'Campus surface program link failed');
        matrixUniform = gl.getUniformLocation(program, 'matrix');
        selectedUniform = gl.getUniformLocation(program, 'selected');
        hoveredUniform = gl.getUniformLocation(program, 'hovered');
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        for (const [index, offset, size] of [
          [0, 0, 3],
          [1, 12, 3],
          [2, 24, 1],
        ]) {
          gl.enableVertexAttribArray(index);
          gl.vertexAttribPointer(index, size, gl.FLOAT, false, 28, offset);
        }
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      } catch (error) {
        gl.deleteProgram(program);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        throw error;
      }
    },
    onRemove(_map, gl) {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
    },
    render(gl, { defaultProjectionData }) {
      if (!enabled) return;
      const source = defaultProjectionData.mainMatrix;
      matrix.set(source);
      for (let row = 0; row < 4; row++)
        matrix[12 + row] = source[row] * origin.x + source[4 + row] * origin.y + source[12 + row];
      width = gl.canvas instanceof HTMLCanvasElement ? gl.canvas.clientWidth : gl.canvas.width;
      height = gl.canvas instanceof HTMLCanvasElement ? gl.canvas.clientHeight : gl.canvas.height;
      gl.disable(gl.CULL_FACE);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(matrixUniform, false, matrix);
      gl.uniform1f(selectedUniform, active);
      gl.uniform1f(hoveredUniform, hover);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
      gl.bindVertexArray(null);
    },
  };

  function project([x, y, z]: Vertex) {
    const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    return [
      (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
      (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
      (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w,
    ];
  }
  function pick(point: Point): string | undefined {
    if (!enabled || !width || !height) return;
    const x = (2 * point.x) / width - 1,
      y = 1 - (2 * point.y) / height;
    let closest = 1,
      id: string | undefined;
    for (const [place, { triangles, low, high }] of pickable) {
      const corners = [];
      for (const u of [low[0], high[0]])
        for (const v of [low[1], high[1]])
          for (const w of [low[2], high[2]]) corners.push(project([u, v, w]));
      // If the near plane crosses the bounds, test the faces directly.
      if (
        corners.every((p) => p[2] >= -1 && p[2] <= 1) &&
        (corners.every((p) => p[0] < x) ||
          corners.every((p) => p[0] > x) ||
          corners.every((p) => p[1] < y) ||
          corners.every((p) => p[1] > y))
      )
        continue;
      for (const triangle of triangles) {
        const [a, b, c] = triangle.map(project);
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(area) < 1e-10) continue;
        const u = ((x - a[0]) * (c[1] - a[1]) - (y - a[1]) * (c[0] - a[0])) / area;
        const v = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / area;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const depth = a[2] * (1 - u - v) + b[2] * u + c[2] * v;
        if (depth > -1 && depth < closest) {
          id = place;
          closest = depth;
        }
      }
    }
    return id;
  }
  return {
    layer,
    pick,
    mode(value: boolean) {
      enabled = value;
    },
    select(id?: string) {
      active = id ? (placeNumbers.get(id) ?? -1) : -1;
    },
    hover(id?: string) {
      hover = id ? (placeNumbers.get(id) ?? -1) : -1;
    },
  };
}
