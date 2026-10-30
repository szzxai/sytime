import { SiteLink } from '../components/SiteLink';
import { FieldCounter } from '../components/FormFields';
import { PasswordField } from '../components/FormFields';
import type { ReactNode, ComponentProps } from 'react';
export function SettingsLayout({
  slots = {},
  bind = {},
}: {
  slots?: {
    settingsStatus?: ReactNode;
    siteMsg?: ReactNode;
    shopDefaultType?: ReactNode;
    defaultCollectionShops?: ReactNode;
    shopLayoutModeChoices?: ReactNode;
    showRoleHint?: ReactNode;
    myTicketList?: ReactNode;
  };
  bind?: {
    settingsNav?: ComponentProps<'nav'>;
    'view-security'?: ComponentProps<'section'>;
    passwordForm?: ComponentProps<'form'>;
    passwordSubmit?: ComponentProps<'button'>;
    'view-site'?: ComponentProps<'section'>;
    siteForm?: ComponentProps<'form'>;
    defaultPage?: ComponentProps<'select'>;
    recipeDefaultView?: ComponentProps<'select'>;
    shopPrefFields?: ComponentProps<'div'>;
    shopDefaultSort?: ComponentProps<'select'>;
    shopDefaultType?: ComponentProps<'select'>;
    defaultCollectionShops?: ComponentProps<'select'>;
    collectionDefaultPublic?: ComponentProps<'input'>;
    showRole?: ComponentProps<'input'>;
    siteSubmit?: ComponentProps<'button'>;
    'view-tickets'?: ComponentProps<'section'>;
    ticketForm?: ComponentProps<'form'>;
    ticketSubmit?: ComponentProps<'button'>;
    'view-messages'?: ComponentProps<'section'>;
  };
}) {
  return (
    <main id="main" className="main container">
      <div className="page-head">
        <h1 className="page-head__title">{'设置'}</h1>
      </div>
      <div id="settingsStatus">{slots['settingsStatus']}</div>
      <div className="shell">
        <nav className="side-nav" aria-label="设置" id="settingsNav" {...bind['settingsNav']}>
          <SiteLink className="side-nav__item" href="#security" data-panel="security">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-lock"></use>
            </svg>
            {'账号安全'}
          </SiteLink>
          <SiteLink className="side-nav__item" href="#site" data-panel="site">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-settings"></use>
            </svg>
            {'网站设置'}
          </SiteLink>
          <SiteLink className="side-nav__item" href="#tickets" data-panel="tickets">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-clipboard"></use>
            </svg>
            {'工单'}
          </SiteLink>
          <SiteLink className="side-nav__item" href="#messages" data-panel="messages">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-bell"></use>
            </svg>
            {'消息通知'}
          </SiteLink>
          <button type="button" className="side-nav__item" data-logout="">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-logout"></use>
            </svg>
            {'退出登录 '}
          </button>
        </nav>
        <div className="shell__main">
          <section className="view" id="view-security" hidden {...bind['view-security']}>
            <form id="passwordForm" noValidate {...bind['passwordForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'修改密码'}</h2>
                </div>
                <div className="panel__body form">
                  <PasswordField
                    label="旧密码"
                    id="oldPassword"
                    name="oldPassword"
                    required
                    autoComplete="current-password"
                    hint=""
                  />
                  <PasswordField
                    label="新密码"
                    id="newPassword"
                    name="newPassword"
                    required
                    autoComplete="new-password"
                    hint=""
                  />
                  <PasswordField
                    label="确认新密码"
                    id="confirmPassword"
                    name="confirmPassword"
                    required
                    autoComplete="new-password"
                    hint=""
                  />
                </div>
                <div className="panel__foot">
                  <span className="status-text" id="passwordMsg" role="status"></span>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="passwordSubmit"
                    {...bind['passwordSubmit']}
                  >
                    {' 保存 '}
                  </button>
                </div>
              </div>
            </form>
          </section>
          <section className="view" id="view-site" hidden {...bind['view-site']}>
            <form id="siteForm" noValidate {...bind['siteForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'网站设置'}</h2>
                </div>
                <div className="panel__body form">
                  <div className="field">
                    <label className="field__label" htmlFor="defaultPage">
                      {'默认进入界面'}
                    </label>
                    <select
                      className="select"
                      id="defaultPage"
                      name="defaultPage"
                      {...bind['defaultPage']}
                    >
                      <option value="index.html">{'首页'}</option>
                      <option value="map.html">{'校园地图'}</option>
                      <option value="recipe.html">{'菜品与食谱'}</option>
                    </select>
                    <span className="field__hint">{'访问网站首页时会自动跳转到所选界面'}</span>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="recipeDefaultView">
                      {'菜品与食谱默认页'}
                    </label>
                    <select
                      className="select"
                      id="recipeDefaultView"
                      name="recipeDefaultView"
                      {...bind['recipeDefaultView']}
                    >
                      <option value="daily">{'今日与明日'}</option>
                      <option value="all">{'全部菜品'}</option>
                      <option value="reviews">{'菜品评价'}</option>
                      <option value="weekly">{'每周食谱'}</option>
                    </select>
                    <span className="field__hint"></span>
                  </div>
                  <div id="shopPrefFields" hidden {...bind['shopPrefFields']}>
                    <div className="field">
                      <label className="field__label" htmlFor="shopDefaultSort">
                        {'必吃榜默认排序'}
                      </label>
                      <select
                        className="select"
                        id="shopDefaultSort"
                        name="shopDefaultSort"
                        {...bind['shopDefaultSort']}
                      >
                        <option value="campus">{'距苏州中学本部最近'}</option>
                        <option value="az">{'拼音排序'}</option>
                        <option value="metro">{'距地铁最近'}</option>
                        <option value="likes">{'按点赞数'}</option>
                        <option value="reviews">{'按评价数'}</option>
                        <option value="rating">{'按评分'}</option>
                        <option value="new">{'最新添加'}</option>
                      </select>
                      <span className="field__hint">{'进入三元坊必吃榜时默认使用的排序'}</span>
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="shopDefaultType">
                        {'必吃榜默认餐食类型'}
                      </label>
                      <select
                        className="select"
                        id="shopDefaultType"
                        name="shopDefaultType"
                        {...bind['shopDefaultType']}
                      >
                        {slots['shopDefaultType']}
                      </select>
                      <span className="field__hint">{'进入三元坊必吃榜时默认筛选的店铺类型'}</span>
                    </div>
                    <div className="field">
                      <span className="field__label">{'店铺详情页样式'}</span>
                      <div className="choice-group choice-group--2" id="shopLayoutModeChoices">
                        {slots['shopLayoutModeChoices']}
                      </div>
                      <span className="field__hint">
                        {
                          '选择手动时，可在店铺详情页切换纵向/双栏并记住上次选择；选择自动时按屏幕宽度自动选用布局'
                        }
                      </span>
                    </div>
                  </div>
                  <div className="field" id="collectionDefaultFields">
                    <span className="field__label">{'收藏默认页'}</span>
                    <div className="stack stack--sm">
                      <div className="field">
                        <label className="field__label" htmlFor="defaultCollectionShops">
                          {'必吃榜默认收藏夹'}
                        </label>
                        <select
                          className="select"
                          id="defaultCollectionShops"
                          name="defaultCollectionShops"
                          {...bind['defaultCollectionShops']}
                        >
                          {slots['defaultCollectionShops']}
                        </select>
                      </div>
                    </div>
                    <span className="field__hint">{'进入个人中心「收藏」时默认打开的收藏夹'}</span>
                  </div>
                  <div className="switch-row">
                    <div className="switch-row__text">
                      <label className="switch-row__title" htmlFor="collectionDefaultPublic">
                        {'新建收藏夹默认公开'}
                      </label>
                      <span className="switch-row__desc" id="collectionDefaultPublicHint">
                        {'仅影响之后新建的收藏夹，新建时仍可单独调整；已有收藏夹不变。'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      className="switch"
                      role="switch"
                      id="collectionDefaultPublic"
                      name="collectionDefaultPublic"
                      aria-describedby="collectionDefaultPublicHint"
                      disabled
                      {...bind['collectionDefaultPublic']}
                    />
                  </div>
                  <div className="field">
                    <span className="field__label">{'显示权限等级'}</span>
                    <label className="check-row">
                      <input
                        className="check"
                        type="checkbox"
                        id="showRole"
                        name="showRole"
                        {...bind['showRole']}
                      />
                      <span className="check-row__text">{'在评价等位置显示我的权限等级标签'}</span>
                    </label>
                    <span className="field__hint" id="showRoleHint">
                      {slots['showRoleHint']}
                    </span>
                  </div>
                </div>
                <div className="panel__foot">
                  <span className="status-text" id="siteMsg" role="status">
                    {slots['siteMsg']}
                  </span>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="siteSubmit"
                    {...bind['siteSubmit']}
                  >
                    {' 保存 '}
                  </button>
                </div>
              </div>
            </form>
          </section>
          <section className="view" id="view-tickets" hidden {...bind['view-tickets']}>
            <form id="ticketForm" noValidate {...bind['ticketForm']}>
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">{'新建工单'}</h2>
                </div>
                <div className="panel__body form">
                  <div className="field">
                    <label className="field__label" htmlFor="ticketTitle">
                      {'标题'}
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="ticketTitle"
                      name="ticketTitle"
                      required
                      data-counter="40"
                    />
                    <div className="field__foot">
                      <span className="field__hint"></span>
                      <FieldCounter htmlFor="ticketTitle" max={40} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="ticketContent">
                      {'内容'}
                    </label>
                    <textarea
                      className="textarea"
                      id="ticketContent"
                      name="ticketContent"
                      required
                      data-counter="1000"
                    />
                    <div className="field__foot">
                      <span className="field__hint"></span>
                      <FieldCounter htmlFor="ticketContent" max={1000} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="ticketVisibility">
                      {'可见范围'}
                    </label>
                    <select className="select" id="ticketVisibility" name="ticketVisibility">
                      <option value="admin">{'管理员及以上'}</option>
                      <option value="super_admin">{'超级管理员及以上'}</option>
                      <option value="developer">{'仅开发者'}</option>
                    </select>
                    <span className="field__hint">
                      {'工单将提交给所选权限及以上的管理人员处理。'}
                    </span>
                  </div>
                </div>
                <div className="panel__foot">
                  <button
                    type="submit"
                    className="btn btn--primary"
                    id="ticketSubmit"
                    {...bind['ticketSubmit']}
                  >
                    {' 提交工单 '}
                  </button>
                </div>
              </div>
            </form>
            <section className="section">
              <h2 className="section__title u-mb-4">{'我的工单'}</h2>
              <div id="myTicketList" className="stack stack--md" aria-live="polite">
                {slots['myTicketList']}
              </div>
            </section>
          </section>
          <section className="view" id="view-messages" hidden {...bind['view-messages']}>
            <div className="panel">
              <div className="panel__head">
                <h2 className="panel__title">{'消息通知'}</h2>
                <p className="panel__desc">{' 管理员通知和头衔授予消息会显示在消息箱。 '}</p>
              </div>
              <div className="panel__body">
                <div className="switch-row">
                  <div className="switch-row__text">
                    <span className="switch-row__title">{'系统消息'}</span>
                    <span className="switch-row__desc">
                      {'管理员发布的通知。其中「重要」通知无法关闭。'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="switch"
                    role="switch"
                    defaultChecked
                    disabled
                    aria-label="系统消息"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
