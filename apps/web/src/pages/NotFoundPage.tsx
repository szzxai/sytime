import { SiteLink } from '../components/SiteLink';
export function NotFoundPage() {
  return (
    <main id="main" className="auth container container--narrow">
      <div className="card">
        <div className="empty">
          <div className="empty__icon">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-compass"></use>
            </svg>
          </div>
          <h1 className="empty__title">{'页面不存在或已被删除'}</h1>
          <div className="empty__desc">{'地址可能输入有误，或内容已被移除。'}</div>
          <div className="empty__actions">
            <SiteLink className="btn btn--primary" href="/">
              {'返回首页'}
            </SiteLink>
            <SiteLink className="btn" href="/shops.html">
              {'去必吃榜'}
            </SiteLink>
          </div>
        </div>
      </div>
    </main>
  );
}
