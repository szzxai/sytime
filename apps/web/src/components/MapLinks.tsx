import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { SiteLink } from './SiteLink';

type Slot = {
  host: HTMLElement;
  href: string;
  className: string;
  title: string;
  label: string | null;
  html: string;
  style: CSSProperties;
};
/** Map engines own marker geometry; React owns the actual navigable links. */
export function useMapLinks(host: RefObject<HTMLDivElement | null>) {
  const [slots, setSlots] = useState<Slot[]>([]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let current: Slot[] = [];
    const observer = new MutationObserver(() => {
      const next = current.filter((slot) => element.contains(slot.host));
      element
        .querySelectorAll<HTMLAnchorElement>('a[href]:not([data-router-link])')
        .forEach((anchor) => {
          const url = new URL(anchor.href);
          if (url.origin !== location.origin || url.pathname !== '/shop.html') return;
          const placeholder = document.createElement('span');
          placeholder.style.display = 'contents';
          const style = Object.fromEntries(
            Array.from(anchor.style, (key) => [
              key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
              anchor.style.getPropertyValue(key),
            ]),
          ) as CSSProperties;
          next.push({
            host: placeholder,
            href: anchor.getAttribute('href')!,
            className: anchor.className,
            title: anchor.title,
            label: anchor.getAttribute('aria-label'),
            html: anchor.innerHTML,
            style,
          });
          anchor.replaceWith(placeholder);
        });
      if (next.length !== current.length || next.some((slot, i) => slot !== current[i])) {
        current = next;
        setSlots(next);
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host]);
  return slots.map((slot) =>
    createPortal(
      <SiteLink
        href={slot.href}
        className={slot.className}
        title={slot.title}
        aria-label={slot.label || undefined}
        style={slot.style}
        data-router-link=""
        dangerouslySetInnerHTML={{ __html: slot.html }}
      />,
      slot.host,
    ),
  );
}
