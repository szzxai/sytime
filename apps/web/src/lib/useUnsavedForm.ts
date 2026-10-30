import { useBlocker } from '@tanstack/react-router';
import { useRef, type FormEvent } from 'react';

/** Preserve the leave-page warning for forms across client and document navigation. */
export function useUnsavedForm() {
  const dirty = useRef(false);
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      dirty.current &&
      !window.confirm('有尚未保存的内容，确定离开吗？'),
    enableBeforeUnload: () => dirty.current,
  });
  return {
    onInput: (event: FormEvent<HTMLFormElement>) => {
      if (event.isTrusted) dirty.current = true;
    },
    clean: () => {
      dirty.current = false;
    },
  };
}
