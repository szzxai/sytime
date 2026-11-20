import type { Map } from 'maplibre-gl';

type TrackpadGesture = Event & {
  clientX: number;
  clientY: number;
  rotation: number;
  scale: number;
};

// Safari exposes macOS pinch and twist through GestureEvent. Native touch on iOS
// is already handled by MapLibre. Ctrl-wheel pinch on other engines stays native.
export function installTrackpadGestures(map: Map, onStart: () => void) {
  const canvas = map.getCanvasContainer();
  let active: { zoom: number; bearing: number; anchor: ReturnType<Map['unproject']> } | undefined;

  const start = (event: Event) => {
    if (navigator.maxTouchPoints > 1) return;
    const { clientX, clientY } = event as TrackpadGesture;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    event.preventDefault();
    onStart();
    map.stop();
    const bounds = canvas.getBoundingClientRect();
    const point: [number, number] = [clientX - bounds.left, clientY - bounds.top];
    active = {
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      anchor: map.unproject(point),
    };
  };
  const change = (event: Event) => {
    if (!active) return;
    event.preventDefault();
    const { rotation, scale } = event as TrackpadGesture;
    if (!Number.isFinite(rotation) || !Number.isFinite(scale) || scale <= 0) return;
    map.easeTo({
      around: active.anchor,
      zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), active.zoom + Math.log2(scale))),
      bearing: active.bearing - rotation,
      duration: 0,
    });
  };
  const end = (event: Event) => {
    if (active) event.preventDefault();
    active = undefined;
  };
  const wheel = (event: WheelEvent) => {
    if (!active || !event.ctrlKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener('gesturestart', start, { passive: false });
  canvas.addEventListener('gesturechange', change, { passive: false });
  canvas.addEventListener('gestureend', end, { passive: false });
  canvas.addEventListener('wheel', wheel, { capture: true, passive: false });
  return () => {
    canvas.removeEventListener('gesturestart', start);
    canvas.removeEventListener('gesturechange', change);
    canvas.removeEventListener('gestureend', end);
    canvas.removeEventListener('wheel', wheel, true);
  };
}
