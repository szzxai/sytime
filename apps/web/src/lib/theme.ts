import { useEffect, useSyncExternalStore } from 'react';
type Theme = 'auto' | 'light' | 'dark';
let theme = (localStorage.getItem('theme') || 'auto') as Theme;
const listeners = new Set<() => void>();
function apply() {
  const dark =
    theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#14532D' : '#218653');
}
function update(value: Theme) {
  const commit = () => {
    theme = value;
    localStorage.setItem('theme', value);
    apply();
    listeners.forEach((fn) => fn());
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commit();
    return;
  }
  document.documentElement.classList.add('theme-transitioning');
  if (document.startViewTransition) {
    const transition = document.startViewTransition(commit);
    transition.finished
      .catch(() => {})
      .finally(() => document.documentElement.classList.remove('theme-transitioning'));
  } else {
    commit();
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 300);
  }
}
const media = matchMedia('(prefers-color-scheme: dark)');
media.addEventListener('change', () => {
  apply();
  listeners.forEach((fn) => fn());
});
window.addEventListener('storage', (e) => {
  if (e.key === 'theme') {
    theme = (e.newValue || 'auto') as Theme;
    apply();
    listeners.forEach((fn) => fn());
  }
});
export function useTheme() {
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => `${theme}:${media.matches}`,
  );
  useEffect(apply, []);
  return [value.split(':')[0] as Theme, update] as const;
}
