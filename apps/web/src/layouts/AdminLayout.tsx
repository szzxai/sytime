import { FieldCounter } from '../components/FormFields';
import type { ReactNode, ComponentProps } from 'react';
export function AdminLayout({
  slots = {},
  bind = {},
}: {
  slots?: {
    adminStatus?: ReactNode;
    denyBox?: ReactNode;
    adminNav?: ReactNode;
    annList?: ReactNode;
    reviewList?: ReactNode;
    appealList?: ReactNode;
    ticketList?: ReactNode;
    inviteList?: ReactNode;
    userList?: ReactNode;
    'view-titles-mgmt'?: ReactNode;
    'view-menu'?: ReactNode;
    'view-menu-import'?: ReactNode;
    'view-weekly'?: ReactNode;
  };
  bind?: {
    adminShell?: ComponentProps<'div'>;
    'view-menu-import'?: ComponentProps<'section'>;
    'view-menu'?: ComponentProps<'section'>;
    'view-banner'?: ComponentProps<'section'>;
    bannerForm?: ComponentProps<'form'>;
    bannerInput?: ComponentProps<'input'>;
    bannerClear?: ComponentProps<'button'>;
    bannerSubmit?: ComponentProps<'button'>;
    'view-announce'?: ComponentProps<'section'>;
    annForm?: ComponentProps<'form'>;
    annSubmit?: ComponentProps<'button'>;
    'view-notify'?: ComponentProps<'section'>;
    notifyForm?: ComponentProps<'form'>;
    ntSubmit?: ComponentProps<'button'>;
    'view-weekly'?: ComponentProps<'section'>;
    'view-review'?: ComponentProps<'section'>;
    'view-appeals'?: ComponentProps<'section'>;
    'view-tickets'?: ComponentProps<'section'>;
    'view-users'?: ComponentProps<'section'>;
    'view-titles-mgmt'?: ComponentProps<'section'>;
    'view-invite'?: ComponentProps<'section'>;
    inviteForm?: ComponentProps<'form'>;
    inviteAdd?: ComponentProps<'button'>;
    denyBox?: ComponentProps<'div'>;
  };
}) {
  return (
    <main id="main" className="main container container--wide">
      <div className="page-head">
        <h1 className="page-head__title" id="adminTitle">
          {'管理后台'}
        </h1>
      </div>
      <div id="adminStatus">{slots['adminStatus']}</div>
      <div className="shell" id="adminShell" hidden {...bind['adminShell']}>
        <nav className="side-nav" aria-label="后台分类" id="adminNav">
          {slots['adminNav']}
        </nav>
        <div className="shell__main" id="contentArea">
          <section
            className="view stack stack--md"
            id="view-menu-import"
            hidden
            {...bind['view-menu-import']}
          >
            {slots['view-menu-import']}
          </section>
          <section className="view stack stack--md" id="view-menu" hidden {...bind['view-menu']}>
            {slots['view-menu']}
          </section>
          <section className="view" id="view-banner" hidden {...bind['view-banner']}>
            <form id="bannerForm" noValidate {...bind['bannerForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'全站横幅'}</h2>
                </div>
                <div className="panel__body form">
                  <div className="field">
                    <label className="field__label" htmlFor="bannerInput">
                      {'横幅文本'}
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="bannerInput"
                      name="bannerInput"
                      data-counter="100"
                      {...bind['bannerInput']}
                    />
                    <div className="field__foot">
                      <span className="field__hint">{'显示在每个页面顶部，留空则不显示。'}</span>
                      <FieldCounter htmlFor="bannerInput" max={100} />
                    </div>
                  </div>
                </div>
                <div className="panel__foot">
                  <span className="status-text" id="bannerMsg" role="status"></span>
                  <button type="button" className="btn" id="bannerClear" {...bind['bannerClear']}>
                    {' 取消横幅'}
                  </button>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="bannerSubmit"
                    {...bind['bannerSubmit']}
                  >
                    {' 确认修改 '}
                  </button>
                </div>
              </div>
            </form>
          </section>
          <section className="view" id="view-announce" hidden {...bind['view-announce']}>
            <form id="annForm" noValidate {...bind['annForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'发布公告'}</h2>
                </div>
                <div className="panel__body form">
                  <div className="field">
                    <label className="field__label" htmlFor="annTitle">
                      {'公告标题'}
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="annTitle"
                      name="annTitle"
                      required
                      data-counter="60"
                    />
                    <div className="field__foot">
                      <span className="field__hint"></span>
                      <FieldCounter htmlFor="annTitle" max={60} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="annContent">
                      {'公告内容'}
                    </label>
                    <textarea
                      className="textarea"
                      id="annContent"
                      name="annContent"
                      required
                      data-counter="2000"
                    />
                    <div className="field__foot">
                      <span className="field__hint"></span>
                      <FieldCounter htmlFor="annContent" max={2000} />
                    </div>
                  </div>
                </div>
                <div className="panel__foot">
                  <span className="status-text" id="annMsg" role="status"></span>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="annSubmit"
                    {...bind['annSubmit']}
                  >
                    {' 发布公告 '}
                  </button>
                </div>
              </div>
            </form>
            <h2 className="section__title u-mt-6 u-mb-4">{'已发布公告'}</h2>
            <div id="annList" className="queue-list" aria-live="polite">
              {slots['annList']}
            </div>
          </section>
          <section className="view" id="view-notify" hidden {...bind['view-notify']}>
            <form id="notifyForm" noValidate {...bind['notifyForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'发送系统通知'}</h2>
                  <p className="panel__desc">{'将出现在全体用户的消息箱中。'}</p>
                </div>
                <div className="panel__body form">
                  <div className="field">
                    <label className="field__label" htmlFor="ntTitle">
                      {'标题'}
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="ntTitle"
                      required
                      data-counter="40"
                      name="ntTitle"
                    />
                    <div className="field__foot">
                      <span className="field__hint"></span>
                      <FieldCounter htmlFor="ntTitle" max={40} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="ntBody">
                      {'正文'}
                    </label>
                    <textarea
                      className="textarea"
                      id="ntBody"
                      required
                      data-counter="500"
                      name="ntBody"
                    />
                    <div className="field__foot">
                      <span className="field__hint"></span>
                      <FieldCounter htmlFor="ntBody" max={500} />
                    </div>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" className="check" id="ntImportant" name="ntImportant" />
                    <span className="check-row__text">
                      {'标记为重要'}
                      <span className="check-row__desc">
                        {'显示「重要」标记；用户的系统消息接收始终包含此类'}
                      </span>
                    </span>
                  </label>
                </div>
                <div className="panel__foot">
                  <span className="status-text" id="ntMsg" role="status"></span>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="ntSubmit"
                    {...bind['ntSubmit']}
                  >
                    {' 发送 '}
                  </button>
                </div>
              </div>
            </form>
          </section>
          <section className="view" id="view-weekly" hidden {...bind['view-weekly']}>
            {slots['view-weekly']}
          </section>
          <section className="view" id="view-review" hidden {...bind['view-review']}>
            <div id="reviewList" className="queue-list" aria-live="polite">
              {slots['reviewList']}
            </div>
          </section>
          <section className="view" id="view-appeals" hidden {...bind['view-appeals']}>
            <div id="appealList" className="queue-list" aria-live="polite">
              {slots['appealList']}
            </div>
          </section>
          <section className="view" id="view-tickets" hidden {...bind['view-tickets']}>
            <div id="ticketList" className="queue-list" aria-live="polite">
              {slots['ticketList']}
            </div>
          </section>
          <section className="view" id="view-users" hidden {...bind['view-users']}>
            <div id="userList">{slots['userList']}</div>
          </section>
          <section className="view" id="view-titles-mgmt" hidden {...bind['view-titles-mgmt']}>
            {slots['view-titles-mgmt']}
          </section>
          <section className="view" id="view-invite" hidden {...bind['view-invite']}>
            <form id="inviteForm" noValidate {...bind['inviteForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'添加邀请码'}</h2>
                  <p className="panel__desc">
                    {' 学生认证时填入有效邀请码可直接通过；次数用完后失效。 '}
                  </p>
                </div>
                <div className="panel__body form">
                  <div className="form-grid form-grid--2">
                    <div className="field">
                      <label className="field__label" htmlFor="inviteCodeInput">
                        {'邀请码'}
                      </label>
                      <input
                        className="input"
                        type="text"
                        id="inviteCodeInput"
                        name="inviteCodeInput"
                        required
                      />
                      <div className="field__foot">
                        <span className="field__hint"></span>
                      </div>
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="inviteMaxInput">
                        {'可用次数'}
                      </label>
                      <input
                        className="input"
                        type="number"
                        id="inviteMaxInput"
                        name="inviteMaxInput"
                        min="0"
                        step="1"
                        defaultValue="0"
                      />
                      <div className="field__foot">
                        <span className="field__hint">{'0 为不限'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="panel__foot">
                  <span className="status-text" id="inviteMsg" role="status"></span>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="inviteAdd"
                    {...bind['inviteAdd']}
                  >
                    {' 添加 '}
                  </button>
                </div>
              </div>
            </form>
            <h2 className="section__title u-mt-6 u-mb-4">{'已有邀请码'}</h2>
            <div id="inviteList" className="queue-list" aria-live="polite">
              {slots['inviteList']}
            </div>
          </section>
        </div>
      </div>
      <div id="denyBox" hidden {...bind['denyBox']}>
        {slots['denyBox']}
      </div>
    </main>
  );
}
