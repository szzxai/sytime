import { roleLabels, type User } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, endpoint, formValues, queryClient } from '../lib/api';
import { useSession } from '../lib/session';
import { GrantTitles } from './TitleManagement';
import {
  Confirm,
  Dialog,
  Empty,
  ErrorState,
  Field,
  Loading,
  RoleTag,
  Submit,
  useToast,
} from './ui';
type Account = User & { student_id?: string; allow_appeal: number; ban_reason: string };
export function AdminUsers() {
  const { user: actor } = useSession();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<{ user: Account; kind: 'ban' | 'role' | 'titles' } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    path: string;
    body?: unknown;
    method?: string;
  } | null>(null);
  const query = useQuery(
    endpoint<{ users: Account[]; total: number }>(
      `/api/admin/users?search=${encodeURIComponent(search)}&offset=${page * 20}`,
    ),
  );
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'PUT',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => api(path, { method, body }),
    onSuccess: () => {
      toast('账号已更新，相关用户已收到通知');
      setDialog(null);
      setConfirm(null);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const editable = (u: Account) =>
    actor?.id !== u.id &&
    u.role !== 'operator' &&
    (u.role !== 'admin' || actor?.role === 'operator');
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <div>
          <h2>社区账号</h2>
          <p>
            {actor?.role === 'operator'
              ? '管理普通账号与管理员，运营者账号由服务器维护。'
              : '管理普通用户与学生；管理员由运营者管理。'}
          </p>
        </div>
        <span>{query.data?.total || 0} 个账号</span>
      </div>
      <div className="admin-toolbar">
        <label>
          搜索用户
          <input
            className="input"
            placeholder="用户名、昵称或展示 ID"
            value={search}
            maxLength={50}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data?.users.length ? (
        <div className="admin-table-wrap" tabIndex={0} role="region" aria-label="数据表格">
          <table className="admin-table">
            <thead>
              <tr>
                {['账号', '展示 ID', '角色', '学生身份', '状态', '管理操作'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.nickname}</strong>
                    <small>
                      @{u.username} · #{u.id}
                    </small>
                  </td>
                  <td>{u.display_id}</td>
                  <td>
                    <RoleTag role={u.role} />
                  </td>
                  <td>{u.student_id || '未绑定'}</td>
                  <td>
                    <span
                      className={`review-status review-status--${u.status === 'active' ? 'approved' : 'rejected'}`}
                    >
                      {u.status === 'active' ? '正常' : '已封禁'}
                    </span>
                  </td>
                  <td>
                    {editable(u) ? (
                      <div className="admin-user-actions">
                        <button
                          className="btn btn--sm"
                          onClick={() => setDialog({ user: u, kind: 'role' })}
                        >
                          角色
                        </button>
                        <button
                          className="btn btn--sm"
                          onClick={() => setDialog({ user: u, kind: 'titles' })}
                        >
                          头衔
                        </button>
                        <button
                          className="btn btn--sm"
                          onClick={() =>
                            u.status === 'banned'
                              ? setConfirm({
                                  title: `解封 ${u.username}？`,
                                  path: '/api/admin/users/unban',
                                  body: { userId: u.id },
                                })
                              : setDialog({ user: u, kind: 'ban' })
                          }
                        >
                          {u.status === 'banned' ? '解封' : '封禁'}
                        </button>
                        {u.student_id && (
                          <button
                            className="btn btn--sm"
                            onClick={() =>
                              setConfirm({
                                title: `解绑 ${u.username} 的学生身份？`,
                                path: `/api/admin/users/${u.id}/unbind`,
                                method: 'POST',
                              })
                            }
                          >
                            解绑
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="u-muted">
                        {actor?.id === u.id ? '当前账号' : '受保护账号'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="没有匹配的账号" />
      )}
      {!!query.data && query.data.total > 20 && (
        <div className="admin-pagination">
          <span>共 {query.data.total} 个账号</span>
          <button className="btn btn--sm" disabled={!page} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <button
            className="btn btn--sm"
            disabled={(page + 1) * 20 >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
      {dialog?.kind === 'titles' && (
        <GrantTitles
          userId={dialog.user.id}
          username={dialog.user.username}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && dialog.kind !== 'titles' && (
        <Dialog
          title={`${dialog.kind === 'ban' ? '封禁' : '调整角色'} · ${dialog.user.username}`}
          onClose={() => setDialog(null)}
        >
          <form
            className="dialog__form"
            onSubmit={(e) => {
              e.preventDefault();
              const value = formValues(e.currentTarget);
              if (dialog.kind === 'ban')
                action.mutate({
                  path: '/api/admin/users/ban',
                  body: {
                    userId: dialog.user.id,
                    ban_reason: value.ban_reason,
                    allow_appeal: value.allow_appeal === 'on',
                  },
                });
              else
                setConfirm({
                  title: `确认修改 ${dialog.user.username} 的角色？`,
                  path: '/api/admin/users/role',
                  body: { userId: dialog.user.id, newRole: value.role },
                });
            }}
          >
            <div className="dialog__body stack">
              {dialog.kind === 'ban' ? (
                <>
                  <Field label="封禁原因">
                    <textarea className="textarea" name="ban_reason" required maxLength={500} />
                  </Field>
                  <label className="row">
                    <input type="checkbox" name="allow_appeal" defaultChecked />
                    允许在线申诉
                  </label>
                  <p className="field__hint">
                    封禁立即撤销所有设备会话。关闭申诉后，后端也会拒绝在线申请。
                  </p>
                </>
              ) : (
                <>
                  <Field label="角色">
                    <select className="select" name="role" defaultValue={dialog.user.role}>
                      {(
                        [
                          'user',
                          ...(dialog.user.student_id ? ['student'] : []),
                          ...(actor?.role === 'operator' ? ['admin'] : []),
                        ] as const
                      ).map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r as keyof typeof roleLabels]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="field__hint">
                    学生角色只能通过认证获得；改为普通用户会释放已绑定学号。角色变更使所有设备退出登录。
                  </p>
                </>
              )}
            </div>
            <div className="dialog__foot">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                取消
              </button>
              <Submit pending={action.isPending}>确认操作</Submit>
            </div>
          </form>
        </Dialog>
      )}
      {confirm && (
        <Confirm
          title={confirm.title}
          message="操作将记录并通知用户；身份解绑会撤回待审内容，角色或封禁变更会撤销会话。"
          label="确认"
          onClose={() => setConfirm(null)}
          onConfirm={() => action.mutate(confirm)}
          pending={action.isPending}
        />
      )}
    </section>
  );
}
