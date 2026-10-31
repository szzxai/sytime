import { atLeast } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AdminUsers } from '../components/AdminUsers';
import { TitleManagement } from '../components/TitleManagement';
import { reviewLabels, statusLabels, type Submission } from '../components/Submissions';
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
import { api, endpoint, formatTime, formValues, queryClient } from '../lib/api';
import { RequireLogin, useSession } from '../lib/session';
import { usePanel } from '../lib/usePanel';
type Overview = {
  users: number;
  pending: number;
  tickets: number;
  reviewed_today: number;
  counts: { kind: string; count: number }[];
};
const nav = [
  { key: 'overview', label: '工作概览', icon: 'home' },
  { key: 'reviews', label: '审核中心', icon: 'shield' },
  { key: 'users', label: '用户管理', icon: 'users' },
  { key: 'tickets', label: '工单处理', icon: 'clipboard' },
  { key: 'content', label: '站点内容', icon: 'megaphone' },
  { key: 'titles', label: '头衔管理', icon: 'award' },
  { key: 'audit', label: '操作记录', icon: 'clock' },
];
export function AdminPage() {
  return (
    <RequireLogin>
      <AdminWorkspace />
    </RequireLogin>
  );
}
function AdminWorkspace() {
  const { user } = useSession();
  const [panel, setPanel] = usePanel(
    nav.map((n) => n.key),
    'overview',
  );
  const overview = useQuery({
    ...endpoint<Overview>('/api/admin/overview'),
    enabled: atLeast(user?.role, 'admin'),
  });
  if (!atLeast(user?.role, 'admin'))
    return (
      <main id="main" className="main container">
        <Empty title="暂无权限访问管理后台" description="管理后台仅向管理员与运营者开放。" />
      </main>
    );
  return (
    <main id="main" className="admin-workspace">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>拾光酥糕</strong>
            <small>管理工作台</small>
          </div>
        </div>
        <span className="admin-nav-label">管理空间</span>
        <nav aria-label="后台管理导航">
          {nav.map((n) => (
            <button
              key={n.key}
              aria-label={n.label}
              type="button"
              className={panel === n.key ? 'is-active' : ''}
              aria-current={panel === n.key ? 'page' : undefined}
              onClick={() => setPanel(n.key)}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.key === 'reviews' && !!overview.data?.pending && <b>{overview.data.pending}</b>}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__foot">
          <span className="admin-online" />{' '}
          {user?.role === 'operator' ? '运营者工作空间' : '管理员工作空间'}
          <small>所有管理操作均留有记录</small>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <p>工作空间 / {nav.find((n) => n.key === panel)?.label}</p>
            <h1>{nav.find((n) => n.key === panel)?.label}</h1>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => queryClient.invalidateQueries()}
          >
            <Icon name="refresh" />
            刷新数据
          </button>
        </header>
        <div className="admin-body">
          {panel === 'overview' ? (
            <OverviewPanel query={overview} open={setPanel} />
          ) : panel === 'reviews' ? (
            <Reviews />
          ) : panel === 'users' ? (
            <AdminUsers />
          ) : panel === 'tickets' ? (
            <Tickets />
          ) : panel === 'content' ? (
            <Content />
          ) : panel === 'titles' ? (
            <TitleManagement />
          ) : (
            <Audit />
          )}
        </div>
      </div>
    </main>
  );
}
function OverviewPanel({
  query,
  open,
}: {
  query: { data?: Overview; isPending: boolean; error: Error | null; refetch: () => unknown };
  open: (key: string) => void;
}) {
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  const d = query.data!;
  return (
    <>
      <div className="admin-welcome">
        <span className="admin-eyebrow">MODERATION & COMMUNITY</span>
        <h2>让每一次分享，都值得信赖。</h2>
        <p>在这里审核内容、处理反馈，并维护校园社区的账号安全。</p>
        <button className="btn btn--primary" onClick={() => open('reviews')}>
          前往审核中心 <Icon name="arrow-right" />
        </button>
      </div>
      <div className="admin-metrics">
        {[
          { label: '待审核申请', value: d.pending, icon: 'shield', key: 'reviews' },
          { label: '待处理工单', value: d.tickets, icon: 'clipboard', key: 'tickets' },
          { label: '今日已处理', value: d.reviewed_today, icon: 'check', key: 'audit' },
          { label: '社区账号', value: d.users, icon: 'users', key: 'users' },
        ].map((m) => (
          <button className="admin-metric" key={m.label} onClick={() => open(m.key)}>
            <span>
              {m.label}
              <Icon name={m.icon} />
            </span>
            <strong>{m.value}</strong>
            <small>
              查看详情 <Icon name="arrow-right" />
            </small>
          </button>
        ))}
      </div>
      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>待办分布</h2>
          <span>先审核，后发布</span>
        </div>
        <div className="admin-queue-grid">
          {Object.entries(reviewLabels).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => {
                location.hash = 'reviews';
                open('reviews');
              }}
            >
              <span>{label}</span>
              <strong>{d.counts.find((r) => r.kind === kind)?.count || 0}</strong>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
function useAction() {
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => api(path, { method, body }),
    onSuccess: () => {
      toast('操作已完成');
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
}
function Reviews() {
  const { user } = useSession();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(
    () => Number(new URLSearchParams(location.search).get('request')) || null,
  );
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const query = useQuery(
    endpoint<{ requests: Submission[]; total: number }>(
      `/api/admin/reviews?status=${status}&kind=${kind}&offset=${page * 20}`,
    ),
  );
  const detail = useQuery({
    ...endpoint<{ request: Submission }>(`/api/admin/reviews/${selected}`),
    enabled: selected !== null,
  });
  const action = useAction();
  const request = detail.data?.request;
  const decision = (value: 'approve' | 'reject') =>
    action.mutate(
      { path: `/api/admin/reviews/${selected}/decision`, body: { decision: value, reason } },
      {
        onSuccess: () => {
          setSelected(null);
          setConfirm(null);
          setReason('');
        },
      },
    );
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <div>
          <h2>统一审核队列</h2>
          <p>资料、学生身份、内容与申诉在此处理；不能审核自己的申请。</p>
        </div>
        <strong>{query.data?.total || 0} 项</strong>
      </div>
      <div className="admin-toolbar">
        <label>
          类型
          <select
            className="select"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="">全部类型</option>
            {Object.entries(reviewLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select
            className="select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data?.requests.length ? (
        <div className="admin-table-wrap" tabIndex={0} role="region" aria-label="数据表格">
          <table className="admin-table">
            <thead>
              <tr>
                {['申请', '申请人', '提交时间', '状态', '操作'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{reviewLabels[r.kind]}</strong>
                    <small>#{r.id}</small>
                  </td>
                  <td>{r.username}</td>
                  <td>{formatTime(r.created_at)}</td>
                  <td>
                    <span className={`review-status review-status--${r.status}`}>
                      {statusLabels[r.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        setSelected(r.id);
                        setReason('');
                      }}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="当前没有申请" description="新的申请会出现在这里。" />
      )}
      <Pagination page={page} total={query.data?.total || 0} setPage={setPage} />
      {selected !== null && (
        <Dialog
          className={confirm ? 'dialog--confirm' : 'dialog--wide'}
          id="reviewDetail"
          title={confirm ? (confirm === 'approve' ? '确认通过申请' : '确认不通过') : '审核申请'}
          onClose={() => {
            if (action.isPending) return;
            if (confirm) setConfirm(null);
            else setSelected(null);
          }}
        >
          {confirm ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!action.isPending) decision(confirm);
              }}
            >
              <div className="dialog__body stack">
                <p>
                  {reviewLabels[request?.kind || '']} #{selected} · {request?.username}
                </p>
                <p>
                  {confirm === 'approve'
                    ? '通过后申请立即生效，并向申请人发送结果通知。'
                    : '申请将不予发布，并向申请人发送以下原因。'}
                </p>
                {reason && <p className="callout prose">{reason}</p>}
                {action.error && (
                  <p role="alert" className="field__error">
                    {action.error.message}
                  </p>
                )}
              </div>
              <div className="dialog__foot">
                <button
                  type="button"
                  className="btn"
                  disabled={action.isPending}
                  autoFocus
                  onClick={() => setConfirm(null)}
                >
                  返回检查
                </button>
                <button
                  type="submit"
                  className={`btn btn--${confirm === 'approve' ? 'primary' : 'danger'}`}
                  disabled={action.isPending}
                >
                  {action.isPending ? '处理中…' : confirm === 'approve' ? '确认通过' : '确认不通过'}
                </button>
              </div>
            </form>
          ) : (
            <div className="dialog__body stack">
              {detail.isPending ? (
                <Loading />
              ) : detail.error ? (
                <ErrorState error={detail.error} retry={detail.refetch} />
              ) : (
                request && (
                  <>
                    <div className="row">
                      <strong>
                        {reviewLabels[request.kind]} #{request.id}
                      </strong>
                      <span className={`review-status review-status--${request.status}`}>
                        {statusLabels[request.status]}
                      </span>
                    </div>
                    <p>
                      {request.username} · {formatTime(request.created_at)}
                    </p>
                    <Payload payload={request.payload} />
                    {request.reason && <p className="callout">处理说明：{request.reason}</p>}
                    {request.reviewed_at && (
                      <p className="u-muted">
                        处理时间：{formatTime(request.reviewed_at)} · 审核人 #{request.reviewer_id}
                      </p>
                    )}
                    {request.status === 'pending' && (
                      <>
                        <Field label="处理说明（拒绝时必填）">
                          <textarea
                            className="textarea"
                            maxLength={500}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </Field>
                        <p className="field__hint">
                          结果会通知申请人。学生认证通过后，同学号的其他申请将自动拒绝。
                        </p>
                        <div className="row">
                          <button
                            className="btn"
                            disabled={
                              action.isPending || !reason.trim() || request.user_id === user?.id
                            }
                            onClick={() => setConfirm('reject')}
                          >
                            拒绝申请
                          </button>
                          <button
                            className="btn btn--primary"
                            disabled={action.isPending || request.user_id === user?.id}
                            onClick={() => setConfirm('approve')}
                          >
                            审核通过
                          </button>
                        </div>
                        {request.user_id === user?.id && (
                          <p className="field__error">请由其他管理员处理你的申请。</p>
                        )}
                      </>
                    )}
                  </>
                )
              )}
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}
const fields: Record<string, string> = {
  student_id: '学号',
  class_name: '班级',
  real_name: '真实姓名',
  extra_info: '补充信息',
  value: '申请内容',
  name: '名称',
  dish_id: '菜品编号',
  shop_id: '店铺编号',
  rating: '评分',
  comment: '评论',
  content: '评论',
  appeal_reason: '申诉理由',
  address: '地址',
  location_note: '位置说明',
  dianping_url: '点评链接',
  type: '店铺类型',
  lat: '纬度',
  lng: '经度',
  campus_distance_m: '距学校 / 米',
  campus_walk_min: '步行 / 分钟',
  metro_station: '地铁站',
  metro_exit: '出口',
  metro_distance_m: '距地铁 / 米',
  metro_walk_min: '步行 / 分钟',
  guests: '就餐人数',
  total_price: '总价',
};
function Payload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <>
      <dl className="admin-detail">
        {Object.entries(payload)
          .filter(([key, value]) => !['image_data', 'image_url'].includes(key) && value != null)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{fields[k] || k}</dt>
              <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
      </dl>
      {!!(payload.image_data || payload.image_url) && (
        <img
          className="admin-review-image"
          src={String(payload.image_data || payload.image_url)}
          alt="待审核图片"
        />
      )}
    </>
  );
}
export function Pagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (value: number) => void;
}) {
  return total > 20 ? (
    <div className="admin-pagination">
      <span>
        共 {total} 项 · 第 {page + 1} 页
      </span>
      <button className="btn btn--sm" disabled={!page} onClick={() => setPage(page - 1)}>
        上一页
      </button>
      <button
        className="btn btn--sm"
        disabled={(page + 1) * 20 >= total}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
    </div>
  ) : null;
}
function Tickets() {
  const query = useQuery(
    endpoint<{
      tickets: {
        id: number;
        title: string;
        content: string;
        username: string;
        status: string;
        reply_content: string;
        visibility: string;
      }[];
    }>('/api/admin/tickets'),
  );
  const action = useAction();
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <h2>用户反馈</h2>
        <p>仅显示当前角色可见的工单。</p>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data?.tickets.length ? (
        query.data.tickets.map((t) => (
          <article className="admin-ticket" key={t.id}>
            <div className="row">
              <h3>{t.title}</h3>
              <span className="review-status">{t.status === 'pending' ? '待回复' : '已回复'}</span>
            </div>
            <p className="u-muted">
              #{t.id} · {t.username} · {t.visibility === 'operator' ? '仅运营者' : '管理员可见'}
            </p>
            <p className="prose">{t.content}</p>
            {t.reply_content ? (
              <blockquote>{t.reply_content}</blockquote>
            ) : (
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  action.mutate({
                    path: '/api/admin/tickets/reply',
                    method: 'PUT',
                    body: { id: t.id, reply: formValues(e.currentTarget).reply },
                  });
                }}
              >
                <Field label="回复内容">
                  <textarea name="reply" className="textarea" required maxLength={2000} />
                </Field>
                <Submit pending={action.isPending}>回复并通知用户</Submit>
              </form>
            )}
          </article>
        ))
      ) : (
        <Empty title="暂无工单" />
      )}
    </section>
  );
}
function Content() {
  const action = useAction();
  const banner = useQuery(endpoint<{ banner: string }>('/api/settings/banner'));
  const news = useQuery(
    endpoint<{ announcements: { id: number; title: string }[] }>('/api/announcements'),
  );
  const [deleting, setDeleting] = useState<number | null>(null);
  function form(title: string, path: string, children: ReactNode, method = 'POST') {
    return (
      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>{title}</h2>
        </div>
        <form
          className="form admin-content-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            action.mutate({ path, method, body: formValues(f) }, { onSuccess: () => f.reset() });
          }}
        >
          {children}
          <Submit pending={action.isPending}>确认发布</Submit>
        </form>
      </section>
    );
  }
  return (
    <div className="stack stack--lg">
      {form(
        '站点横幅',
        '/api/admin/settings/banner',
        <Field label="横幅内容（留空取消）">
          <textarea
            key={banner.data?.banner}
            className="textarea"
            name="value"
            defaultValue={banner.data?.banner}
            maxLength={500}
          />
        </Field>,
        'PUT',
      )}
      {form(
        '发布公告',
        '/api/admin/announcements',
        <>
          <Field label="公告标题">
            <input className="input" name="title" required maxLength={100} />
          </Field>
          <Field label="公告正文">
            <textarea className="textarea" name="content" required maxLength={5000} />
          </Field>
        </>,
      )}
      {form(
        '全站系统通知',
        '/api/admin/notifications',
        <>
          <Field label="通知标题">
            <input className="input" name="title" required maxLength={100} />
          </Field>
          <Field label="通知内容">
            <textarea className="textarea" name="body" required maxLength={2000} />
          </Field>
        </>,
      )}
      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>已发布公告</h2>
        </div>
        {news.isPending ? (
          <Loading />
        ) : news.error ? (
          <ErrorState error={news.error} retry={news.refetch} />
        ) : (
          news.data?.announcements.map((n) => (
            <div className="submission-row" key={n.id}>
              <strong>{n.title}</strong>
              <button className="btn btn--sm" onClick={() => setDeleting(n.id)}>
                删除
              </button>
            </div>
          ))
        )}
      </section>
      {deleting !== null && (
        <Confirm
          message="删除后无法恢复。"
          title="删除这条公告？"
          pending={action.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            action.mutate(
              { path: `/api/admin/announcements/${deleting}`, method: 'DELETE' },
              { onSuccess: () => setDeleting(null) },
            )
          }
        />
      )}
    </div>
  );
}
function Audit() {
  const [page, setPage] = useState(0);
  const query = useQuery(
    endpoint<{
      events: {
        id: number;
        actor_name: string;
        target_name: string;
        action: string;
        created_at: number;
        detail: string;
      }[];
      total: number;
    }>(`/api/admin/audit?offset=${page * 20}`),
  );
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <h2>可追溯的管理记录</h2>
        <span>按时间倒序</span>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <div className="admin-table-wrap" tabIndex={0} role="region" aria-label="数据表格">
          <table className="admin-table">
            <thead>
              <tr>
                {['时间', '操作者', '动作', '对象', '详情'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data?.events.map((e) => (
                <tr key={e.id}>
                  <td>{formatTime(e.created_at)}</td>
                  <td>{e.actor_name || '系统'}</td>
                  <td>{e.action}</td>
                  <td>{e.target_name || '—'}</td>
                  <td>
                    <code>{e.detail}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={query.data?.total || 0} setPage={setPage} />
    </section>
  );
}
