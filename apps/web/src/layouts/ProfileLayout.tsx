import { SiteLink } from '../components/SiteLink';
import type { ReactNode, ComponentProps } from 'react';
export function ProfileLayout({
  slots = {},
  bind = {},
}: {
  slots?: {
    profileStatus?: ReactNode;
    heroUsername?: ReactNode;
    heroNickname?: ReactNode;
    heroSignature?: ReactNode;
    heroRole?: ReactNode;
    avatarBox?: ReactNode;
    'view-home'?: ReactNode;
    'view-favorites'?: ReactNode;
    titleChoices?: ReactNode;
    titlePreview?: ReactNode;
    titlesLocked?: ReactNode;
  };
  bind?: {
    chooseAvatar?: ComponentProps<'button'>;
    avatarFile?: ComponentProps<'input'>;
    heroNickname?: ComponentProps<'span'>;
    heroSignature?: ComponentProps<'span'>;
    'view-home'?: ComponentProps<'section'>;
    'view-favorites'?: ComponentProps<'section'>;
    'view-titles'?: ComponentProps<'section'>;
    wearSubmit?: ComponentProps<'button'>;
  };
}) {
  return (
    <main id="main" className="main container">
      <div id="profileStatus">{slots['profileStatus']}</div>
      <header className="profile-hero">
        <span className="avatar-edit profile-hero__avatar">
          <span id="avatarBox">{slots['avatarBox']}</span>
          <button
            type="button"
            className="avatar-edit__btn"
            id="chooseAvatar"
            aria-label="更换头像"
            {...bind['chooseAvatar']}
          >
            <svg className="icon icon--sm" aria-hidden="true">
              <use href="/img/icons.svg#i-pencil"></use>
            </svg>
          </button>
          <input
            type="file"
            id="avatarFile"
            accept="image/jpeg,image/png"
            hidden
            name="avatarFile"
            {...bind['avatarFile']}
          />
        </span>
        <div className="profile-hero__info">
          <div className="profile-hero__row">
            <h1 className="profile-hero__username" id="heroUsername">
              {slots['heroUsername']}
            </h1>
            <span id="heroRole">{slots['heroRole']}</span>
            <span
              className="profile-hero__edit"
              id="heroNickname"
              contentEditable="true"
              role="textbox"
              aria-label="昵称，点击编辑"
              spellCheck="false"
              data-placeholder="设置昵称"
              {...bind['heroNickname']}
            >
              {slots['heroNickname']}
            </span>
          </div>
          <div className="profile-hero__row">
            <span
              className="profile-hero__edit profile-hero__edit--sig"
              id="heroSignature"
              contentEditable="true"
              role="textbox"
              aria-label="个性签名，点击编辑"
              spellCheck="false"
              data-placeholder="填写个性签名"
              {...bind['heroSignature']}
            >
              {slots['heroSignature']}
            </span>
          </div>
        </div>
      </header>
      <nav className="profile-tabs" aria-label="个人中心分区" id="profileNav">
        <SiteLink className="side-nav__item" href="#home" data-panel="home">
          <svg className="icon" aria-hidden="true">
            <use href="/img/icons.svg#i-home"></use>
          </svg>
          {'主页'}
        </SiteLink>
        <SiteLink className="side-nav__item" href="#favorites" data-panel="favorites">
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
        <SiteLink className="side-nav__item" href="settings.html">
          <svg className="icon" aria-hidden="true">
            <use href="/img/icons.svg#i-settings"></use>
          </svg>
          {'设置'}
        </SiteLink>
      </nav>
      <section className="view" id="view-home" hidden {...bind['view-home']}>
        {slots['view-home']}
      </section>
      <section className="view" id="view-favorites" hidden {...bind['view-favorites']}>
        {slots['view-favorites']}
      </section>
      <section className="view" id="view-titles" hidden {...bind['view-titles']}>
        <div className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{'选择佩戴'}</h2>
            <p className="panel__desc">{' 同一时间只能佩戴一个头衔；也可以不佩戴。 '}</p>
          </div>
          <div className="panel__body stack">
            <div className="title-preview" aria-live="polite">
              <span className="title-preview__label">{'预览'}</span>
              <span id="titlePreview">{slots['titlePreview']}</span>
            </div>
            <div className="choice-group choice-group--2" id="titleChoices">
              {slots['titleChoices']}
            </div>
            <div id="titlesEmpty"></div>
            <div className="choice-group choice-group--2" id="titlesLocked">
              {slots['titlesLocked']}
            </div>
          </div>
          <div className="panel__foot">
            <span className="status-text" id="wearMsg"></span>
            <button
              type="button"
              className="btn btn--primary"
              id="wearSubmit"
              disabled
              {...bind['wearSubmit']}
            >
              {' 保存佩戴 '}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
