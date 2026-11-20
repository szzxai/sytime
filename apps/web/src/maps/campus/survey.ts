import type { FeatureCollection, Geometry } from 'geojson';
import { addAerialDistrict } from './aerial-model';
import { addScanDistrict } from './scan-model';
import { coordinate, createCampusModel, type PlanPoint, type Properties } from './model';

const model = createCampusModel();
addScanDistrict(model);
addAerialDistrict(model);

const { features, footprints, surfaces } = model;
export { coordinate, features, footprints, surfaces };
export type { SurveyFeature } from './model';

const centers = new Map<string, PlanPoint>();
for (const feature of features) {
  if (feature.geometry.type === 'Point' && feature.properties.kind === 'place') {
    centers.set(feature.properties.place!, feature.geometry.coordinates as PlanPoint);
  }
}
for (const [place, rings] of footprints) {
  if (centers.has(place)) continue;
  const points = rings[0];
  const center = points.reduce<PlanPoint>(
    ([x, y], p) => [x + p[0] / points.length, y - p[1] / points.length],
    [0, 0],
  );
  model.point(center, { kind: 'place', place });
  centers.set(place, coordinate(center));
}

const outline = features.find((f) => f.properties.kind === 'campus')!.geometry;
const positions = outline.type === 'Polygon' ? outline.coordinates[0] : [];
const xs = positions.map((p) => p[0]),
  ys = positions.map((p) => p[1]);
export const campusBounds: [PlanPoint, PlanPoint] = [
  [Math.min(...xs) - 0.00004, Math.min(...ys) - 0.00004],
  [Math.max(...xs) + 0.00004, Math.max(...ys) + 0.00004],
];
export { centers };
export const campusData: FeatureCollection<Geometry, Properties> = {
  type: 'FeatureCollection',
  features,
};
export function boundaryFor(id: string) {
  return features.filter(
    (f) =>
      f.properties.place === id &&
      f.geometry.type === 'Polygon' &&
      f.properties.kind !== 'structure',
  );
}
