import { atLeast, type User } from '@sytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { SiteLink } from '../components/SiteLink';
import { WikiMarkdown, WikiDiff } from '../components/WikiMarkdown';
import { ErrorState, Loading, UserLine } from '../components/ui';
import { endpoint, formatTime, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { useUrlSearch } from '../lib/useUrlSearch';
import { useNavigate } from '@tanstack/react-router';
import './WikiPage.css';

export type WikiFolder = {
  id: number;
  parent_id: number | null;
  name: string;
  position: number;
  count: number;
};
export type WikiItem = {
  id: number;
  folder_id: number;
  position: number;
  title: string;
  aliases: string[];
  updated_at: number;
  path: WikiFolder[];
  snippet: string;
};
export type WikiDirectory = {
  folders: WikiFolder[];
  entries: WikiItem[];
  recent: WikiItem[];
  total: number;
};
export type WikiEntry = WikiItem & {
  markdown: string;
  sources: string[];
  images: string[];
  summary: string;
  current_revision_id: number;
  manual_locked: number;
  lock_reason: string;
  auto_locked: boolean;
  contributors: (User & { user_id: number })[];
};
export type WikiRevision = {
  id: number;
  title: string;
  markdown: string;
  sources: string[];
  aliases: string[];
  summary: string;
  created_at: number;
  user_id: number;
  nickname: string;
};
export const wikiHref = (id: number) => `/wiki.html?id=${id}`;
export function WikiPage() {
  const [search, updateSearch] = useUrlSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const directory = useQuery(endpoint<WikiDirectory>('/api/wiki', false));
  const path = `/api/wiki?${new URLSearchParams({ ...(search.q ? { q: search.q } : {}), ...(search.folder ? { folder: search.folder } : {}) })}`;
  const results = useQuery({
    ...endpoint<WikiDirectory>(path, false),
    enabled: !search.id && !!(search.q || search.folder),
  });
  const article = useQuery({
    ...endpoint<{ entry: WikiEntry; previous: WikiItem | null; next: WikiItem | null }>(
      `/api/wiki/entries/${search.id}`,
      false,
    ),
    enabled: !!search.id,
  });
  const [panel, setPanel] = useState<'tree' | 'outline' | null>(null);
  useEffect(() => {
    if (!panel) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', dismiss);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', dismiss);
    };
  }, [panel]);
  const [outline, setOutline] = useState<{ id: string; title: string; level: number }[]>([]);
  const [active, setActive] = useState('');
  const content = useRef<HTMLElement>(null);
  const current = article.data?.entry;
  useEffect(() => {
    let elements: HTMLElement[] = [];
    const update = () => {
      const top =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--landing-top')) ||
        100;
      const margin =
        parseFloat(
          getComputedStyle(content.current?.closest('.wiki-layout') || document.documentElement)
            .marginTop,
        ) || 0;
      const atEnd = window.scrollY + window.innerHeight >= Math.floor(document.body.scrollHeight);
      const selected = atEnd
        ? elements.at(-1)
        : elements.filter((el) => el.getBoundingClientRect().top < top + 0.8 * margin).at(-1);
      setActive(selected?.id || '');
    };
    const refresh = () => {
      elements = Array.from(
        content.current?.querySelectorAll<HTMLElement>(
          '.wiki-markdown h1,.wiki-markdown h2,.wiki-markdown h3,.wiki-markdown h4,.wiki-markdown h5,.wiki-markdown h6',
        ) || [],
      );
      const headings = elements.map((el) => ({
        id: el.id,
        title: Array.from(el.childNodes)
          .filter((node) => !(node instanceof Element && node.classList.contains('headerlink')))
          .map((node) => node.textContent)
          .join(''),
        level: Number(el.tagName[1]),
      }));
      setOutline((previous) =>
        JSON.stringify(previous) === JSON.stringify(headings) ? previous : headings,
      );
      update();
    };
    refresh();
    const observer = new MutationObserver(refresh);
    if (content.current)
      observer.observe(content.current, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(update);
    if (content.current) resize.observe(content.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [current, search.revision, search.history]);
  const outlineLinks = outline.length ? (
    <WikiOutline headings={outline} active={active} close={() => setPanel(null)} />
  ) : null;
  return (
    <main id="main" className="wiki-shell wiki-material" data-md-color-primary="indigo" dir="ltr">
      <input
        id="__drawer"
        className="md-toggle"
        data-md-toggle="drawer"
        type="checkbox"
        checked={panel === 'tree'}
        onChange={(e) => setPanel(e.target.checked ? 'tree' : null)}
      />
      <button
        className={`wiki-overlay ${panel ? 'is-open' : ''}`}
        tabIndex={panel ? 0 : -1}
        aria-label="关闭目录面板"
        onClick={() => setPanel(null)}
      />
      <div className="wiki-mobile-tools">
        <button
          className="wiki-panel-trigger"
          aria-expanded={panel === 'tree'}
          aria-controls="wiki-directory"
          onClick={() => setPanel(panel === 'tree' ? null : 'tree')}
        >
          百科目录
        </button>
        <button
          hidden={!outline.length}
          className="wiki-panel-trigger"
          aria-expanded={panel === 'outline'}
          aria-controls="wiki-outline"
          onClick={() => setPanel(panel === 'outline' ? null : 'outline')}
        >
          本页大纲
        </button>
      </div>
      <div className="md-container wiki-frame">
        <div className="md-main__inner md-grid wiki-layout">
          <aside
            id="wiki-directory"
            className={`md-sidebar md-sidebar--primary wiki-sidebar ${panel === 'tree' ? 'is-open' : ''}`}
          >
            <div className="md-sidebar__scrollwrap">
              <div className="md-sidebar__inner">
                <nav className="md-nav md-nav--primary wiki-tree" aria-label="百科目录">
                  <label className="md-nav__title" htmlFor="__drawer">
                    <span className="md-nav__icon md-icon" />
                    <SiteLink
                      className="md-nav__button md-logo"
                      href="/wiki.html"
                      aria-label="校园 Wiki 首页"
                      aria-current={false}
                      onClick={() => setPanel(null)}
                    >
                      <img src="/img/brand-lime.svg" width="48" height="48" alt="" />
                    </SiteLink>
                    校园 Wiki
                  </label>
                  {atLeast(user?.role, 'student') && (
                    <ul className="md-nav__list wiki-create">
                      <li className="md-nav__item">
                        <SiteLink className="md-nav__link" href="/wiki-edit.html">
                          新建词条
                        </SiteLink>
                      </li>
                    </ul>
                  )}
                  {directory.isPending ? (
                    <Loading />
                  ) : directory.error ? (
                    <ErrorState error={directory.error} retry={directory.refetch} />
                  ) : (
                    <WikiTree
                      directory={directory.data!}
                      current={current}
                      selectedFolder={search.folder}
                      close={() => setPanel(null)}
                    />
                  )}
                </nav>
              </div>
            </div>
          </aside>
          <aside
            id="wiki-outline"
            hidden={!outline.length}
            className={`md-sidebar md-sidebar--secondary wiki-outline ${panel === 'outline' ? 'is-open' : ''}`}
          >
            <div className="md-sidebar__scrollwrap">
              <div className="md-sidebar__inner">{outlineLinks}</div>
            </div>
          </aside>
          <div className="md-content">
            {current && (
              <nav className="md-path" aria-label="文件夹路径">
                <ol className="md-path__list">
                  <li className="md-path__item">
                    <SiteLink className="md-path__link" href="/wiki.html">
                      Wiki
                    </SiteLink>
                  </li>
                  {current.path.map((folder) => (
                    <li className="md-path__item" key={folder.id}>
                      <SiteLink className="md-path__link" href={`/wiki.html?folder=${folder.id}`}>
                        {folder.name}
                      </SiteLink>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <article className="md-content__inner md-typeset wiki-content" ref={content}>
              {search.id ? (
                article.isPending ? (
                  <Loading />
                ) : article.error ? (
                  article.error instanceof ApiError && article.error.status === 404 ? (
                    <WikiEmpty
                      title="词条不存在或已被删除"
                      children={<SiteLink href="/wiki.html">返回 Wiki 首页</SiteLink>}
                    />
                  ) : (
                    <ErrorState error={article.error} retry={article.refetch} />
                  )
                ) : (
                  current && (
                    <>
                      {(!!current.manual_locked || current.auto_locked) && (
                        <div className="callout" role="status">
                          {current.manual_locked
                            ? `手动锁定：${current.lock_reason}`
                            : '待审核锁定：词条修改正在审核，期间暂不能编辑。'}
                          {current.manual_locked && current.auto_locked && (
                            <p>同时有一条修改正在等待审核。</p>
                          )}
                        </div>
                      )}
                      <div className="wiki-title">
                        <div className="wiki-actions">
                          <SiteLink
                            className="md-content__button md-icon"
                            href={`${wikiHref(current.id)}&history=1`}
                            aria-label="修订历史"
                            title="修订历史"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 7 7 7 7 0 0 1-5-2l-1.4 1.4A9 9 0 1 0 13 3m-1 4v6l5 3 1-1.7-4-2.3V7z" />
                            </svg>
                          </SiteLink>
                          {atLeast(user?.role, 'student') &&
                            !current.manual_locked &&
                            !current.auto_locked && (
                              <SiteLink
                                className="md-content__button md-icon"
                                href={`/wiki-edit.html?id=${current.id}`}
                                aria-label="编辑此页"
                                title="编辑此页"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="m20.71 7.04-2.75 2.75-3-3 2.75-2.75a1 1 0 0 1 1.41 0l1.59 1.59a1 1 0 0 1 0 1.41M3 17.25l11.1-11.1 3 3L6 20.25H3z" />
                                </svg>
                              </SiteLink>
                            )}
                        </div>
                        <h1>{current.title}</h1>
                      </div>
                      {!!current.aliases.length && (
                        <p className="wiki-aliases">别名：{current.aliases.join('、')}</p>
                      )}
                      <p className="wiki-meta">最近审核通过：{formatTime(current.updated_at)}</p>
                      {search.history || search.revision ? (
                        <WikiHistory entry={current} />
                      ) : (
                        <>
                          <WikiMarkdown source={current.markdown} />
                          {!!current.sources.length && (
                            <section className="wiki-sources">
                              <h2>参考来源</h2>
                              <ol>
                                {current.sources.map((url) => (
                                  <li key={url}>
                                    <a href={url} target="_blank" rel="noopener noreferrer">
                                      {url}
                                    </a>
                                  </li>
                                ))}
                              </ol>
                            </section>
                          )}
                          {!!current.contributors.length && (
                            <section className="wiki-contributors">
                              <h2>共同贡献</h2>
                              {current.contributors.map((u) => (
                                <UserLine key={u.user_id} user={{ ...u, id: u.user_id }} />
                              ))}
                            </section>
                          )}
                          {(article.data?.previous || article.data?.next) && (
                            <nav className="wiki-pagination" aria-label="词条翻页">
                              {article.data?.previous ? (
                                <SiteLink href={wikiHref(article.data.previous.id)}>
                                  ← 上一篇 <strong>{article.data.previous.title}</strong>
                                </SiteLink>
                              ) : (
                                <span />
                              )}
                              {article.data?.next && (
                                <SiteLink href={wikiHref(article.data.next.id)}>
                                  下一篇 → <strong>{article.data.next.title}</strong>
                                </SiteLink>
                              )}
                            </nav>
                          )}
                        </>
                      )}
                    </>
                  )
                )
              ) : (
                <>
                  <form
                    className="wiki-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const q = String(new FormData(e.currentTarget).get('q') || '').trim();
                      void navigate({
                        to: '/wiki.html',
                        search: {
                          ...(search.folder ? { folder: search.folder } : {}),
                          ...(q ? { q } : {}),
                        },
                      });
                    }}
                  >
                    <label htmlFor="wiki-search">搜索校园百科</label>
                    <div className="row">
                      <input
                        key={search.q || ''}
                        id="wiki-search"
                        name="q"
                        className="input"
                        defaultValue={search.q || ''}
                        maxLength={100}
                        placeholder="标题、别名、正文或拼音…"
                      />
                      <button className="md-button md-button--primary">搜索</button>
                    </div>
                  </form>
                  {(search.q || search.folder) &&
                    (results.isPending ? (
                      <Loading />
                    ) : results.error ? (
                      <ErrorState error={results.error} retry={results.refetch} />
                    ) : (
                      <section>
                        <div className="row">
                          <h2>{search.q ? `“${search.q}”的搜索结果` : '目录词条'}</h2>
                          {search.q && (
                            <button
                              className="md-button"
                              onClick={() => updateSearch({ q: undefined })}
                            >
                              清除关键词
                            </button>
                          )}
                        </div>
                        {results.data?.entries.length ? (
                          <WikiList entries={results.data.entries} />
                        ) : (
                          <WikiEmpty
                            title={search.q ? '未找到相关词条' : '空目录'}
                            description={
                              search.q
                                ? '试试其他关键词，或清除关键词浏览目录。'
                                : '这个文件夹还没有公开词条。'
                            }
                            children={<SiteLink href="/wiki.html">返回 Wiki 首页</SiteLink>}
                          />
                        )}
                      </section>
                    ))}
                </>
              )}
            </article>
          </div>
        </div>
      </div>
    </main>
  );
}
type WikiHeading = { id: string; title: string; level: number };
type WikiOutlineNode = WikiHeading & { children: WikiOutlineNode[] };
function WikiOutline({
  headings,
  active,
  close,
}: {
  headings: WikiHeading[];
  active: string;
  close: () => void;
}) {
  const roots: WikiOutlineNode[] = [];
  const stack: WikiOutlineNode[] = [];
  for (const heading of headings) {
    const node = { ...heading, children: [] };
    while (stack.length && stack.at(-1)!.level >= node.level) stack.pop();
    (stack.at(-1)?.children || roots).push(node);
    stack.push(node);
  }
  const activeIndex = headings.findIndex((heading) => heading.id === active);
  const render = (nodes: WikiOutlineNode[]) => (
    <ul className="md-nav__list">
      {nodes.map((node) => (
        <li className="md-nav__item" key={node.id}>
          <a
            className={`md-nav__link ${headings.findIndex((heading) => heading.id === node.id) <= activeIndex ? 'md-nav__link--passed' : ''} ${node.id === active ? 'md-nav__link--active' : ''}`}
            href={`#${node.id}`}
            aria-current={node.id === active ? 'location' : undefined}
            onClick={close}
          >
            <span className="md-ellipsis">{node.title}</span>
          </a>
          {!!node.children.length && (
            <nav className="md-nav" aria-label={node.title}>
              {render(node.children)}
            </nav>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <nav className="md-nav md-nav--secondary" aria-label="本页大纲">
      <label className="md-nav__title">本页大纲</label>
      {render(roots)}
    </nav>
  );
}
function WikiTree({
  directory,
  current,
  selectedFolder,
  close,
}: {
  directory: WikiDirectory;
  current?: WikiEntry;
  selectedFolder?: string;
  close: () => void;
}) {
  const selectedIds = current?.path.map((folder) => folder.id) || [];
  let selected = directory.folders.find((folder) => String(folder.id) === selectedFolder);
  while (selected) {
    selectedIds.unshift(selected.id);
    selected = directory.folders.find((folder) => folder.id === selected?.parent_id);
  }
  const selectedPath = [...new Set(selectedIds)].join(':');
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(selectedIds));
  useEffect(() => {
    if (!selectedPath) return;
    setExpanded((previous) => new Set([...previous, ...selectedPath.split(':').map(Number)]));
  }, [selectedPath, current?.id]);
  const toggleFolder = (id: number) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const render = (f: WikiFolder, level = 1) => {
    const selected = selectedIds.includes(f.id);
    const children = directory.folders.filter((sub) => sub.parent_id === f.id);
    const entries = directory.entries.filter((entry) => entry.folder_id === f.id);
    const nested = !!(children.length || entries.length);
    const toggle = `wiki-folder-${f.id}`;
    return (
      <li
        className={`md-nav__item ${nested ? 'md-nav__item--nested' : ''} ${selected ? 'md-nav__item--active' : ''}`}
        key={f.id}
      >
        {nested && (
          <input
            type="checkbox"
            className="md-nav__toggle md-toggle"
            id={toggle}
            checked={expanded.has(f.id)}
            onChange={() => toggleFolder(f.id)}
          />
        )}
        <div className="md-nav__link md-nav__container">
          {nested ? (
            <button
              type="button"
              className="md-nav__link wiki-folder-toggle"
              aria-expanded={expanded.has(f.id)}
              aria-controls={`${toggle}-items`}
              onClick={() => toggleFolder(f.id)}
            >
              <span className="md-ellipsis">{f.name}</span>
              <span className="md-nav__icon md-icon" />
            </button>
          ) : (
            <SiteLink
              className="md-nav__link"
              href={`/wiki.html?folder=${f.id}`}
              aria-current={selectedFolder === String(f.id) ? 'page' : undefined}
              onClick={close}
            >
              <span className="md-ellipsis">{f.name}</span>
            </SiteLink>
          )}
        </div>
        {nested && (
          <nav className="md-nav" aria-label={f.name} id={`${toggle}-items`} data-md-level={level}>
            <label className="md-nav__title" htmlFor={toggle}>
              <span className="md-nav__icon md-icon" />
              {f.name}
            </label>
            <ul className="md-nav__list">
              {entries.map((entry) => (
                <li className="md-nav__item" key={entry.id}>
                  <SiteLink
                    className={`md-nav__link ${current?.id === entry.id ? 'md-nav__link--active' : ''}`}
                    href={wikiHref(entry.id)}
                    aria-current={current?.id === entry.id ? 'page' : undefined}
                    onClick={close}
                  >
                    <span className="md-ellipsis">{entry.title}</span>
                  </SiteLink>
                </li>
              ))}
              {children.map((child) => render(child, level + 1))}
            </ul>
          </nav>
        )}
      </li>
    );
  };
  return (
    <ul className="md-nav__list">
      {directory.folders.filter((folder) => !folder.parent_id).map((folder) => render(folder))}
    </ul>
  );
}
function WikiEmpty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="wiki-empty">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children && <p>{children}</p>}
    </section>
  );
}
function WikiList({ entries }: { entries: WikiItem[] }) {
  return (
    <div className="wiki-list">
      {entries.map((e) => (
        <article key={e.id}>
          <SiteLink href={wikiHref(e.id)}>
            <h3>{e.title}</h3>
          </SiteLink>
          <small>{e.path.map((f) => f.name).join(' / ')}</small>
          <p>{e.snippet}</p>
        </article>
      ))}
    </div>
  );
}
export function WikiHistory({ entry }: { entry: WikiEntry }) {
  const [search] = useUrlSearch();
  const history = useQuery(
    endpoint<{ revisions: WikiRevision[] }>(`/api/wiki/entries/${entry.id}/history`, false),
  );
  const snapshot = useQuery({
    ...endpoint<{ revision: WikiRevision }>(
      `/api/wiki/entries/${entry.id}/revisions/${search.revision}`,
      false,
    ),
    enabled: !!search.revision,
  });
  const previousId =
    history.data?.revisions[
      history.data.revisions.findIndex((r) => String(r.id) === search.revision) + 1
    ]?.id;
  const previous = useQuery({
    ...endpoint<{ revision: WikiRevision }>(
      `/api/wiki/entries/${entry.id}/revisions/${previousId}`,
      false,
    ),
    enabled: !!search.revision && !!previousId,
  });
  return (
    <section className="wiki-history">
      <div className="row">
        <h2>修订历史</h2>
        <SiteLink href={wikiHref(entry.id)}>返回当前词条</SiteLink>
      </div>
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <ErrorState error={history.error} retry={history.refetch} />
      ) : (
        <ol>
          {history.data?.revisions.map((r) => (
            <li key={r.id}>
              <SiteLink href={`${wikiHref(entry.id)}&revision=${r.id}`}>
                版本 #{r.id} · {formatTime(r.created_at)}
              </SiteLink>
              <p>
                {r.nickname} · {r.summary}
              </p>
            </li>
          ))}
        </ol>
      )}
      {search.revision &&
        (snapshot.isPending ? (
          <Loading />
        ) : snapshot.error ? (
          <ErrorState error={snapshot.error} retry={snapshot.refetch} />
        ) : (
          <>
            <h2>历史公开快照 · #{snapshot.data!.revision.id}</h2>
            <p className="callout">
              你正在阅读历史版本。<SiteLink href={wikiHref(entry.id)}>查看最新公开版本</SiteLink>
            </p>
            <h3>{snapshot.data!.revision.title}</h3>
            {!!snapshot.data!.revision.aliases.length && (
              <p>别名：{snapshot.data!.revision.aliases.join('、')}</p>
            )}
            <WikiMarkdown source={snapshot.data!.revision.markdown} />
            {!!snapshot.data!.revision.sources.length && (
              <section className="wiki-sources">
                <h3>该版本的参考来源</h3>
                <ol>
                  {snapshot.data!.revision.sources.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <h3>与上一公开版本的文字差异</h3>
            {previous.isPending && previousId ? (
              <Loading />
            ) : previous.error ? (
              <ErrorState error={previous.error} retry={previous.refetch} />
            ) : (
              <WikiDiff
                before={previous.data?.revision.markdown || ''}
                after={snapshot.data!.revision.markdown}
              />
            )}
          </>
        ))}
    </section>
  );
}
