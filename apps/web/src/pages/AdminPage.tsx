import { useUnsavedForm } from '../lib/useUnsavedForm';
import { atLeast, type Role } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { AdminUsers } from '../components/AdminUsers';
import { Picture, Upload } from '../components/Media';
import { MenuAdmin } from '../components/MenuAdmin';
import { MenuImport } from '../components/MenuImport';
import { TicketCard, type Ticket } from '../components/Tickets';
import { TitleManagement } from '../components/TitleManagement';
import {
  Confirm,
  Dialog,
  Empty,
  ErrorState,
  Field,
  Icon,
  Loading,
  Submit,
  useToast,
} from '../components/ui';
import { AdminLayout } from '../layouts/AdminLayout';
import { api, endpoint, formatTime, formValues, queryClient } from '../lib/api';
import { RequireLogin, useSession } from '../lib/session';
import { usePanel } from '../lib/usePanel';
const panels: Record<
  string,
  { label: string; permission?: string; role: Role; path?: string; key?: string }
> = {
  banner: { label: '全站横幅', permission: 'banner_edit', role: 'super_admin' },
  announce: {
    label: '更新公告',
    permission: 'announcement_publish',
    role: 'super_admin',
    path: '/api/announcements',
    key: 'announcements',
  },
  notify: { label: '系统通知', permission: 'announcement_publish', role: 'super_admin' },
  review: {
    label: '学生认证审核',
    permission: 'student_review',
    role: 'super_admin',
    path: '/api/admin/student-applications',
    key: 'applications',
  },
  appeals: {
    label: '封禁申诉',
    permission: 'ban_appeal_review',
    role: 'super_admin',
    path: '/api/admin/ban-appeals',
    key: 'appeals',
  },
  tickets: {
    label: '工单管理',
    permission: 'ticket_manage',
    role: 'admin',
    path: '/api/admin/tickets',
    key: 'tickets',
  },
  users: {
    label: '用户管理',
    permission: 'user_manage',
    role: 'super_admin',
    path: '/api/admin/users',
    key: 'users',
  },
  invite: {
    label: '邀请码管理',
    permission: 'invite_manage',
    role: 'super_admin',
    path: '/api/admin/invite-codes',
    key: 'invite_codes',
  },
  'titles-mgmt': {
    label: '头衔管理',
    permission: 'title_manage',
    role: 'super_admin',
    path: '/api/admin/titles',
    key: 'titles',
  },
  menu: { label: '菜单自动同步', role: 'developer' },
  'menu-import': { label: '菜单手动导入', role: 'admin' },
};
type QueueRow = {
  id: number;
  title: string;
  username: string;
  user_id: number;
  display_id: string;
  status: string;
  student_id: string;
  class_name: string;
  real_name: string;
  extra_info: string;
  created_at: number;
  content: string;
  publish_date: string;
  code: string;
  used_count: number;
  max_uses: number;
  url: string;
  uploaded_at: number;
  appeal_reason: string;
  appeal_image: string;
};
type Action = { path: string; body?: unknown; method?: string };
const navIcons: Record<string, string> = {
  banner: 'megaphone',
  announce: 'mail',
  notify: 'bell',
  review: 'graduation',
  appeals: 'shield',
  tickets: 'clipboard',
  users: 'users',
  invite: 'tag',
  'titles-mgmt': 'award',
  menu: 'utensils',
  'menu-import': 'utensils',
};
const navLabels: Record<string, string> = {
  banner: '编辑横幅',
  notify: '发送系统通知',
  appeals: '申诉处理',
  invite: '邀请码设置',
};
const groups = [
  { label: '内容', items: ['banner', 'announce', 'notify'] },
  { label: '审核', items: ['review', 'appeals', 'tickets'] },
  { label: '用户', items: ['users', 'invite', 'titles-mgmt'] },
  { label: '系统', items: ['menu', 'menu-import'] },
];
export function AdminPage() {
  return (
    <RequireLogin>
      <AdminContent />
    </RequireLogin>
  );
}
function AdminContent() {
  const { user } = useSession();
  const allowed = Object.entries(panels)
    .filter(
      ([, p]) =>
        atLeast(user?.role, p.role) ||
        (!!p.permission && user?.permissions?.includes(p.permission)),
    )
    .map(([key]) => key);
  const [panel, setPanel] = usePanel(allowed, allowed[0] || 'banner');
  const toast = useToast();
  const draft = useUnsavedForm();
  const [reply, setReply] = useState<Ticket | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reject, setReject] = useState<QueueRow | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message?: string;
    label?: string;
    action: Action;
  } | null>(null);
  const p = panels[panel];
  const data = useQuery({
    ...endpoint<Record<string, QueueRow[]>>(p.path || '/api/me'),
    enabled: !!p.path && !['users', 'titles-mgmt'].includes(panel) && allowed.includes(panel),
  });
  const banner = useQuery({
    ...endpoint<{ banner: string }>('/api/settings/banner', false),
    enabled: panel === 'banner',
  });
  const counts = useQuery(
    endpoint<{ counts: Record<string, number> }>('/api/admin/pending-counts'),
  );
  const action = useMutation({
    mutationFn: ({ path, body, method = 'POST' }: Action) => api(path, { method, body }),
    onSuccess: () => {
      toast('操作成功');
      queryClient.invalidateQueries();
      setReply(null);
      setReject(null);
      setFile(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  function submit(
    e: FormEvent<HTMLFormElement>,
    path: string,
    convert: (values: Record<string, string>, form: HTMLFormElement) => unknown,
    method = 'POST',
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    action.mutate(
      { path, method, body: convert(formValues(form), form) },
      {
        onSuccess: () => {
          if (form.id === 'annForm') draft.clean();
          form.reset();
        },
      },
    );
  }
  const bind: Record<string, Record<string, unknown>> = {
    adminShell: { hidden: !allowed.length },
    denyBox: { hidden: !!allowed.length },
    bannerInput: { defaultValue: banner.data?.banner || '', key: banner.data?.banner },
    bannerForm: {
      noValidate: false,
      onSubmit: (e: FormEvent<HTMLFormElement>) =>
        submit(e, '/api/admin/settings/banner', (v) => ({ value: v.bannerInput }), 'PUT'),
    },
    bannerClear: {
      disabled: action.isPending,
      onClick: () =>
        action.mutate({ path: '/api/admin/settings/banner', method: 'PUT', body: { value: '' } }),
    },
    annForm: {
      onInput: draft.onInput,
      noValidate: false,
      onSubmit: (e: FormEvent<HTMLFormElement>) =>
        submit(e, '/api/admin/announcements', (v) => ({
          title: v.annTitle,
          content: v.annContent,
        })),
    },
    notifyForm: {
      noValidate: false,
      onSubmit: (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        setConfirm({
          title: '向全体用户发送这条通知？',
          message: '发送后不可撤回。',
          label: '确认发送',
          action: {
            path: '/api/admin/notifications',
            body: { title: v.ntTitle, body: v.ntBody, important: !!v.ntImportant },
          },
        });
      },
    },
    inviteForm: {
      noValidate: false,
      onSubmit: (e: FormEvent<HTMLFormElement>) =>
        submit(e, '/api/admin/invite-codes', (v) => ({
          code: v.inviteCodeInput,
          max_uses: Number(v.inviteMaxInput),
        })),
    },
  };
  ['bannerSubmit', 'annSubmit', 'ntSubmit', 'inviteAdd'].forEach(
    (id) => (bind[id] = { disabled: action.isPending }),
  );
  Object.keys(panels).forEach(
    (key) =>
      (bind[`view-${key}`] = {
        hidden: key !== panel,
        className: `view${key === panel ? ' is-active' : ''}`,
      }),
  );
  const rows = data.data?.[p.key || ''] || [];
  const remove = (title: string, path: string) =>
    setConfirm({ title, message: '删除后无法恢复。', action: { path, method: 'DELETE' } });
  const list = data.isPending ? (
    <Loading />
  ) : data.error ? (
    <ErrorState error={data.error} retry={data.refetch} />
  ) : rows.length ? (
    rows.map((row) => {
      if (panel === 'tickets')
        return (
          <TicketCard
            key={row.id}
            ticket={row as unknown as Ticket}
            admin
            onReply={() => {
              setFile(null);
              setReply(row as unknown as Ticket);
            }}
          />
        );
      if (panel === 'appeals')
        return (
          <article className="card stack" key={row.id}>
            <h2 className="queue-item__title">
              用户 {row.display_id || row.user_id}（{row.username}）
            </h2>
            <p className="prose">{row.appeal_reason}</p>
            <Picture src={row.appeal_image} caption="申诉图片" />
            <div className="row row--sm">
              {['approve', 'reject'].map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="btn btn--sm"
                  data-approve-appeal={kind === 'approve' ? row.id : undefined}
                  data-reject-appeal={kind === 'reject' ? row.id : undefined}
                  onClick={() =>
                    setConfirm({
                      title: kind === 'approve' ? '通过该申诉并解封？' : '驳回该申诉？',
                      label: '确认',
                      action: {
                        path: '/api/admin/ban-appeals/review',
                        method: 'PUT',
                        body: { appealId: row.id, action: kind },
                      },
                    })
                  }
                >
                  {kind === 'approve' ? '通过' : '驳回'}
                </button>
              ))}
            </div>
          </article>
        );
      return (
        <article className="card queue-item" key={row.id}>
          <div className="queue-item__main">
            <h2 className={`queue-item__title${panel === 'invite' ? ' mono' : ''}`}>
              {panel === 'invite'
                ? row.code
                : panel === 'review'
                  ? row.username || row.user_id
                  : row.title}
            </h2>
            {panel === 'announce' && (
              <>
                <span className="queue-item__meta">发布于 {row.publish_date}</span>
                <p className="prose">
                  {row.content.length > 120 ? row.content.slice(0, 120) + '…' : row.content}
                </p>
              </>
            )}
            {panel === 'review' && (
              <>
                <div className="queue-item__fields">
                  <span>新生号：{row.student_id}</span>
                  <span>班级：{row.class_name}</span>
                  <span>真实姓名：{row.real_name}</span>
                </div>
                <p className="prose">{row.extra_info}</p>
                <span className="queue-item__meta">{formatTime(row.created_at)}</span>
              </>
            )}
            {panel === 'invite' && (
              <span className="u-muted u-fs-sm">
                已用 {row.used_count} / {row.max_uses > 0 ? row.max_uses : '不限'}
              </span>
            )}
          </div>
          {panel === 'announce' && (
            <button
              type="button"
              className="btn btn--sm btn--danger-quiet"
              data-delete-announce={row.id}
              onClick={() => remove('删除这条公告？', `/api/admin/announcements/${row.id}`)}
            >
              删除
            </button>
          )}
          {panel === 'invite' && (
            <button
              type="button"
              className="btn btn--sm btn--danger-quiet"
              data-delete-code={row.id}
              onClick={() => remove('删除这个邀请码？', `/api/admin/invite-codes/${row.id}`)}
            >
              删除
            </button>
          )}
          {panel === 'review' && (
            <div className="queue-item__actions">
              <button
                type="button"
                className="btn btn--sm"
                data-approve={row.id}
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    path: '/api/admin/student-applications/approve',
                    method: 'PUT',
                    body: { id: row.id },
                  })
                }
              >
                通过
              </button>
              <button
                type="button"
                className="btn btn--sm"
                data-reject={row.id}
                onClick={() => setReject(row)}
              >
                拒绝
              </button>
            </div>
          )}
        </article>
      );
    })
  ) : (
    <Empty
      icon="check-circle"
      title={
        panel === 'review'
          ? '暂无待审核申请'
          : panel === 'appeals'
            ? '暂无待处理申诉'
            : panel === 'tickets'
              ? '暂无工单'
              : panel === 'invite'
                ? '暂无邀请码'
                : '暂无记录'
      }
    />
  );
  const slots: Record<string, ReactNode> = {
    adminStatus: null,
    denyBox: <Empty title="暂无管理权限" icon="lock" />,
    adminNav: groups.map(
      (group) =>
        group.items.some((key) => allowed.includes(key)) && (
          <Fragment key={group.label}>
            <span className="side-nav__group">{group.label}</span>
            {group.items
              .filter((key) => allowed.includes(key))
              .map((key) => {
                const count = counts.data?.counts[panels[key].permission || ''] || 0;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`side-nav__item${key === panel ? ' is-active' : ''}`}
                    aria-current={key === panel ? 'page' : undefined}
                    data-panel={key}
                    onClick={() => setPanel(key)}
                  >
                    <Icon name={navIcons[key]} />
                    {navLabels[key] || panels[key].label}
                    {count > 0 && <span className="side-nav__count">{count}</span>}
                  </button>
                );
              })}
          </Fragment>
        ),
    ),
    annList: panel === 'announce' ? list : null,
    reviewList: panel === 'review' ? list : null,
    appealList: panel === 'appeals' ? list : null,
    ticketList: panel === 'tickets' ? list : null,
    inviteList: panel === 'invite' ? list : null,
    userList: panel === 'users' ? <AdminUsers /> : null,
    'view-titles-mgmt': panel === 'titles-mgmt' ? <TitleManagement /> : null,
    'view-menu': panel === 'menu' ? <MenuAdmin /> : null,
    'view-menu-import': panel === 'menu-import' ? <MenuImport /> : null,
  };
  return (
    <>
      <AdminLayout bind={bind} slots={slots} />
      {reply && (
        <Dialog
          id="ticketModal"
          title={`批复工单 ${reply.title}`}
          className="dialog--sheet dialog--wide"
          onClose={() => setReply(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const v = formValues(e.currentTarget);
              try {
                const image = file
                  ? await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result));
                      reader.onerror = () => reject(new Error('图片读取失败'));
                      reader.readAsDataURL(file);
                    })
                  : '';
                action.mutate({
                  path: '/api/admin/tickets/reply',
                  method: 'PUT',
                  body: { id: reply.id, reply: v.ticketReplyInput, reply_image: image },
                });
              } catch (error) {
                toast((error as Error).message, 'error');
              }
            }}
          >
            <div className="dialog__body stack">
              <Field label="批复内容" name="ticketReplyInput" required>
                <textarea
                  className="textarea"
                  name="ticketReplyInput"
                  id="ticketReplyInput"
                  required
                />
              </Field>
              <Upload name="ticketImageInput" file={file} onChange={setFile} />
            </div>
            <div className="dialog__foot">
              <button type="button" className="btn" onClick={() => setReply(null)}>
                取消
              </button>
              <Submit id="ticketConfirm" pending={action.isPending}>
                提交批复
              </Submit>
            </div>
          </form>
        </Dialog>
      )}
      {reject && (
        <Dialog id="rejectModal" title="拒绝认证申请" onClose={() => setReject(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({
                path: '/api/admin/student-applications/reject',
                method: 'PUT',
                body: { id: reject.id, reason: formValues(e.currentTarget).rejectReasonInput },
              });
            }}
          >
            <div className="dialog__body">
              <Field label="拒绝原因（选填）" name="rejectReasonInput" maxLength={100} />
            </div>
            <div className="dialog__foot">
              <Submit id="rejectConfirm" pending={action.isPending}>
                确认拒绝
              </Submit>
            </div>
          </form>
        </Dialog>
      )}
      {confirm && (
        <Confirm
          title={confirm.title}
          message={confirm.message || '确认执行此操作？'}
          label={confirm.label}
          onClose={() => setConfirm(null)}
          onConfirm={() => action.mutate(confirm.action)}
        />
      )}
    </>
  );
}
