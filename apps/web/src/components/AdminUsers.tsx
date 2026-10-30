import { roleLabels, roleWeights, type Role, type User } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, endpoint, formValues, queryClient } from '../lib/api';
import { useSession } from '../lib/session';
import { Upload } from './Media';
import { GrantTitles, type CatalogTitle } from './TitleManagement';
import { Confirm, Dialog, ErrorState, Field, Loading, Submit, TitleBadge, useToast } from './ui';

type AdminUser = User & { status: string; titles: CatalogTitle[] };
type Change = { title: string; path: string; body: unknown };
export function AdminUsers() {
  const { user: actor } = useSession();
  const toast = useToast();
  const query = useQuery(endpoint<{ users: AdminUser[] }>('/api/admin/users'));
  const permissions = useQuery(
    endpoint<{ permissions: { key: string; label: string }[] }>('/api/admin/permissions'),
  );
  const [dialog, setDialog] = useState<{
    user: AdminUser;
    kind: 'ban' | 'permissions' | 'titles';
  } | null>(null);
  const [confirm, setConfirm] = useState<Change | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const action = useMutation({
    mutationFn: ({ path, body }: Pick<Change, 'path' | 'body'>) =>
      api(path, { method: 'PUT', body }),
    onSuccess: () => {
      setDialog(null);
      setImage(null);
      toast('已保存');
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  return (
    <>
      <div className="table-wrap">
        <table className="table table--stack">
          <caption className="sr-only">用户与权限管理</caption>
          <thead>
            <tr>
              {['ID', '用户名', '昵称', '角色', '头衔', '状态', '操作'].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data.users.map((user) => {
              const editable =
                actor && actor.id !== user.id && roleWeights[user.role] < roleWeights[actor.role];
              return (
                <tr key={user.id}>
                  <td data-label="ID" className="mono">
                    {user.display_id || user.id}
                  </td>
                  <td data-label="用户名">{user.username}</td>
                  <td data-label="昵称">{user.nickname}</td>
                  <td data-label="角色">
                    {editable ? (
                      <select
                        className="select"
                        data-role-select={user.id}
                        aria-label={`${user.username}的角色`}
                        value={user.role}
                        disabled={action.isPending}
                        onChange={(e) =>
                          setConfirm({
                            title: `将 ${user.username} 的角色改为 ${roleLabels[e.target.value as Role]}？`,
                            path: '/api/admin/users/role',
                            body: { userId: user.id, newRole: e.target.value },
                          })
                        }
                      >
                        {(Object.keys(roleLabels) as Role[])
                          .filter(
                            (role) =>
                              role !== 'guest' && roleWeights[role] < roleWeights[actor.role],
                          )
                          .reverse()
                          .map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                      </select>
                    ) : (
                      roleLabels[user.role]
                    )}
                  </td>
                  <td data-label="头衔">
                    {user.titles?.length ? (
                      user.titles.map((t) => <TitleBadge key={t.id} title={t} />)
                    ) : (
                      <span className="u-muted">—</span>
                    )}
                  </td>
                  <td data-label="状态">
                    <span className={`badge badge--${user.status === 'banned' ? 'danger' : 'ok'}`}>
                      {user.status === 'banned' ? '已封禁' : '正常'}
                    </span>
                  </td>
                  <td data-label="操作">
                    {editable ? (
                      <div className="row row--sm">
                        <button
                          type="button"
                          className="btn btn--sm"
                          data-titles={user.id}
                          onClick={() => setDialog({ user, kind: 'titles' })}
                        >
                          头衔
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          data-perms={user.id}
                          onClick={() => setDialog({ user, kind: 'permissions' })}
                        >
                          权限
                        </button>
                        {user.status === 'banned' ? (
                          <button
                            type="button"
                            className="btn btn--sm"
                            data-unban={user.id}
                            onClick={() =>
                              setConfirm({
                                title: '解封该用户？',
                                path: '/api/admin/users/unban',
                                body: { userId: user.id },
                              })
                            }
                          >
                            解封
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--sm btn--danger-quiet"
                            data-ban={user.id}
                            onClick={() => {
                              setImage(null);
                              setDialog({ user, kind: 'ban' });
                            }}
                          >
                            封号
                          </button>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dialog?.kind === 'titles' && (
        <GrantTitles
          userId={dialog.user.id}
          username={dialog.user.username}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'permissions' && (
        <Dialog
          id="permsModal"
          title={`设置权限 ${dialog.user.username}`}
          className="dialog--sheet dialog--wide"
          onClose={() => setDialog(null)}
        >
          <form
            id="permsForm"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({
                path: '/api/admin/users/permissions',
                body: {
                  userId: dialog.user.id,
                  permissions: new FormData(e.currentTarget).getAll('permissions'),
                },
              });
            }}
          >
            <div className="dialog__body stack" id="permsList">
              {permissions.error ? (
                <ErrorState error={permissions.error} retry={permissions.refetch} />
              ) : (
                permissions.data?.permissions.map((p) => (
                  <label key={p.key} className="check-row">
                    <input
                      type="checkbox"
                      className="check"
                      name="permissions"
                      value={p.key}
                      defaultChecked={dialog.user.permissions?.includes(p.key)}
                    />
                    <span>{p.label}</span>
                  </label>
                ))
              )}
            </div>
            <div className="dialog__foot">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                取消
              </button>
              <Submit id="permsConfirm" pending={action.isPending} disabled={!permissions.data}>
                保存
              </Submit>
            </div>
          </form>
        </Dialog>
      )}
      {dialog?.kind === 'ban' && (
        <Dialog
          id="banModal"
          title={`封禁用户 ${dialog.user.username}`}
          className="dialog--sheet dialog--wide"
          onClose={() => setDialog(null)}
        >
          <form
            id="banForm"
            onSubmit={(e) => {
              e.preventDefault();
              const v = formValues(e.currentTarget);
              const data = new FormData();
              data.set('userId', String(dialog.user.id));
              data.set('ban_reason', v.banReasonInput);
              data.set('allow_appeal', v.allowAppeal === 'on' ? '1' : '0');
              if (image) data.set('ban_image', image);
              action.mutate({ path: '/api/admin/users/ban', body: data });
            }}
          >
            <div className="dialog__body stack">
              <Field label="封禁理由（选填）" name="banReasonInput" maxLength={100} />
              <Upload name="banImageInput" file={image} onChange={setImage} maxMB={5} />
              <label className="check-row">
                <input className="check" type="checkbox" name="allowAppeal" defaultChecked />
                <span>允许申诉</span>
              </label>
            </div>
            <div className="dialog__foot">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                取消
              </button>
              <Submit id="banConfirm" pending={action.isPending}>
                确认封禁
              </Submit>
            </div>
          </form>
        </Dialog>
      )}
      {confirm && (
        <Confirm
          title={confirm.title}
          message="该用户的权限与账号状态将立即更新。"
          label="确认修改"
          onClose={() => setConfirm(null)}
          onConfirm={() => action.mutate(confirm)}
        />
      )}
    </>
  );
}
