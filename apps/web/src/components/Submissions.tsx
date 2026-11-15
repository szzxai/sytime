import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useUrlSearch } from '../lib/useUrlSearch';
import { api, endpoint, formatTime, queryClient } from '../lib/api';
import { Empty, ErrorState, Loading, useToast } from './ui';
import { WikiMarkdown } from './WikiMarkdown';
export const reviewLabels: Record<string, string> = {
  display_id: '展示 ID',
  avatar: '头像',
  nickname: '昵称',
  signature: '个性签名',
  dish_review: '菜品评价',
  shop: '店铺推荐',
  shop_review: '店铺评价',
  appeal: '封禁申诉',
  wiki_create: 'Wiki 新建词条',
  wiki_edit: 'Wiki 修改词条',
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
          公开资料、评价、店铺与 Wiki 均在审核通过后生效。拒绝原因与结果也会送达消息箱。
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
              {r.kind.startsWith('wiki_') && r.payload && (
                <details>
                  <summary>查看提交内容</summary>
                  <p>文件夹：{String(r.payload.folder_path)}</p>
                  <p>编辑摘要：{String(r.payload.summary)}</p>
                  <WikiMarkdown source={String(r.payload.markdown || '')} />
                </details>
              )}
              {r.target_url &&
                r.status === 'approved' &&
                ['shop', 'dish_review', 'shop_review', 'wiki_create', 'wiki_edit'].includes(
                  r.kind,
                ) &&
                !r.target_url.startsWith('/profile.html') && (
                  <a href={r.target_url}>
                    {r.kind.startsWith('wiki_')
                      ? '查看词条'
                      : r.kind === 'shop'
                        ? '查看店铺'
                        : '查看评价'}
                  </a>
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
