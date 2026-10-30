import { hueLabels, titleHues, type Title } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, endpoint, formValues, queryClient } from '../lib/api';
import {
  Confirm,
  Dialog,
  Empty,
  ErrorState,
  Field,
  Icon,
  Loading,
  Submit,
  TitleBadge,
  useToast,
} from './ui';

export type CatalogTitle = Title & {
  key?: string;
  source: string;
  rule: string;
  holder_count: number;
  equipped?: number;
};
export function HueChoices({
  name,
  initial = 'stone',
  id,
}: {
  name: string;
  initial?: string;
  id?: string;
}) {
  return (
    <div className="chips" id={id}>
      {titleHues.map((hue) => (
        <label className="chip" key={hue}>
          <input
            className="chip__input"
            type="radio"
            name={name}
            value={hue}
            defaultChecked={hue === initial}
          />
          <span className="chip__face">
            <span className="title-badge" data-hue={hue}>
              <Icon name="award" />
              <span className="title-badge__text">{hueLabels[hue]}</span>
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
export function TitleManagement() {
  const query = useQuery(endpoint<{ titles: CatalogTitle[] }>('/api/admin/titles'));
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<CatalogTitle> | null>(null);
  const [deleting, setDeleting] = useState<CatalogTitle | null>(null);
  const [message, setMessage] = useState('');
  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api(editing?.id ? `/api/admin/titles/${editing.id}` : '/api/admin/titles', {
        method: editing?.id ? 'PUT' : 'POST',
        body,
      }),
    onSuccess: () => {
      setEditing(null);
      toast('已保存');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/titles'] });
    },
    onError: (e) => setMessage(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/titles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('已删除');
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <>
      <div className="row row--between u-mb-4">
        <h2 className="u-fs-lg">头衔目录</h2>
        <button
          type="button"
          className="btn btn--primary"
          id="titleAdd"
          onClick={() => {
            setMessage('');
            setEditing({ name: '', hue: 'stone', description: '' });
          }}
        >
          <Icon name="plus" />
          新建头衔
        </button>
      </div>
      <div id="titleList">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : query.data.titles.length ? (
          <div className="table-wrap">
            <table className="table table--stack">
              <caption className="sr-only">头衔目录</caption>
              <thead>
                <tr>
                  {['徽章', '名称', '颜色', '来源', '持有人数', '操作'].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.titles.map((t) => (
                  <tr key={t.id}>
                    <td data-label="徽章">
                      <TitleBadge title={t} />
                    </td>
                    <td data-label="名称">{t.name}</td>
                    <td data-label="颜色">{hueLabels[t.hue || 'stone']}</td>
                    <td data-label="来源">
                      {t.source === 'auto' ? `自动 · ${t.rule}` : '手动授予'}
                    </td>
                    <td data-label="持有人数" className="mono">
                      {t.holder_count}
                    </td>
                    <td data-label="操作">
                      <div className="row row--sm">
                        <button
                          type="button"
                          className="btn btn--sm"
                          data-edit-title={t.id}
                          onClick={() => {
                            setMessage('');
                            setEditing(t);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger-quiet btn--sm"
                          disabled={!!t.key || remove.isPending}
                          title={t.key ? '内置头衔不可删除' : undefined}
                          data-delete-title={t.key ? undefined : t.id}
                          onClick={() => setDeleting(t)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="暂无头衔" description="新建一个头衔后即可授予用户。" />
        )}
      </div>
      {editing && (
        <Dialog
          id="titleModal"
          title={editing.id ? '编辑头衔' : '新建头衔'}
          className="dialog--sheet dialog--wide"
          onClose={() => setEditing(null)}
        >
          <form
            id="titleForm"
            onSubmit={(e) => {
              e.preventDefault();
              const v = formValues(e.currentTarget);
              save.mutate({ name: v.titleName, description: v.titleDesc, hue: v.titleHue });
            }}
          >
            <div className="dialog__body stack">
              <Field
                label="名称"
                name="titleName"
                required
                maxLength={8}
                defaultValue={editing.name}
              />
              <Field
                label="描述"
                name="titleDesc"
                maxLength={40}
                defaultValue={editing.description}
              />
              <div className="field">
                <span className="field__label">颜色</span>
                <HueChoices id="titleHueChips" name="titleHue" initial={editing.hue} />
              </div>
              <p className="field__hint" id="titleSourceNote">
                {editing.source === 'auto'
                  ? `自动头衔：由规则「${editing.rule}」发放，不能手动授予。`
                  : '手动头衔：需要在用户管理中授予。'}
              </p>
            </div>
            <div className="dialog__foot">
              <span className="status-text is-error" id="titleMsg" role="status">
                {message}
              </span>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <Submit id="titleConfirm" pending={save.isPending}>
                保存
              </Submit>
            </div>
          </form>
        </Dialog>
      )}
      {deleting && (
        <Confirm
          title={`删除头衔「${deleting.name}」？`}
          message="所有用户的拥有与佩戴记录都会一并移除，且不可恢复。"
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </>
  );
}

export function GrantTitles({
  userId,
  username,
  onClose,
}: {
  userId: number;
  username: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const target = useQuery(
    endpoint<{ user: { titles: CatalogTitle[] } }>(`/api/admin/users/${userId}`),
  );
  const catalog = useQuery(endpoint<{ titles: CatalogTitle[] }>('/api/admin/titles'));
  const [revoke, setRevoke] = useState<CatalogTitle | null>(null);
  const action = useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => api(`/api/admin/users/${userId}/titles${path}`, { method, body }),
    onSuccess: () => {
      toast('已保存');
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const owned = target.data?.user.titles || [];
  const available =
    catalog.data?.titles.filter((t) => t.source === 'grant' && !owned.some((o) => o.id === t.id)) ||
    [];
  return (
    <Dialog
      id="grantModal"
      title={`头衔 ${username}`}
      className="dialog--sheet dialog--wide"
      onClose={onClose}
    >
      <form
        id="grantForm"
        onSubmit={(e) => {
          e.preventDefault();
          const picked = formValues(e.currentTarget).grantTitle;
          if (picked) action.mutate({ path: '', body: { title_id: Number(picked) } });
        }}
      >
        <div className="dialog__body stack">
          {target.error ? (
            <ErrorState error={target.error} retry={target.refetch} />
          ) : target.isPending ? (
            <Loading />
          ) : (
            <>
              <div>
                <p className="field__label">可授予</p>
                <div className="chips" id="grantChoices">
                  {available.length ? (
                    available.map((t) => (
                      <label className="chip" key={t.id}>
                        <input
                          className="chip__input"
                          type="radio"
                          name="grantTitle"
                          value={t.id}
                        />
                        <span className="chip__face">
                          <TitleBadge title={t} />
                        </span>
                      </label>
                    ))
                  ) : (
                    <span className="u-muted u-fs-sm">该用户已拥有全部可授予头衔</span>
                  )}
                </div>
              </div>
              <div>
                <p className="field__label">已拥有</p>
                <div className="stack" id="grantOwned">
                  {owned.length ? (
                    owned.map((t) => (
                      <span className="row row--sm" key={t.id}>
                        <TitleBadge title={t} />
                        {!!t.equipped && <span className="badge badge--ok">佩戴中</span>}
                        {t.source === 'auto' ? (
                          <span className="u-muted u-fs-xs">自动</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--danger-quiet btn--sm"
                            data-revoke-title={t.id}
                            onClick={() => setRevoke(t)}
                          >
                            撤销
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="u-muted u-fs-sm">尚未拥有任何头衔</span>
                  )}
                </div>
              </div>
            </>
          )}
          <div className="field">
            <label className="field__label" htmlFor="exclusiveName">
              专属头衔（只发给该账号）
            </label>
            <div className="row row--sm">
              <input
                className="input grow"
                id="exclusiveName"
                name="exclusiveName"
                maxLength={8}
                placeholder="例如：首席摸鱼官"
              />
              <button
                type="button"
                className="btn btn--primary"
                id="exclusiveGrant"
                disabled={action.isPending}
                onClick={(e) => {
                  const form = e.currentTarget.form!;
                  const v = formValues(form);
                  if (!v.exclusiveName.trim()) {
                    toast('请填写专属头衔名称', 'warning');
                    return;
                  }
                  action.mutate({
                    path: '/custom',
                    body: { name: v.exclusiveName, hue: v.exclusiveHue },
                  });
                }}
              >
                颁发
              </button>
            </div>
            <HueChoices id="exclusiveHues" name="exclusiveHue" />
            <div className="field__foot">
              <span className="field__hint">1–8 个字，不进公共目录；撤销后目录行一并删除</span>
            </div>
          </div>
        </div>
        <div className="dialog__foot">
          <span className="status-text" id="grantMsg" role="status" />
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          <Submit id="grantConfirm" pending={action.isPending} disabled={!available.length}>
            授予
          </Submit>
        </div>
      </form>
      {revoke && (
        <Confirm
          title={`撤销 ${username} 的「${revoke.name}」？`}
          message="其佩戴状态将一并清除。"
          label="撤销"
          onClose={() => setRevoke(null)}
          onConfirm={() => action.mutate({ path: `/${revoke.id}`, method: 'DELETE' })}
        />
      )}
    </Dialog>
  );
}
