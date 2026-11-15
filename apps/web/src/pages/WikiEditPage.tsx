import MDEditor from '@uiw/react-md-editor/nohighlight';
import * as commands from '@uiw/react-md-editor/commands-cn';
import { atLeast } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { cloneElement, isValidElement, useEffect, useRef, useState, type SVGProps } from 'react';
import { SiteLink } from '../components/SiteLink';
import { WikiMarkdown } from '../components/WikiMarkdown';
import { Empty, ErrorState, Field, Loading, Submit } from '../components/ui';
import { api, ApiError, endpoint, queryClient, loginUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { useUrlSearch } from '../lib/useUrlSearch';
import type { WikiDirectory, WikiEntry } from './WikiPage';
import './WikiPage.css';

type Draft = {
  title: string;
  folder_id: string;
  aliases: string;
  markdown: string;
  summary: string;
  images: string[];
  base_revision_id?: number;
};
const NEW_ENTRY_TEMPLATE = `## 正文

在这里介绍词条的背景、内容或使用指南。

## 参考资料

<!-- 在这里添加参考资料，例如：- [资料名称](https://example.com)。此模板可自由修改或删除。 -->
`;
function includeSources(markdown: string, sources: string[]) {
  return sources.length
    ? `${markdown}\n\n## 参考资料\n\n${sources.map((url) => `- <${url}>`).join('\n')}`
    : markdown;
}
export function WikiEditPage() {
  const [search] = useUrlSearch();
  const { user } = useSession();
  const directory = useQuery(endpoint<WikiDirectory>('/api/wiki', false));
  const entry = useQuery({
    ...endpoint<{ entry: WikiEntry }>(`/api/wiki/entries/${search.id}`, false),
    enabled: !!search.id,
  });
  if (directory.isPending || (search.id && entry.isPending))
    return (
      <main id="main" className="main container">
        <Loading />
      </main>
    );
  if (!atLeast(user?.role, 'student'))
    return (
      <main id="main" className="main container">
        <Empty
          title="创建与编辑词条需要学生身份"
          description="访客和普通用户可以阅读所有已公开词条。当前设备的编辑草稿会保留。"
          children={<SiteLink href={user ? loginUrl() : loginUrl()}>{'通过社盟账号登录'}</SiteLink>}
        />
      </main>
    );
  if (directory.error || entry.error)
    return (
      <main id="main" className="main container">
        <ErrorState
          error={(directory.error || entry.error)!}
          retry={() => {
            void directory.refetch();
            void entry.refetch();
          }}
        />
        <SiteLink href="/wiki.html">返回 Wiki 首页</SiteLink>
      </main>
    );
  return (
    <WikiEditor
      key={`${user!.id}:${search.id || 'new'}`}
      userId={user!.id}
      directory={directory.data!}
      entry={search.id ? entry.data?.entry : undefined}
    />
  );
}
function WikiEditor({
  userId,
  directory,
  entry,
}: {
  userId: number;
  directory: WikiDirectory;
  entry?: WikiEntry;
}) {
  const navigate = useNavigate();
  const key = `wiki-draft:${userId}:${entry?.id || 'new'}`;
  const dirty = useRef(false);
  const initial: Draft = {
    title: entry?.title || '',
    folder_id: String(entry?.folder_id || ''),
    aliases: entry?.aliases.join('\n') || '',
    markdown: entry ? includeSources(entry.markdown, entry.sources) : NEW_ENTRY_TEMPLATE,
    summary: '',
    images: entry?.images || [],
    base_revision_id: entry?.current_revision_id,
  };
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        dirty.current = true;
        const restored = JSON.parse(saved);
        // Move sources from older local drafts into the editable document as well.
        const { sources, ...fields } = restored;
        return {
          ...initial,
          ...fields,
          markdown: includeSources(
            fields.markdown ?? initial.markdown,
            typeof sources === 'string' ? sources.split('\n').filter(Boolean) : [],
          ),
        };
      }
    } catch {
      /* Keep the editor usable when local storage is unavailable. */
    }
    return initial;
  });
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [theme] = useTheme();
  const colorMode =
    theme === 'auto'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  const [uploadError, setUploadError] = useState('');
  const [uploadsPending, setUploadsPending] = useState(0);
  const uploadBusy = uploadsPending > 0;
  const editorRoot = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadSelection = useRef({ start: 0, end: 0 });
  const latest = useRef(draft);
  latest.current = draft;
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      (current.pathname !== next.pathname ||
        JSON.stringify(current.search) !== JSON.stringify(next.search)) &&
      dirty.current &&
      !window.confirm('有尚未提交的 Wiki 修改，确定离开吗？草稿会保留在当前设备。'),
    enableBeforeUnload: () => dirty.current,
  });
  function change(patch: Partial<Draft>) {
    dirty.current = true;
    setSaved(false);
    latest.current = { ...latest.current, ...patch };
    setDraft(latest.current);
  }
  useEffect(() => {
    if (!dirty.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      setSaved(true);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, key]);
  const submit = useMutation({
    mutationFn: () =>
      api<{ id: number; message: string }>(
        entry ? `/api/wiki/entries/${entry.id}/submissions` : '/api/wiki/entries',
        {
          method: 'POST',
          body: {
            ...draft,
            aliases: draft.aliases
              .split(/[\n,，]/)
              .map((v) => v.trim())
              .filter(Boolean),
            sources: [],
            images: draft.images.filter((id) => draft.markdown.includes(`/api/wiki/images/${id}`)),
            folder_id: Number(draft.folder_id),
          },
        },
      ),
    onSuccess: () => {
      dirty.current = false;
      try {
        localStorage.removeItem(key);
      } catch {
        /* Draft cleanup is best effort. */
      }
      void queryClient.invalidateQueries();
    },
  });
  const upload = useMutation({
    mutationFn: async ({ files, start, end }: { files: File[]; start: number; end: number }) => {
      setUploadError('');
      const errors: string[] = [];
      const validFiles = files.filter((file) => {
        if (
          ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
          file.size > 0 &&
          file.size <= 2 * 1024 * 1024
        )
          return true;
        errors.push(`${file.name}：请选择单张不超过 2 MB 的 JPG、PNG 或 WebP 图片`);
        return false;
      });
      if (!validFiles.length) {
        setUploadError(errors.join('；'));
        return;
      }
      const markers = validFiles.map(() => `<!-- wiki-upload:${crypto.randomUUID()} -->`);
      const before = latest.current.markdown;
      change({ markdown: before.slice(0, start) + markers.join('\n') + before.slice(end) });
      for (const [index, file] of validFiles.entries()) {
        const marker = markers[index];
        try {
          const form = new FormData();
          form.set('image', file);
          const { id, url } = await api<{ id: string; url: string }>('/api/wiki/images', {
            method: 'POST',
            body: form,
          });
          const alt = file.name.replace(/[[\]\\\r\n]/g, '') || '配图';
          change({
            images: [...latest.current.images, id],
            markdown: latest.current.markdown.replace(marker, `![${alt}](${url})`),
          });
        } catch (error) {
          change({
            markdown: latest.current.markdown.replace(
              marker,
              index === 0 ? before.slice(start, end) : '',
            ),
          });
          errors.push(`${file.name}：${error instanceof Error ? error.message : '上传失败'}`);
        }
      }
      if (errors.length) setUploadError(errors.join('；'));
    },
    onSettled: () => setUploadsPending((count) => count - 1),
  });
  function insertImages(files: File[], selection?: { start: number; end: number }) {
    if (!files.length) return;
    setUploadsPending((count) => count + 1);
    const textarea = editorRoot.current?.querySelector('textarea');
    upload.mutate({
      files,
      ...(selection || {
        start: textarea?.selectionStart ?? latest.current.markdown.length,
        end: textarea?.selectionEnd ?? latest.current.markdown.length,
      }),
    });
  }
  const locked = !!entry?.manual_locked || entry?.auto_locked;
  const conflictId = submit.error instanceof ApiError ? submit.error.data.entry_id : null;
  if (submit.isSuccess)
    return (
      <main id="main" className="main container">
        <Empty
          title={entry ? '词条修改已提交审核' : '词条已提交审核'}
          description="审核通过后才会公开。你可以在个人中心查看状态或撤回申请。"
          children={
            <div className="row">
              <SiteLink href={`/profile.html?submission=${submit.data.id}#home`}>
                查看我的申请
              </SiteLink>
              <SiteLink href={entry ? `/wiki.html?id=${entry.id}` : '/wiki.html'}>
                返回 Wiki
              </SiteLink>
            </div>
          }
        />
      </main>
    );
  return (
    <main id="main" className="main container wiki-editor">
      <SiteLink href={entry ? `/wiki.html?id=${entry.id}` : '/wiki.html'}>← 返回 Wiki</SiteLink>
      <h1>{entry ? '编辑词条' : '新建词条'}</h1>
      <p className="u-muted">
        用 Markdown 记录校园知识。所有新建与修改均在审核通过后公开，每天最多提交 10 次。
      </p>
      {locked && (
        <p className="callout" role="status">
          {entry?.manual_locked
            ? `词条已手动锁定：${entry.lock_reason}`
            : '词条正在审核，暂时不能提交新的修改。'}
          草稿仍会保留。
        </p>
      )}
      {draft.base_revision_id && entry && draft.base_revision_id !== entry.current_revision_id && (
        <p className="callout" role="alert">
          公开版本已变化。请先对照最新内容合并草稿，再确认使用最新版本。
          <button
            className="btn btn--sm"
            onClick={() => change({ base_revision_id: entry.current_revision_id })}
          >
            已合并，使用最新版本
          </button>
        </p>
      )}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="词条标题">
          <input
            className="input"
            value={draft.title}
            required
            maxLength={100}
            onChange={(e) => change({ title: e.target.value })}
          />
        </Field>
        <Field label="归属文件夹">
          <select
            className="select"
            value={draft.folder_id}
            required
            onChange={(e) => change({ folder_id: e.target.value })}
          >
            <option value="">请选择文件夹</option>
            {directory.folders
              .filter((f) => !f.parent_id)
              .flatMap((f) => [
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>,
                ...directory.folders
                  .filter((s) => s.parent_id === f.id)
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {f.name} / {s.name}
                    </option>
                  )),
              ])}
          </select>
        </Field>
        {!directory.folders.length && (
          <p className="field__error">暂无文件夹，请联系管理员先建立目录。</p>
        )}
        <Field label="别名（选填，每行一个或逗号分隔，最多 20 个）">
          <textarea
            className="textarea"
            value={draft.aliases}
            onChange={(e) => change({ aliases: e.target.value })}
          />
        </Field>
        <label htmlFor="wiki-markdown-input">Markdown 正文</label>
        <div
          ref={editorRoot}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            insertImages(Array.from(event.dataTransfer.files));
          }}
        >
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp"
            aria-label="上传正文图片"
            onChange={(event) => {
              insertImages(Array.from(event.target.files || []), uploadSelection.current);
              event.target.value = '';
            }}
          />
          <MDEditor
            className="wiki-markdown-editor"
            data-color-mode={colorMode}
            value={draft.markdown}
            onChange={(markdown) => change({ markdown: markdown || '' })}
            height={520}
            minHeight={300}
            preview={matchMedia('(max-width: 767px)').matches ? 'edit' : 'live'}
            commands={[
              commands.bold,
              commands.italic,
              commands.strikethrough,
              commands.divider,
              commands.title,
              commands.link,
              {
                ...commands.image,
                name: 'upload-image',
                keyCommand: 'upload-image',
                shortcuts: undefined,
                buttonProps: {
                  'aria-label': '上传图片',
                  title: '上传图片（也可拖入或粘贴）',
                  disabled: uploadBusy,
                },
                execute: (state) => {
                  uploadSelection.current = {
                    start: state.selection.start,
                    end: state.selection.end,
                  };
                  fileInput.current?.click();
                },
              },
              commands.quote,
              commands.code,
              commands.codeBlock,
              commands.divider,
              commands.unorderedListCommand,
              commands.orderedListCommand,
              commands.checkedListCommand,
              commands.table,
              commands.hr,
            ]}
            commandsFilter={(command) => ({
              ...command,
              icon: isValidElement<SVGProps<SVGSVGElement>>(command.icon)
                ? cloneElement(command.icon, { 'aria-hidden': true, focusable: false })
                : command.icon,
            })}
            extraCommands={[
              commands.codeEdit,
              commands.codeLive,
              commands.codePreview,
              commands.divider,
              commands.fullscreen,
            ]}
            textareaProps={{
              id: 'wiki-markdown-input',
              required: true,
              maxLength: 100000,
              spellCheck: false,
              placeholder: '## 小节标题\n\n从这里开始书写…',
              onPaste: (event) => {
                const files = Array.from(event.clipboardData.files);
                if (!files.length) return;
                event.preventDefault();
                insertImages(files);
              },
            }}
            components={{ preview: (source) => <WikiMarkdown source={source} /> }}
          />
        </div>
        <p className="field__hint">
          图片可拖入、粘贴或通过工具栏上传（单张最大 2
          MB），删除正文中的图片标记即可移除。参考资料直接在正文中编写。
          支持表格、任务列表、代码块与站内链接。提示块可使用 :::note，折叠块可使用
          :::details；也支持 MkDocs 的 !!! 与 ??? 缩进语法。
        </p>
        {uploadBusy && <p role="status">正在上传图片…</p>}
        {uploadError && (
          <p className="field__error" role="alert">
            {uploadError}
          </p>
        )}
        <Field label={entry ? '本次编辑摘要（必填）' : '编辑摘要（选填）'}>
          <textarea
            className="textarea"
            value={draft.summary}
            required={!!entry}
            maxLength={500}
            onChange={(e) => change({ summary: e.target.value })}
          />
        </Field>
        <p role="status" className={storageError ? 'field__error' : 'u-muted'}>
          {storageError
            ? '当前设备无法保存草稿，请保留页面或复制正文后再离开。'
            : saved
              ? '草稿已自动保存在当前设备'
              : '编辑内容会自动暂存至当前设备'}
        </p>
        {submit.error && (
          <p role="alert" className="field__error">
            {submit.error.message}
            {typeof conflictId === 'number' && (
              <SiteLink href={`/wiki.html?id=${conflictId}`}> 查看已有词条</SiteLink>
            )}
          </p>
        )}
        <div className="row">
          <Submit
            pending={submit.isPending || uploadBusy}
            disabled={
              locked ||
              !directory.folders.length ||
              (!!entry && draft.base_revision_id !== entry.current_revision_id)
            }
          >
            提交审核
          </Submit>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm('放弃当前设备的草稿并恢复公开内容？')) {
                dirty.current = false;
                localStorage.removeItem(key);
                setDraft(initial);
                setSaved(false);
              }
            }}
          >
            放弃草稿
          </button>
          <button
            type="button"
            className="btn btn--link"
            onClick={() => {
              void navigate({
                to: '/wiki.html',
                search: entry ? { id: String(entry.id) } : {},
              });
            }}
          >
            返回阅读
          </button>
        </div>
      </form>
    </main>
  );
}
