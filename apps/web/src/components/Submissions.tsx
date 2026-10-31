import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useUrlSearch } from '../lib/useUrlSearch';
import { api, endpoint, formatTime, formValues, queryClient } from '../lib/api';
import { Empty, ErrorState, Field, Loading, Submit, useToast } from './ui';
export const reviewLabels: Record<string, string> = {
  student: '学生认证',
  display_id: '展示 ID',
  avatar: '头像',
  nickname: '昵称',
  signature: '个性签名',
  dish_review: '菜品评价',
  shop: '店铺推荐',
  shop_review: '店铺评价',
  appeal: '封禁申诉',
};
export const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
  withdrawn: '已撤回',
};
export type Submission = {
  id: number;
  kind: string;
  status: string;
  reason: string;
  summary?: string;
  target_url?: string;
  user_id: number;
  username: string;
  created_at: number;
  reviewed_at?: number;
  reviewer_id?: number;
  published_id?: number;
  payload: Record<string, unknown>;
};
export function SubmissionHistory() {
  const [page, setPage] = useState(0);
  const [search, updateSearch] = useUrlSearch();
  const focused = Number(search.submission) || null;
  const query = useQuery(
    endpoint<{ requests: Submission[]; total: number }>(
      `/api/user/submissions?offset=${focused ? 0 : page * 20}${focused ? `&id=${focused}` : ''}`,
    ),
  );
  const toast = useToast();
  const withdraw = useMutation({
    mutationFn: (id: number) => api(`/api/user/submissions/${id}/withdraw`, { method: 'POST' }),
    onSuccess: () => {
      toast('已撤回');
      queryClient.invalidateQueries();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <section className="card stack" aria-label="我的申请">
      <div>
        <h2 className="section__title">{focused ? '申请详情' : '我的申请'}</h2>
        {focused && (
          <button className="btn btn--link" onClick={() => updateSearch({ submission: undefined })}>
            查看全部申请
          </button>
        )}
        <p className="u-muted">
          公开资料、评价与店铺均在审核通过后生效。拒绝原因与结果也会送达消息箱。
        </p>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data?.requests.length ? (
        query.data.requests.map((r) => (
          <article
            key={r.id}
            id={`submission-${r.id}`}
            className={`submission-row${focused === r.id ? ' is-highlighted' : ''}`}
          >
            <div>
              <strong>
                {reviewLabels[r.kind]} <small>#{r.id}</small>
              </strong>
              <p className="u-muted">{formatTime(r.created_at)}</p>
              {r.summary && <p className={focused ? 'prose' : 'submission-summary'}>{r.summary}</p>}
              {r.reason && <p>{r.reason}</p>}
              {r.target_url &&
                r.status === 'approved' &&
                ['shop', 'dish_review', 'shop_review'].includes(r.kind) &&
                !r.target_url.startsWith('/profile.html') && (
                  <a href={r.target_url}>{r.kind === 'shop' ? '查看店铺' : '查看评价'}</a>
                )}
            </div>
            <span className={`review-status review-status--${r.status}`}>
              {statusLabels[r.status]}
            </span>
            {r.status === 'pending' && (
              <button
                type="button"
                className="btn btn--sm"
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate(r.id)}
              >
                撤回
              </button>
            )}
          </article>
        ))
      ) : (
        <Empty title="暂无申请" />
      )}
      {!!query.data && query.data.total > 20 && (
        <div className="row">
          <button className="btn btn--sm" disabled={!page} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span>
            {page + 1} / {Math.ceil(query.data.total / 20)}
          </span>
          <button
            className="btn btn--sm"
            disabled={(page + 1) * 20 >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
export function StudentIdentity() {
  const binding = useQuery(
    endpoint<{ binding: { student_id: string; real_name: string; class_name: string } | null }>(
      '/api/student/binding',
    ),
  );
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(path, { method: 'POST', body }),
    onSuccess: (_data, variables) => {
      if (variables.path.endsWith('/unbind')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.assign('/login.html');
      } else {
        toast('学生认证已提交，请等待审核');
        queryClient.invalidateQueries();
      }
    },
    onError: (e) => toast(e.message, 'error'),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate({ path: '/api/student/apply', body: formValues(e.currentTarget) });
  }
  return (
    <main id="main" className="main container student-identity stack stack--lg">
      <div className="page-head">
        <h1>学生身份</h1>
        <p className="u-muted">一个学号只能绑定一个账号，所有认证由管理员人工核验。</p>
      </div>
      {binding.isPending ? (
        <Loading />
      ) : binding.error ? (
        <ErrorState error={binding.error} retry={binding.refetch} />
      ) : binding.data?.binding ? (
        <section className="card stack">
          <h2>已绑定学生身份</h2>
          <p>
            {binding.data.binding.student_id} · {binding.data.binding.class_name} ·{' '}
            {binding.data.binding.real_name}
          </p>
          <p className="callout">
            解绑会释放学号、撤回待审评价与推荐，并退出所有设备。学生账号将恢复为普通用户。
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ path: '/api/student/unbind', body: formValues(e.currentTarget) });
            }}
          >
            <Field label="输入当前密码以确认解绑">
              <input
                className="input"
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Submit pending={mutation.isPending}>确认解绑学生身份</Submit>
          </form>
        </section>
      ) : (
        <section className="card">
          <form className="form" onSubmit={submit}>
            <Field label="学号 / 新生号">
              <input className="input" name="student_id" required maxLength={32} />
            </Field>
            <Field label="班级">
              <input className="input" name="class_name" required maxLength={40} />
            </Field>
            <Field label="真实姓名">
              <input className="input" name="real_name" required maxLength={40} />
            </Field>
            <Field label="补充信息（选填）">
              <textarea className="textarea" name="extra_info" maxLength={500} />
            </Field>
            <p className="field__hint">
              待审核不占用学号；一份申请通过后，同学号的其他申请会自动拒绝。10 分钟内只能提交一次。
            </p>
            <Submit pending={mutation.isPending}>提交学生认证</Submit>
          </form>
        </section>
      )}
      <SubmissionHistory />
    </main>
  );
}
