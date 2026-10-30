import { SiteLink } from '../components/SiteLink';
import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { createCampusMap } from '../maps/campus';
import { campusPlaces, campusSources } from '../maps/places';
type Place = (typeof campusPlaces)[number];
const categories: Record<string, string> = {
  study: '教学空间',
  heritage: '人文地标',
  nature: '校园园林',
  life: '校园生活',
  sport: '运动场地',
  gate: '校园出入口',
};
function Thumbnail({ place }: { place: Place }) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <use href={`#art-${place.icon}`} />
    </svg>
  );
}
export function MapPage() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Awaited<ReturnType<typeof createCampusMap>>>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Place | null>(null);
  const [directory, setDirectory] = useState(false);
  const origin = useRef<HTMLElement | null>(null);
  const detail = useRef<HTMLHeadingElement>(null);
  const rows = campusPlaces.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      (!search.trim() ||
        (p.name + ('alias' in p ? p.alias : '') + p.summary + p.area + categories[p.category])
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  function select(p: Place, source: HTMLElement) {
    origin.current = source;
    setSelected(p);
    setDirectory(false);
  }
  function close(focus = true) {
    setSelected(null);
    if (focus)
      (origin.current?.isConnected ? origin.current : host.current)?.focus({ preventScroll: true });
  }
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setError(false);
    createCampusMap(
      host.current,
      (place: Place, source: HTMLElement) => flushSync(() => select(place, source)),
      controller.signal,
    )
      .then((map) => {
        if (disposed) {
          map?.destroy();
          return;
        }
        engine.current = map;
        setReady(true);
        document.body.dataset.guideReady = 'true';
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      controller.abort();
      engine.current?.destroy();
      engine.current = null;
      delete document.body.dataset.guideReady;
    };
  }, [revision]);
  useEffect(() => {
    if (!ready) return;
    engine.current?.filter(
      new Set(
        campusPlaces
          .filter(
            (p) =>
              (category === 'all' || p.category === category) &&
              (!search.trim() ||
                (
                  p.name +
                  ('alias' in p ? p.alias : '') +
                  p.summary +
                  p.area +
                  categories[p.category]
                )
                  .toLowerCase()
                  .includes(search.trim().toLowerCase())),
          )
          .map((p) => p.id),
      ),
    );
    if (
      selected &&
      ((category !== 'all' && selected.category !== category) ||
        (search.trim() &&
          !(
            selected.name +
            ('alias' in selected ? selected.alias : '') +
            selected.summary +
            selected.area +
            categories[selected.category]
          )
            .toLowerCase()
            .includes(search.trim().toLowerCase())))
    )
      setSelected(null);
  }, [ready, search, category, selected]);
  useEffect(() => {
    engine.current?.selection(selected?.id);
    if (selected) {
      engine.current?.reveal(selected);
      detail.current?.focus({ preventScroll: true });
      document.getElementById('detailContent')?.scrollTo(0, 0);
    }
  }, [selected]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (selected) {
        close();
        e.preventDefault();
      }
      if (directory) {
        setDirectory(false);
        document.getElementById('placesToggle')?.focus();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [selected, directory]);
  return (
    <main className="campus-page" id="main">
      <aside className="campus-sidebar" aria-label="地点目录">
        <div className="campus-intro">
          <p className="campus-eyebrow">苏州中学 · 本部校园</p>
          <div className="campus-title-row">
            <h1>
              校园地图
              <span className="campus-title-dot" />
            </h1>
            <button
              type="button"
              id="placesToggle"
              aria-expanded={directory}
              aria-controls="placesPanel"
              onClick={() => setDirectory(!directory)}
            >
              地点目录 <span aria-hidden="true">⌄</span>
            </button>
          </div>
          <p className="campus-subtitle">循着书声，走进苏中。</p>
        </div>
        <div className="campus-discovery">
          <div className="campus-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              id="placeSearch"
              type="search"
              placeholder="寻找校园里的一个地方"
              aria-label="搜索校园地点"
              autoComplete="off"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDirectory(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rows[0]) select(rows[0], e.currentTarget);
              }}
            />
            <button
              type="button"
              id="clearSearch"
              aria-label="清空搜索"
              hidden={!search}
              onClick={() => {
                setSearch('');
                document.getElementById('placeSearch')?.focus();
              }}
            >
              ×
            </button>
          </div>
          <div className="campus-filters" role="group" aria-label="地点分类">
            {Object.entries({
              all: '全部',
              study: '教学',
              heritage: '人文',
              nature: '园林',
              life: '生活',
              sport: '运动',
            }).map(([key, label]) => (
              <button
                type="button"
                data-category={key}
                aria-pressed={category === key}
                key={key}
                onClick={() => {
                  setCategory(key);
                  setDirectory(true);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={`campus-places-panel${directory ? ' is-open' : ''}`} id="placesPanel">
          <div className="campus-list-heading">
            <h2 id="placesHeading">
              {search.trim() ? '搜索结果' : category === 'all' ? '探索校园' : categories[category]}
            </h2>
            <span id="placesCount" role="status" aria-live="polite">
              {rows.length} 个地点
            </span>
          </div>
          <div className="campus-place-list" id="placeList">
            {rows.map((p) => (
              <button
                type="button"
                className="campus-place-row"
                data-place={p.id}
                key={p.id}
                aria-pressed={selected?.id === p.id}
                onClick={(e) => select(p, e.currentTarget)}
              >
                <span className="campus-place-thumb">
                  <Thumbnail place={p} />
                </span>
                <span className="campus-place-text">
                  <strong>{p.name}</strong>
                  <span>{p.summary || categories[p.category]}</span>
                </span>
                <span className="campus-row-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>
          <div className="campus-empty" id="placesEmpty" hidden={!!rows.length}>
            <strong>没有找到这个地点</strong>
            <p>换个名称，或试试其他分类。</p>
            <button
              type="button"
              id="resetSearch"
              onClick={() => {
                setCategory('all');
                setSearch('');
              }}
            >
              查看全部地点
            </button>
          </div>
        </div>
        <div className="campus-sidebar-foot">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15" />
          </svg>
          <span>
            本部校园<span className="campus-foot-separator">·</span>苏州 · 人民路
          </span>
        </div>
      </aside>
      <section className="campus-stage" aria-label="校园导览">
        <div
          id="guideMap"
          ref={host}
          role="region"
          tabIndex={0}
          aria-label="校园导览地图；方向键移动，加减键缩放，Home 键回到全景"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const moves: Record<string, number[]> = {
              ArrowUp: [0, -80],
              ArrowDown: [0, 80],
              ArrowLeft: [-80, 0],
              ArrowRight: [80, 0],
              w: [0, -80],
              s: [0, 80],
              a: [-80, 0],
              d: [80, 0],
            };
            if (moves[e.key]) engine.current?.pan(moves[e.key]);
            else if (e.key === '+' || e.key === '=') engine.current?.zoom(0.4);
            else if (e.key === '-') engine.current?.zoom(-0.4);
            else if (e.key === 'Home') {
              close(false);
              engine.current?.fit();
            } else return;
            e.preventDefault();
          }}
        />
        <div className="campus-compass" id="guideCompass" aria-label="地图上方为北">
          <span>N</span>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="m20 5 8 28-8-6-8 6Z" />
            <path className="compass-half" d="m20 5 8 28-8-6Z" />
          </svg>
          <span>北</span>
        </div>
        <div className="campus-controls" id="guideControls" role="group" aria-label="地图控制">
          <button
            type="button"
            id="guideZoomIn"
            aria-label="放大导览地图"
            onClick={() => engine.current?.zoom(0.4)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            id="guideZoomOut"
            aria-label="缩小导览地图"
            onClick={() => engine.current?.zoom(-0.4)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span />
          <button
            type="button"
            id="guideReset"
            aria-label="回到校园全景"
            onClick={() => {
              close(false);
              engine.current?.fit();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />
              <rect x="8" y="8" width="8" height="8" rx="1" />
            </svg>
          </button>
        </div>
        <div className="campus-map-note" id="guideNote">
          <span className="campus-note-dot" />
          校园位置示意 · 建筑插画非实景还原
        </div>
        <div className="campus-map-tip" id="guideTip">
          双指移动 <span>·</span> 捏合或 Ctrl / ⌘ + 滚轮缩放
        </div>
        <div className="campus-guide-status" id="guideStatus" role="status" hidden={ready}>
          {error ? (
            <>
              校园导览暂时无法加载
              <button type="button" onClick={() => setRevision((n) => n + 1)}>
                重新加载
              </button>
            </>
          ) : (
            '正在展开校园…'
          )}
        </div>
        <article
          className="campus-detail"
          id="placeDetail"
          aria-labelledby="detailName"
          hidden={!selected}
        >
          <button
            type="button"
            className="campus-detail-close"
            id="closeDetail"
            aria-label="关闭地点介绍"
            onClick={() => close()}
          >
            ×
          </button>
          <div className="campus-detail-header">
            <div className="campus-detail-art" id="detailArt" aria-hidden="true">
              {selected && <Thumbnail place={selected} />}
            </div>
            <div>
              <p className="campus-detail-category" id="detailCategory">
                {selected && categories[selected.category]}
                {selected && 'alias' in selected && selected.alias ? ` / ${selected.alias}` : ''}
              </p>
              <h2 id="detailName" ref={detail} tabIndex={-1}>
                {selected?.name}
              </h2>
            </div>
          </div>
          <div
            className="campus-detail-content"
            id="detailContent"
            tabIndex={0}
            role="region"
            aria-label="地点介绍"
          >
            <div id="detailDescription">
              {selected?.description.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <nav className="campus-detail-sources" id="detailSources" aria-label="资料来源">
              {selected &&
                'sources' in selected &&
                selected.sources?.map((key) => {
                  const s = campusSources[key as keyof typeof campusSources];
                  return (
                    <SiteLink href={s.url} target="_blank" rel="noopener noreferrer" key={key}>
                      {s.label}
                    </SiteLink>
                  );
                })}
            </nav>
          </div>
        </article>
      </section>
    </main>
  );
}
