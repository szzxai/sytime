import { SiteLink } from '../components/SiteLink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mountCampus, type CampusViewport, type CampusMode } from '../maps/campus/viewport';
import { campusPlaces, campusSources, type Place } from '../maps/campus/catalog';
import { footprints, boundaryFor } from '../maps/campus/survey';
import { detailReadings } from '../maps/campus/detail-readings';
import './CampusScene.css';
const categories: Record<string, string> = {
  study: '教学空间',
  heritage: '人文地标',
  nature: '校园园林',
  life: '校园生活',
  sport: '运动场地',
  gate: '校园出入口',
};
function Thumbnail({ place }: { place: Place }) {
  const shapes = footprints.get(place.id) || [];
  if (!shapes.length)
    return (
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <path
          d="M12 32 30 8l20 24-18 9Z"
          fill={place.category === 'nature' ? '#b2c99b' : '#b6ccc3'}
        />
      </svg>
    );
  const points = shapes.flat(),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(...xs) - x,
    h = Math.max(...ys) - y;
  return (
    <svg viewBox={`${x - 10} ${y - 10} ${w + 20} ${h + 20}`} aria-hidden="true">
      {shapes.map((pts, i) => (
        <polygon
          key={i}
          points={pts.map((p) => p.join(',')).join(' ')}
          fill="#d8c6a8"
          stroke="#fdfbf5"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}
export function MapPage() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<CampusViewport | null>(null),
    origin = useRef<HTMLElement | null>(null),
    detail = useRef<HTMLHeadingElement>(null);
  const [mapMode, setMapMode] = useState<CampusMode>('2.5d');
  const modeRef = useRef<CampusMode>('2.5d');
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading'),
    [revision, setRevision] = useState(0);
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('all'),
    [directory, setDirectory] = useState(false),
    [selected, setSelected] = useState<Place | null>(null);
  const rows = useMemo(
    () =>
      campusPlaces
        .filter(
          (p) =>
            (category === 'all' || p.category === category) &&
            (!search.trim() ||
              (p.name + (p.alias || '') + p.summary + p.area + categories[p.category])
                .toLowerCase()
                .includes(search.trim().toLowerCase())),
        )
        .sort((a, b) => Number(b.name === search.trim()) - Number(a.name === search.trim())),
    [category, search],
  );
  function select(p: Place, source?: HTMLElement) {
    origin.current = source || host.current;
    setSelected(p);
    setDirectory(false);
    engine.current?.focus(p.id);
  }
  function close() {
    setSelected(null);
    origin.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState('loading');
    const el = host.current!;
    const fail = () => {
      setState('failed');
      delete document.body.dataset.campusReady;
    };
    el.addEventListener('campus-failed', fail);
    mountCampus(el, (p) => select(p), controller.signal, modeRef.current)
      .then((view) => {
        if (!active) {
          view.destroy();
          return;
        }
        engine.current = view;
        setState('ready');
        document.body.dataset.campusReady = 'true';
      })
      .catch(() => {
        if (active) setState('failed');
      });
    return () => {
      active = false;
      controller.abort();
      engine.current?.destroy();
      engine.current = null;
      el.removeEventListener('campus-failed', fail);
      delete document.body.dataset.campusReady;
    };
  }, [revision]);
  useEffect(() => {
    if (state === 'ready') {
      engine.current?.filter(new Set(rows.map((p) => p.id)));
      if (selected && !rows.some((p) => p.id === selected.id)) setSelected(null);
    }
  }, [state, rows, selected]);
  useEffect(() => {
    if (state !== 'ready') return;
    engine.current?.select(selected?.id);
    if (selected) detail.current?.focus({ preventScroll: true });
  }, [selected, state]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (selected) close();
        setDirectory(false);
      }
    };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  }, [selected]);
  const shapes = selected ? boundaryFor(selected.id) : [];
  const massing = shapes.filter((f) => f.properties.kind === 'building');
  const scan = shapes.some((f) => f.properties.basis === 'scan');
  const aerial = shapes.some((f) => f.properties.basis === 'aerial');
  const tallest = massing.length ? Math.max(...massing.map((f) => f.properties.height || 0)) : null;
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
      <section
        className="survey-scene"
        aria-label="苏州中学校园立体地图"
        onPointerDownCapture={() => {
          if (directory && innerWidth < 701) setDirectory(false);
        }}
      >
        <div
          className="survey-viewport"
          ref={host}
          tabIndex={0}
          aria-label="交互地图，可拖动、滚轮缩放、右键旋转。地点也可从左侧目录选择。"
        />
        {mapMode === 'experimental' && (
          <div className="survey-heading" aria-hidden="true">
            <span>SUZHOU HIGH SCHOOL</span>
            <strong>校园 · 空间导览</strong>
          </div>
        )}
        <div className="survey-mode" role="group" aria-label="地图显示模式">
          {(
            [
              ['2.5d', '2.5D'],
              ['2d', '2D'],
              ['experimental', '实验性'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mapMode === value}
              disabled={state !== 'ready'}
              onClick={() => {
                modeRef.current = value;
                setMapMode(value);
                engine.current?.mode(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="survey-tools" role="group" aria-label="地图视野">
          <button type="button" aria-label="放大地图" onClick={() => engine.current?.zoom(1)}>
            ＋
          </button>
          <button type="button" aria-label="缩小地图" onClick={() => engine.current?.zoom(-1)}>
            −
          </button>
          <button type="button" aria-label="朝北查看" onClick={() => engine.current?.north()}>
            N ↑
          </button>
          <button type="button" aria-label="旋转视角" onClick={() => engine.current?.orbit()}>
            ↻
          </button>
          <button
            type="button"
            aria-label="校园全景"
            onClick={() => {
              setSelected(null);
              engine.current?.reset();
            }}
          >
            ⌖
          </button>
        </div>
        <div className="survey-legend" aria-label="地图图例">
          <span>
            <i className="key-building" />
            建筑
          </span>
          <span>
            <i className="key-green" />
            绿地
          </span>
          <span>
            <i className="key-water" />
            水面
          </span>
          <span>
            <i className="key-sport" />
            运动
          </span>
        </div>
        <div className="survey-credit">
          {mapMode === 'experimental' ? '扫描参考重建 · 航拍补全' : '校园平面简图'}
        </div>
        <div className="survey-gesture">滚轮缩放 / 拖动平移 / 右键旋转</div>
        {state !== 'ready' && (
          <div className="survey-state" role="status">
            {state === 'failed' ? (
              <>
                <strong>地图加载失败</strong>
                <p>请重试加载校园场景。</p>
                <button type="button" onClick={() => setRevision((v) => v + 1)}>
                  重新加载
                </button>
              </>
            ) : (
              <>
                <span className="survey-spinner" />
                <p>正在构建校园场景</p>
              </>
            )}
          </div>
        )}
        {selected && (
          <article className="survey-inspector" aria-labelledby="survey-place-name">
            <div className="survey-inspector-top">
              <span>{categories[selected.category]}</span>
              <button type="button" aria-label="关闭地点详情" onClick={close}>
                ×
              </button>
            </div>
            <h2 id="survey-place-name" ref={detail} tabIndex={-1}>
              {selected.name}
            </h2>
            <p className="survey-summary">{selected.summary}</p>
            <div className="survey-facts">
              <span>{selected.area}</span>
              {mapMode === 'experimental' && tallest && (
                <span>
                  {selected.id === 'zhide' ? '檐带' : '檐高'}约 {tallest} m
                </span>
              )}
              {(scan || aerial) && (
                <span>{scan && aerial ? '扫描与航拍' : scan ? '扫描重建' : '航拍补全'}</span>
              )}
            </div>
            <div className="survey-prose" tabIndex={0} role="region" aria-label="地点介绍">
              {mapMode === 'experimental' && detailReadings[selected.id] && (
                <p>{detailReadings[selected.id]}</p>
              )}
              {selected.description.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {selected.sources && (
                <nav aria-label="资料来源">
                  {selected.sources.map((key) => {
                    const s = campusSources[key as keyof typeof campusSources];
                    return (
                      <SiteLink key={key} href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.label} ↗
                      </SiteLink>
                    );
                  })}
                </nav>
              )}
            </div>
            <button
              className="survey-refocus"
              type="button"
              onClick={() => engine.current?.focus(selected.id)}
            >
              定位此处 <span aria-hidden="true">↗</span>
            </button>
          </article>
        )}
      </section>
    </main>
  );
}
