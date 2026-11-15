import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, endpoint, formValues, queryClient, formatTime } from '../lib/api';
import { Confirm, Empty, ErrorState, Field, Loading, Submit, useToast } from './ui';
import { SiteLink } from './SiteLink';
import type { WikiDirectory, WikiEntry, WikiFolder, WikiRevision } from '../pages/WikiPage';
import '../pages/WikiPage.css';

export function WikiManagement() {
  const directory = useQuery(endpoint<WikiDirectory>('/api/wiki', false));
  const [selected, setSelected] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ path: string; title: string } | null>(null);
  const entry = useQuery({
    ...endpoint<{ entry: WikiEntry }>(`/api/wiki/entries/${selected}`, false),
    enabled: !!selected,
  });
  const history = useQuery({
    ...endpoint<{ revisions: WikiRevision[] }>(`/api/wiki/entries/${selected}/history`, false),
    enabled: !!selected,
  });
  const toast = useToast();
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => api(path, { body, method }),
    onSuccess: () => {
      toast('Wiki 管理操作已完成');
      void queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const [folderEdit, setFolderEdit] = useState<WikiFolder | null>(null);
  const current = entry.data?.entry;
  if (directory.isPending) return <Loading />;
  if (directory.error) return <ErrorState error={directory.error} retry={directory.refetch} />;
  const folders = directory.data!.folders;
  const folderOptions = (
    <>
      <option value="">一级分区</option>
      {folders
        .filter((f) => !f.parent_id && f.id !== folderEdit?.id)
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
    </>
  );
  return (
    <div className="stack stack--lg">
      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>Wiki 文件夹目录</h2>
          <span>最多两级，排序数字越小越靠前</span>
        </div>
        <div className="admin-content-form stack">
          <form
            key={folderEdit?.id || 'new'}
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const value = formValues(form);
              action.mutate(
                {
                  path: folderEdit
                    ? `/api/admin/wiki/folders/${folderEdit.id}`
                    : '/api/admin/wiki/folders',
                  method: folderEdit ? 'PUT' : 'POST',
                  body: {
                    ...value,
                    parent_id: Number(value.parent_id) || null,
                    position: Number(value.position),
                  },
                },
                {
                  onSuccess: () => {
                    setFolderEdit(null);
                    form.reset();
                  },
                },
              );
            }}
          >
            <h3>{folderEdit ? `编辑目录：${folderEdit.name}` : '新建文件夹'}</h3>
            <Field label="文件夹名称">
              <input
                className="input"
                name="name"
                required
                maxLength={80}
                defaultValue={folderEdit?.name}
              />
            </Field>
            <Field label="所属一级分区">
              <select
                className="select"
                name="parent_id"
                defaultValue={folderEdit?.parent_id || ''}
              >
                {folderOptions}
              </select>
            </Field>
            <Field label="排序">
              <input
                className="input"
                name="position"
                type="number"
                step={1}
                min={-1000000}
                max={1000000}
                defaultValue={folderEdit?.position || 0}
              />
            </Field>
            <div className="row">
              <Submit pending={action.isPending}>{folderEdit ? '保存目录' : '新建目录'}</Submit>
              {folderEdit && (
                <button type="button" className="btn" onClick={() => setFolderEdit(null)}>
                  取消编辑
                </button>
              )}
            </div>
          </form>
          {folders.map((f) => (
            <div className="submission-row" key={f.id}>
              <strong>
                {f.parent_id ? `${folders.find((p) => p.id === f.parent_id)?.name} / ` : ''}
                {f.name}
              </strong>
              <small>
                {f.count} 篇 · 排序 {f.position}
              </small>
              <button className="btn btn--sm" onClick={() => setFolderEdit(f)}>
                编辑目录
              </button>
              <button
                className="btn btn--sm"
                onClick={() =>
                  setDeleting({
                    path: `/api/admin/wiki/folders/${f.id}`,
                    title: `删除空文件夹「${f.name}」？`,
                  })
                }
              >
                删除空目录
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>词条治理</h2>
          <span>修改目录、排序与锁定立即生效</span>
        </div>
        <div className="admin-content-form stack">
          <Field label="选择词条">
            <select
              className="select"
              value={selected || ''}
              onChange={(e) => setSelected(Number(e.target.value) || null)}
            >
              <option value="">请选择词条</option>
              {directory.data!.entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.path.map((f) => f.name).join(' / ')} / {e.title}
                </option>
              ))}
            </select>
          </Field>
          {!directory.data!.entries.length && <Empty title="暂无公开词条" />}
          {selected &&
            (entry.isPending ? (
              <Loading />
            ) : entry.error ? (
              <ErrorState error={entry.error} retry={entry.refetch} />
            ) : (
              current && (
                <>
                  <SiteLink href={`/wiki.html?id=${current.id}`}>阅读「{current.title}」</SiteLink>
                  {current.auto_locked && (
                    <p className="callout">
                      该词条存在待审核修改。手动锁定期间可拒绝申请，通过前须先解除手动锁定。
                    </p>
                  )}
                  <form
                    key={`${current.id}:${current.folder_id}:${current.position}:${current.manual_locked}:${current.lock_reason}`}
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = formValues(e.currentTarget);
                      action.mutate({
                        path: `/api/admin/wiki/entries/${selected}`,
                        method: 'PUT',
                        body: {
                          folder_id: Number(value.folder_id),
                          position: Number(value.position),
                          manual_locked: value.manual_locked === 'on',
                          lock_reason: value.lock_reason,
                        },
                      });
                    }}
                  >
                    <Field label="归属文件夹">
                      <select className="select" name="folder_id" defaultValue={current.folder_id}>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.parent_id
                              ? folders.find((p) => p.id === f.parent_id)?.name + ' / '
                              : ''}
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="目录内排序">
                      <input
                        className="input"
                        name="position"
                        type="number"
                        step={1}
                        min={-1000000}
                        max={1000000}
                        defaultValue={current.position}
                      />
                    </Field>
                    <label className="row">
                      <input
                        type="checkbox"
                        name="manual_locked"
                        defaultChecked={!!current.manual_locked}
                      />
                      手动锁定词条
                    </label>
                    <Field label="锁定说明（手动锁定时必填）">
                      <textarea
                        className="textarea"
                        name="lock_reason"
                        maxLength={500}
                        defaultValue={current.lock_reason}
                      />
                    </Field>
                    <Submit pending={action.isPending}>保存词条设置</Submit>
                  </form>
                  <h3>历史版本</h3>
                  {history.isPending ? (
                    <Loading />
                  ) : history.error ? (
                    <ErrorState error={history.error} retry={history.refetch} />
                  ) : (
                    history.data?.revisions.map((r) => (
                      <article className="submission-row" key={r.id}>
                        <div>
                          <SiteLink href={`/wiki.html?id=${selected}&revision=${r.id}`}>
                            版本 #{r.id} · {formatTime(r.created_at)}
                          </SiteLink>
                          <p>
                            {r.nickname} · {r.summary}
                          </p>
                        </div>
                        <button
                          className="btn btn--sm"
                          disabled={
                            action.isPending ||
                            current.auto_locked ||
                            r.id === current.current_revision_id
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `将词条回滚至公开版本 #${r.id}？此操作会创建新的公开修订记录。`,
                              )
                            )
                              action.mutate({
                                path: `/api/admin/wiki/entries/${selected}/rollback`,
                                body: { revision_id: r.id },
                              });
                          }}
                        >
                          回滚至此版本
                        </button>
                        <button
                          className="btn btn--sm"
                          disabled={action.isPending || r.id === current.current_revision_id}
                          onClick={() => {
                            if (window.confirm('隐藏后，该历史快照将不再公开。确认隐藏？'))
                              action.mutate({
                                path: `/api/admin/wiki/entries/${selected}/revisions/${r.id}/hide`,
                              });
                          }}
                        >
                          隐藏快照
                        </button>
                      </article>
                    ))
                  )}
                  <button
                    className="btn btn--danger"
                    onClick={() =>
                      setDeleting({
                        path: `/api/admin/wiki/entries/${selected}`,
                        title: `删除词条「${current.title}」？`,
                      })
                    }
                  >
                    删除词条
                  </button>
                </>
              )
            ))}
        </div>
      </section>
      {deleting && (
        <Confirm
          title={deleting.title}
          message="删除词条后，关联的待审核修改将一并失效并通知申请人；仅空文件夹可删除。操作记录会保留。"
          pending={action.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            action.mutate(
              { path: deleting.path, method: 'DELETE' },
              {
                onSuccess: () => {
                  if (deleting.path.includes('/entries/')) setSelected(null);
                  setDeleting(null);
                },
              },
            )
          }
        />
      )}
    </div>
  );
}
