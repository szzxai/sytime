import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import { diffLines } from 'diff';
import { Picture } from './Media';
import { SiteLink } from './SiteLink';
import { useToast } from './ui';
import '../pages/WikiPage.css';

function documentExtensions() {
  return (tree: Root) => {
    visit(tree, 'heading', (node) => {
      const id = `section-${node.position?.start.line}`;
      node.data = { ...node.data, hProperties: { id } };
      node.children.push({
        type: 'link',
        url: `#${id}`,
        title: '永久链接',
        data: { hProperties: { className: ['headerlink'], 'aria-label': '永久链接' } },
        children: [{ type: 'text', value: '¶' }],
      });
    });
    visit(tree, 'containerDirective', (node) => {
      const name = node.name === 'details' ? 'details' : 'aside';
      node.data = {
        hName: name,
        hProperties: {
          className: [
            name === 'aside' ? 'admonition wiki-note' : 'wiki-fold',
            node.attributes?.type || (node.name === 'details' ? 'note' : node.name),
          ],
          'aria-label': node.attributes?.title || node.name,
          ...(node.attributes?.open === 'true' ? { open: true } : {}),
        },
      };
      node.children.unshift({
        type: 'paragraph',
        data: {
          hName: name === 'details' ? 'summary' : 'p',
          hProperties: { className: name === 'aside' ? ['admonition-title'] : [] },
        },
        children: [
          {
            type: 'text',
            value:
              node.attributes?.title ||
              { note: '提示', tip: '小贴士', warning: '注意', info: '信息', details: '展开阅读' }[
                node.name
              ] ||
              node.name,
          },
        ],
      });
    });
  };
}
function extensions(source: string) {
  // Material for MkDocs-style admonitions and collapsible blocks.
  return source
    .replace(
      /^(!!!|\?\?\?\+?)\s+(\w+)(?:\s+"([^"]*)")?\s*\n((?:(?: {4}|\t)[^\n]*(?:\n|$)|\n(?= {4}|\t))+)/gm,
      (_all, marker: string, name: string, title: string, body: string) =>
        `:::${marker.startsWith('???') ? 'details' : name}{type="${name}"${marker === '???+' ? ' open="true"' : ''} title="${(title || name).replace(/"/g, '')}"}\n${body.replace(/^( {4}|\t)/gm, '')}\n:::\n`,
    )
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_all, id: string, label?: string) =>
        `[${label || id}](/wiki.html?${/^\d+$/.test(id) ? 'id' : 'q'}=${encodeURIComponent(id)})`,
    );
}
function CodeBlock({ children, onCopied }: { children?: ReactNode; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="wiki-code highlight">
      <pre>
        <nav className="md-code__nav">
          <button
            type="button"
            className="md-code__button md-icon"
            data-md-type="copy"
            aria-label={copied ? '已复制' : '复制代码'}
            title={copied ? '已复制' : '复制代码'}
            onClick={async (e) => {
              const content =
                e.currentTarget.closest('pre')?.querySelector('code')?.textContent || '';
              try {
                await navigator.clipboard.writeText(content);
                setCopied(true);
                onCopied();
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), 2000);
              } catch {
                toast('复制失败，请选择代码手动复制', 'error');
              }
            }}
          ></button>
        </nav>
        {children}
      </pre>
    </div>
  );
}
export const WikiMarkdown = memo(function WikiMarkdown({ source }: { source: string }) {
  const notice = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const announceCopy = () => {
    if (!notice.current) return;
    notice.current.classList.add('md-dialog--active');
    notice.current.firstElementChild!.textContent = '已复制到剪贴板';
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(
      () => notice.current?.classList.remove('md-dialog--active'),
      2000,
    );
  };
  return (
    <div className="wiki-material" data-md-color-primary="indigo">
      <div className="wiki-markdown md-typeset">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkDirective, documentExtensions]}
          components={{
            li: ({ className, children }) => (
              <li className={className}>
                {className?.includes('task-list-item') ? (
                  <label className="task-list-control">{children}</label>
                ) : (
                  children
                )}
              </li>
            ),
            input: ({ checked }) => (
              <>
                <input type="checkbox" disabled checked={checked} />
                <span className="task-list-indicator" />
              </>
            ),
            a: ({ href, children, className, title, 'aria-label': ariaLabel }) =>
              href?.startsWith('#') || href?.startsWith('/wiki.html') ? (
                <SiteLink href={href} className={className} title={title} aria-label={ariaLabel}>
                  {children}
                </SiteLink>
              ) : (
                <a
                  href={href}
                  className={className}
                  title={title}
                  aria-label={ariaLabel}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
            img: ({ src, alt }) =>
              typeof src === 'string' && /^\/api\/wiki\/images\/[a-f0-9-]+$/.test(src) ? (
                <WikiPicture src={src} caption={alt || 'Wiki 配图'} />
              ) : (
                <span className="u-muted">[图片不可用]</span>
              ),
            pre: ({ children }) => <CodeBlock onCopied={announceCopy}>{children}</CodeBlock>,
            table: ({ children }) => (
              <div
                className="wiki-table md-typeset__scrollwrap"
                tabIndex={0}
                role="region"
                aria-label="表格"
              >
                <div className="wiki-table-inner md-typeset__table">
                  <table>{children}</table>
                </div>
              </div>
            ),
          }}
        >
          {extensions(source)}
        </ReactMarkdown>
      </div>
      <div className="md-dialog" ref={notice} role="status" aria-live="polite">
        <div className="md-dialog__inner" />
      </div>
    </div>
  );
});
function WikiPicture({ src, caption }: { src: string; caption: string }) {
  return <Picture src={src} caption={caption} className="wiki-picture" />;
}
export function WikiDiff({ before, after }: { before: string; after: string }) {
  const changes = diffLines(before, after, { timeout: 150 });
  return (
    <div className="wiki-diff" role="region" aria-label="Markdown 文本差异" tabIndex={0}>
      <p className="u-muted">− 删除的行 + 新增的行</p>
      <pre>
        {(
          changes || [
            { removed: true, added: false, value: before },
            { removed: false, added: true, value: after },
          ]
        ).map((part, i) => (
          <span
            key={i}
            className={part.added ? 'wiki-diff-add' : part.removed ? 'wiki-diff-remove' : ''}
          >
            {part.value
              .split('\n')
              .filter((line, n, all) => line || n < all.length - 1)
              .map((line, n) => (
                <span className="wiki-diff-line" key={n}>
                  {part.added ? '+ ' : part.removed ? '− ' : '  '}
                  {line}
                  {'\n'}
                </span>
              ))}
          </span>
        ))}
      </pre>
    </div>
  );
}
