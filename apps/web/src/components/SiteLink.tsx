import { Link, useRouter } from '@tanstack/react-router';
import { createContext, useContext, type ComponentProps } from 'react';
import { navigationFor, useDisplayedLocation, type Scope } from '../lib/navigation';

export const NavigationScope = createContext<Scope>('section');
type Props = ComponentProps<'a'> & { scope?: Scope; back?: boolean };

/** Native anchors for documents/fragments; router links provide intent preloading for pages. */
export function SiteLink({ href, scope: explicitScope, back = false, onClick, ...props }: Props) {
  const scope = useContext(NavigationScope);
  const from = useDisplayedLocation();
  const router = useRouter();
  const target = new URL(href || '', window.location.href);
  if (
    !href ||
    href.startsWith('#') ||
    target.origin !== location.origin ||
    !/^\/(?:[a-z_-]+\.html)?$/.test(target.pathname) ||
    props.download ||
    (props.target && props.target !== '_self')
  ) {
    return <a {...props} href={href} onClick={onClick} />;
  }
  const isBack = back || !!props.className?.split(' ').includes('back-link');
  const parent = from.state.siteNavigation;
  const returning =
    isBack &&
    parent?.returnTo &&
    new URL(parent.returnTo, location.origin).pathname === target.pathname;
  const url = returning ? new URL(parent.returnTo!, location.origin) : target;
  const navigation = navigationFor(from, url, explicitScope || scope, isBack);
  return (
    <Link
      {...props}
      to={url.pathname}
      search={Object.fromEntries(url.searchParams)}
      hash={url.hash.slice(1)}
      state={{ siteNavigation: navigation }}
      preload="intent"
      preloadDelay={80}
      activeProps={{}}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          returning &&
          parent.returnIndex === from.state.__TSR_index - 1
        ) {
          event.preventDefault();
          router.history.back();
        }
      }}
    />
  );
}
