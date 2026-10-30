import {
  hueLabels,
  atLeast,
  roleLabels,
  roleWeights,
  titleHues,
  type Role,
  type Title,
  type User,
} from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, endpoint, formValues, queryClient } from '../lib/api';
import { useSession } from '../lib/session';
import { Upload } from './Media';
import { Confirm, ErrorState, Field, Loading, Submit, TitleBadge, useToast } from './ui';
export function AccountManagement({ userId }: { userId: number }) {
  const { user: actor } = useSession();
  const toast = useToast();
  const [roleChange, setRoleChange] = useState<string | null>(null);
  const [banFile, setBanFile] = useState<File | null>(null);
  const target = useQuery(
    endpoint<{ user: User & { titles: Title[] } }>(`/api/admin/users/${userId}`),
  );
  const permissions = useQuery(
    endpoint<{ permissions: { key: string; label: string }[] }>('/api/admin/permissions'),
  );
  const canTitles =
    atLeast(actor?.role, 'super_admin') || actor?.permissions?.includes('title_manage');
  const catalog = useQuery({
    ...endpoint<{ titles: (Title & { source: string; hue: string })[] }>('/api/admin/titles'),
    enabled: !!canTitles,
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'PUT',
    }: {
      path: string;
      body: unknown;
      method?: string;
    }) => api(path, { method, body }),
    onSuccess: () => {
      toast('已保存');
      queryClient.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).includes('/users') || String(q.queryKey[0]).includes('/titles'),
      });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (target.isPending) return <Loading />;
  if (target.error) return <ErrorState error={target.error} retry={target.refetch} />;
  const user = target.data.user;
  return (
    <div className="stack" id="manageBox">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          setRoleChange(formValues(e.currentTarget).newRole);
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">权限等级</h2>
        </div>
        <div className="panel__body">
          <label className="field">
            权限等级
            <select className="select" id="mgRole" name="newRole" defaultValue={user.role}>
              {(Object.keys(roleLabels) as Role[])
                .filter(
                  (r) => r !== 'guest' && roleWeights[r] < roleWeights[actor?.role || 'guest'],
                )
                .map((r) => (
                  <option value={r} key={r}>
                    {roleLabels[r]}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="panel__foot">
          <Submit id="mgRoleSave" pending={action.isPending}>
            保存等级
          </Submit>
        </div>
      </form>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({
            path: '/api/admin/users/permissions',
            body: { userId, permissions: new FormData(e.currentTarget).getAll('permissions') },
          });
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">特殊权限</h2>
        </div>
        <div className="panel__body stack">
          {permissions.data?.permissions.map((p) => (
            <label className="check-row" key={p.key}>
              <input
                className="check"
                type="checkbox"
                name="permissions"
                value={p.key}
                defaultChecked={user.permissions?.includes(p.key)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
        <div className="panel__foot">
          <Submit pending={action.isPending}>保存权限</Submit>
        </div>
      </form>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          data.set('userId', String(userId));
          if (!data.has('allow_appeal')) data.set('allow_appeal', '0');
          if (banFile) data.set('ban_image', banFile);
          action.mutate({ path: '/api/admin/users/ban', body: data });
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">账号状态</h2>
        </div>
        <div className="panel__body stack">
          <Field label="封禁理由" name="ban_reason">
            <textarea className="textarea" id="ban_reason" name="ban_reason" />
          </Field>
          <label className="check-row">
            <input className="check" type="checkbox" name="allow_appeal" value="1" defaultChecked />
            <span>允许申诉</span>
          </label>
          <Upload name="ban_image" file={banFile} onChange={setBanFile} maxMB={5} />
        </div>
        <div className="panel__foot">
          {user.status === 'banned' ? (
            <button
              type="button"
              className="btn"
              disabled={action.isPending}
              onClick={() => action.mutate({ path: '/api/admin/users/unban', body: { userId } })}
            >
              解除封禁
            </button>
          ) : (
            <button type="submit" className="btn btn--danger" disabled={action.isPending}>
              封禁用户
            </button>
          )}
        </div>
      </form>
      {canTitles && (
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">头衔</h2>
          </div>
          <div className="panel__body stack">
            {user.titles.map((t) => (
              <div className="row row--between" key={t.id}>
                <TitleBadge title={t} />
                <button
                  hidden={t.source === 'auto'}
                  type="button"
                  className="btn btn--danger-quiet btn--sm"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: `/api/admin/users/${userId}/titles/${t.id}`,
                      method: 'DELETE',
                      body: undefined,
                    })
                  }
                >
                  撤销
                </button>
              </div>
            ))}
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate({
                  path: `/api/admin/users/${userId}/titles`,
                  method: 'POST',
                  body: { title_id: Number(formValues(e.currentTarget).title_id) },
                });
              }}
            >
              <label className="field grow">
                授予公共头衔
                <select className="select" name="title_id">
                  {catalog.data?.titles
                    .filter((t) => t.source !== 'auto')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <Submit pending={action.isPending}>授予</Submit>
            </form>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate({
                  path: `/api/admin/users/${userId}/titles/custom`,
                  method: 'POST',
                  body: formValues(e.currentTarget),
                });
              }}
            >
              <Field label="专属头衔名称" name="name" maxLength={8} required />
              <label className="field">
                颜色
                <select className="select" name="hue">
                  {titleHues.map((h) => (
                    <option key={h} value={h}>
                      {hueLabels[h]}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="描述" name="description" />
              <Submit pending={action.isPending}>授予专属头衔</Submit>
            </form>
          </div>
        </section>
      )}
      {roleChange && (
        <Confirm
          title="确认修改权限等级？"
          message={`将用户权限改为${roleLabels[roleChange as Role]}。`}
          label="确认修改"
          onClose={() => setRoleChange(null)}
          onConfirm={() =>
            action.mutate({ path: '/api/admin/users/role', body: { userId, newRole: roleChange } })
          }
        />
      )}
    </div>
  );
}
