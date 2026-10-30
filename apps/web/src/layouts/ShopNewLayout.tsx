import { SiteLink } from '../components/SiteLink';
import { FieldCounter } from '../components/FormFields';
import type { ReactNode, ComponentProps } from 'react';
export function ShopNewLayout({
  slots = {},
  bind = {},
}: {
  slots?: {
    permNotice?: ReactNode;
    scopeText?: ReactNode;
    typeChips?: ReactNode;
    pickMap?: ReactNode;
    sNoteError?: ReactNode;
    sDianpingError?: ReactNode;
    sNameError?: ReactNode;
    sAddrError?: ReactNode;
    typeFieldError?: ReactNode;
    sLatError?: ReactNode;
    sLngError?: ReactNode;
    sCampusDistError?: ReactNode;
    sCampusWalkError?: ReactNode;
    sMetroError?: ReactNode;
    sMetroExitError?: ReactNode;
    sMetroDistError?: ReactNode;
    sMetroWalkError?: ReactNode;
  };
  bind?: {
    permNotice?: ComponentProps<'div'>;
    shopForm?: ComponentProps<'form'>;
    sName?: ComponentProps<'input'>;
    sAddr?: ComponentProps<'input'>;
    typeField?: ComponentProps<'div'>;
    customType?: ComponentProps<'input'>;
    sLat?: ComponentProps<'input'>;
    sLng?: ComponentProps<'input'>;
    sCampusDist?: ComponentProps<'input'>;
    sCampusWalk?: ComponentProps<'input'>;
    measureCampus?: ComponentProps<'button'>;
    sMetro?: ComponentProps<'input'>;
    sMetroExit?: ComponentProps<'input'>;
    sMetroDist?: ComponentProps<'input'>;
    sMetroWalk?: ComponentProps<'input'>;
    shopSubmit?: ComponentProps<'button'>;
  };
}) {
  return (
    <main id="main" className="main container container--form">
      <SiteLink className="back-link" href="shops.html">
        <svg className="icon icon--sm" aria-hidden="true">
          <use href="/img/icons.svg#i-arrow-left"></use>
        </svg>
        {'返回必吃榜'}
      </SiteLink>
      <h1
        className="page-head__title"
        style={{ fontSize: 'var(--fs-2xl)', marginBottom: 'var(--sp-2)' }}
      >
        {' 添加店铺 '}
      </h1>
      <p className="u-muted u-fs-sm u-mb-6" id="scopeText">
        {'scopeText' in slots ? (
          slots['scopeText']
        ) : (
          <>{' 收录范围以三元坊周边为准，距离与步行时间请在高德地图用步行路线查询后填写。 '}</>
        )}
      </p>
      <div id="permNotice" hidden {...bind['permNotice']}>
        {'permNotice' in slots ? slots['permNotice'] : <></>}
      </div>
      <form id="shopForm" className="form" noValidate hidden {...bind['shopForm']}>
        <section className="form__group" aria-labelledby="baseTitle">
          <h2 className="form__group-title section__title" id="baseTitle">
            {' 基本信息 '}
          </h2>
          <div className="field">
            <label className="field__label" htmlFor="sName">
              {'店铺名称'}
            </label>
            <input
              className="input"
              id="sName"
              type="text"
              data-counter="30"
              enterKeyHint="next"
              autoComplete="off"
              name="sName"
              {...bind['sName']}
            />
            {slots['sNameError']}
            <div className="field__foot">
              <span className="field__hint">{'和门头招牌一致更容易被认出来'}</span>
              <FieldCounter htmlFor="sName" max={30} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sAddr">
              {'店铺地址'}
            </label>
            <input
              className="input"
              id="sAddr"
              type="text"
              placeholder="例如：十梓街 123 号"
              enterKeyHint="next"
              autoComplete="off"
              name="sAddr"
              {...bind['sAddr']}
            />
            {slots['sAddrError']}
            <div className="field__hint">
              {' 需要包含道路/巷坊名和门牌号，例如十梓街 123 号或滚绣坊 51 号 '}
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sNote">
              {'补充位置描述 '}
              <span className="field__opt">{'（选填）'}</span>
            </label>
            <input
              className="input"
              id="sNote"
              type="text"
              data-counter="40"
              placeholder="例如：XX 路口的 XX 大楼一层"
              enterKeyHint="next"
              autoComplete="off"
              name="sNote"
            />
            {slots['sNoteError']}
            <div className="field__foot">
              <span className="field__hint"></span>
              <FieldCounter htmlFor="sNote" max={40} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sDianping">
              {'大众点评链接 '}
              <span className="field__opt">{'（选填）'}</span>
            </label>
            <input
              className="input"
              id="sDianping"
              type="url"
              maxLength={500}
              placeholder="https://www.dianping.com/shop/..."
              autoComplete="url"
              name="sDianping"
            />
            {slots['sDianpingError']}
            <div className="field__hint">
              {'有大众点评商户页时粘贴完整链接；仅接受 dianping.com 域名。'}
            </div>
          </div>
          <div className="field" id="typeField" {...bind['typeField']}>
            <span className="field__label" id="typeLabel">
              {'店铺类型'}
            </span>
            <div className="chips" id="typeChips" role="radiogroup" aria-labelledby="typeLabel">
              {'typeChips' in slots ? slots['typeChips'] : <></>}
            </div>
            <input
              className="input u-mt-2"
              id="customType"
              type="text"
              data-counter="8"
              placeholder="自定义类型，8 字以内"
              aria-label="自定义店铺类型"
              autoComplete="off"
              hidden
              name="customType"
              {...bind['customType']}
            />
          </div>
        </section>
        <section className="form__group" aria-labelledby="geoTitle">
          <h2 className="form__group-title section__title" id="geoTitle">
            {' 地图位置 '}
          </h2>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="sLat">
                {'纬度（GCJ-02）'}
              </label>
              <input
                className="input"
                id="sLat"
                type="number"
                step="0.000001"
                inputMode="decimal"
                placeholder="31.3xxxxx"
                name="sLat"
                {...bind['sLat']}
              />
              {slots['sLatError']}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sLng">
                {'经度（GCJ-02）'}
              </label>
              <input
                className="input"
                id="sLng"
                type="number"
                step="0.000001"
                inputMode="decimal"
                placeholder="120.6xxxxx"
                name="sLng"
                {...bind['sLng']}
              />
              {slots['sLngError']}
            </div>
          </div>
          <div className="field">
            <span className="field__hint">
              {'用 '}
              <SiteLink
                href="https://lbs.amap.com/tools/picker"
                target="_blank"
                rel="noopener noreferrer"
              >
                {'高德坐标拾取器'}
              </SiteLink>
              {' 点选店铺位置后复制坐标（GCJ-02，经纬度顺序以拾取器为准）。'}
            </span>
          </div>
          <div className="shop-map" id="pickMap" role="region" aria-label="位置预览地图">
            {'pickMap' in slots ? (
              slots['pickMap']
            ) : (
              <>
                <div className="shop-map__state u-muted">{'填写坐标后在此预览位置'}</div>
              </>
            )}
          </div>
        </section>
        <section className="form__group" aria-labelledby="distTitle">
          <h2 className="form__group-title section__title" id="distTitle">
            {' 步行距离与时间 '}
          </h2>
          <p className="u-muted u-fs-sm">
            {
              ' 单位为步行距离（非直线距离），路线起点为苏州中学本部主校区坐标（人民路 699 号）。可在高德地图用「步行」路线查询后填写，或点「测算」自动获取。 '
            }
          </p>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="sCampusDist">
                {'距苏州中学本部（米）'}
              </label>
              <input
                className="input"
                id="sCampusDist"
                type="number"
                min="1"
                max="20000"
                step="1"
                inputMode="numeric"
                name="sCampusDist"
                {...bind['sCampusDist']}
              />
              {slots['sCampusDistError']}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sCampusWalk">
                {'预计步行时间（分钟）'}
              </label>
              <input
                className="input"
                id="sCampusWalk"
                type="number"
                min="1"
                max="240"
                step="1"
                inputMode="numeric"
                name="sCampusWalk"
                {...bind['sCampusWalk']}
              />
              {slots['sCampusWalkError']}
            </div>
          </div>
          <div className="row row--sm" data-measure="campus" hidden>
            <button
              type="button"
              className="btn btn--sm"
              id="measureCampus"
              {...bind['measureCampus']}
            >
              {'用高德地图测算从本部出发的路线'}
            </button>
            <span className="status-text" id="measureCampusState"></span>
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="sMetro">
                {'最近的地铁站'}
              </label>
              <input
                className="input"
                id="sMetro"
                type="text"
                data-counter="30"
                placeholder="例如：乐桥"
                autoComplete="off"
                name="sMetro"
                {...bind['sMetro']}
              />
              {slots['sMetroError']}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sMetroExit">
                {'最近的地铁站出口'}
              </label>
              <input
                className="input"
                id="sMetroExit"
                type="text"
                data-counter="20"
                placeholder="例如：3 号口"
                autoComplete="off"
                name="sMetroExit"
                {...bind['sMetroExit']}
              />
              {slots['sMetroExitError']}
            </div>
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="sMetroDist">
                {'从该出口到店铺（米）'}
              </label>
              <input
                className="input"
                id="sMetroDist"
                type="number"
                min="1"
                max="20000"
                step="1"
                inputMode="numeric"
                name="sMetroDist"
                {...bind['sMetroDist']}
              />
              {slots['sMetroDistError']}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sMetroWalk">
                {'从该出口步行（分钟）'}
              </label>
              <input
                className="input"
                id="sMetroWalk"
                type="number"
                min="1"
                max="240"
                step="1"
                inputMode="numeric"
                name="sMetroWalk"
                {...bind['sMetroWalk']}
              />
              {slots['sMetroWalkError']}
            </div>
          </div>
          <p className="field__hint">
            {' 地铁段请以出口为起点查询步行路线：例如「乐桥站 3 号口 → 店铺」。 '}
          </p>
        </section>
        <div className="form__actions form__actions--sticky">
          <button
            type="submit"
            className="btn btn--primary btn--lg"
            id="shopSubmit"
            {...bind['shopSubmit']}
          >
            {' 保存 '}
          </button>
        </div>
      </form>
    </main>
  );
}
