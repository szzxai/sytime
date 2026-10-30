import { useEffect, type RefObject } from 'react';

/** Preserve native details semantics while allowing a slide to reverse mid-animation. */
export function useAccordion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const items = Array.from(
      root.current?.querySelectorAll<HTMLDetailsElement>('.landing-accordion details') || [],
    );
    const controllers = items.map((item) => {
      const summary = item.querySelector('summary')!;
      const content = summary.nextElementSibling as HTMLElement;
      let animation: Animation | null = null;
      let expanded = item.open;
      function settle() {
        animation?.cancel();
        animation = null;
        item.open = expanded;
        item.removeAttribute('data-closing');
        content.inert = !expanded;
      }
      function setOpen(next: boolean) {
        const from = item.open ? content.getBoundingClientRect().height : 0;
        expanded = next;
        animation?.cancel();
        animation = null;
        content.inert = !next;
        if (reduced.matches) {
          settle();
          return;
        }
        item.open = true;
        item.toggleAttribute('data-closing', !next);
        animation = content.animate(
          [{ height: `${from}px` }, { height: `${next ? content.scrollHeight : 0}px` }],
          { duration: 200, easing: 'ease-out' },
        );
        animation.onfinish = settle;
      }
      const click = (event: MouseEvent) => {
        event.preventDefault();
        const next = !expanded;
        if (next)
          controllers.forEach((controller) => {
            if (controller.item !== item) controller.close();
          });
        setOpen(next);
      };
      const media = () => {
        if (reduced.matches) settle();
      };
      summary.addEventListener('click', click);
      reduced.addEventListener('change', media);
      let contentWidth = 0;
      const resize = new ResizeObserver((entries) => {
        const width = entries[0].contentRect.width;
        if (contentWidth && width && width !== contentWidth && animation && expanded) setOpen(true);
        if (width) contentWidth = width;
      });
      if (content.firstElementChild) resize.observe(content.firstElementChild);
      content.inert = !expanded;
      return {
        item,
        close: () => {
          if (expanded) setOpen(false);
        },
        dispose: () => {
          animation?.cancel();
          resize.disconnect();
          summary.removeEventListener('click', click);
          reduced.removeEventListener('change', media);
        },
      };
    });
    return () => controllers.forEach((controller) => controller.dispose());
  }, [root]);
}
