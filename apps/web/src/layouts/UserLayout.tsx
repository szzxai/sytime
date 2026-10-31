import { SiteLink } from '../components/SiteLink';
import type { ReactNode, ComponentProps } from 'react';
export function UserLayout({
  slots = {},
  bind = {},
}: {
  slots?: {
    userStatus?: ReactNode;
    heroUsername?: ReactNode;
    heroDisplayId?: ReactNode;
    heroNickname?: ReactNode;
    heroSignature?: ReactNode;
    heroRole?: ReactNode;
    heroAvatar?: ReactNode;
    'view-home'?: ReactNode;
    'view-favorites'?: ReactNode;
    'view-titles'?: ReactNode;
    'view-manage'?: ReactNode;
  };
  bind?: {
    userHero?: ComponentProps<'header'>;
    userNav?: ComponentProps<'nav'>;
    favoritesNav?: ComponentProps<'a'>;
    manageNav?: ComponentProps<'a'>;
    'view-home'?: ComponentProps<'section'>;
    'view-favorites'?: ComponentProps<'section'>;
    'view-titles'?: ComponentProps<'section'>;
    'view-manage'?: ComponentProps<'section'>;
  };
}) {
  return (
    <main id="main" className="main container">
      <div id="userStatus">{slots['userStatus']}</div>
      <header className="profile-hero" id="userHero" hidden {...bind['userHero']}>
        <span className="profile-hero__avatar" id="heroAvatar">
          {slots['heroAvatar']}
        </span>
        <div className="profile-hero__info">
          <div className="profile-hero__row">
            <h1 className="profile-hero__username" id="heroUsername">
              {slots['heroUsername']}
            </h1>
            <span id="heroRole">{slots['heroRole']}</span>
            <span className="profile-hero__nickname" id="heroNickname">
              {slots['heroNickname']}
            </span>
          </div>
          {slots.heroDisplayId && <p className="profile-hero__id">{slots.heroDisplayId}</p>}
          <div className="profile-hero__row">
            <span className="profile-hero__signature" id="heroSignature">
              {slots['heroSignature']}
            </span>
          </div>
        </div>
      </header>
      <nav
        className="profile-tabs"
        aria-label="用户主页分区"
        id="userNav"
        hidden
        {...bind['userNav']}
      >
        <SiteLink className="side-nav__item" href="#home" data-panel="home">
          <svg className="icon" aria-hidden="true">
            <use href="/img/icons.svg#i-home"></use>
          </svg>
          {'主页'}
        </SiteLink>
        <SiteLink
          className="side-nav__item"
          href="#favorites"
          data-panel="favorites"
          id="favoritesNav"
          hidden
          {...bind['favoritesNav']}
        >
          <svg className="icon" aria-hidden="true">
            <use href="/img/icons.svg#i-star"></use>
          </svg>
          {'收藏'}
        </SiteLink>
        <SiteLink className="side-nav__item" href="#titles" data-panel="titles" id="titlesNav">
          <svg className="icon" aria-hidden="true">
            <use href="/img/icons.svg#i-award"></use>
          </svg>
          {'头衔'}
        </SiteLink>
        <SiteLink
          className="side-nav__item"
          href="#manage"
          data-panel="manage"
          id="manageNav"
          hidden
          {...bind['manageNav']}
        >
          <svg className="icon" aria-hidden="true">
            <use href="/img/icons.svg#i-shield"></use>
          </svg>
          {'管理'}
        </SiteLink>
      </nav>
      <div id="userViews">
        <section className="view" id="view-home" hidden {...bind['view-home']}>
          {slots['view-home']}
        </section>
        <section className="view" id="view-favorites" hidden {...bind['view-favorites']}>
          {slots['view-favorites']}
        </section>
        <section className="view" id="view-titles" hidden {...bind['view-titles']}>
          {slots['view-titles']}
        </section>
        <section className="view" id="view-manage" hidden {...bind['view-manage']}>
          {slots['view-manage']}
        </section>
      </div>
    </main>
  );
}
