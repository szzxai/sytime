import { SiteLink } from './SiteLink';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, endpoint, formValues, queryClient } from '../lib/api';
import { Picture } from './Media';
import { Confirm, Dialog, Empty, ErrorState, Field, Loading, Submit, useToast } from './ui';
type Settings = {
  revision: number;
  provider: string;
  base_url: string;
  model: string;
  daily_time: string;
  schedule_mode: string;
  enabled: boolean;
  has_api_key: boolean;
  masked_api_key: string;
  model_tested: boolean;
  active_job_id: string | null;
  next_run_at: string | null;
  last_test?: { message: string };
};
type Job = {
  id: string;
  trigger: string;
  status: string;
  phase: string;
  created_at: number;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  error: string;
  items?: {
    source_id: string;
    article_id: number;
    title: string;
    status: string;
    phase: string;
    records_count: number;
    error: string;
  }[];
};
const base = '/api/admin/menu-sync';
const labels: Record<string, string> = {
  running: '运行中',
  succeeded: '已完成',
  partial: '部分失败',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  unchanged: '内容未变',
  queued: '排队',
  discover: '检索官网',
  fetch: '获取原图',
  layout: '定位表格',
  recognize: '识别菜品',
  audit: '复核覆盖',
  validate: '校验数据',
  done: '结束',
};
const label = (s: string) => labels[s] || s;
const date = (n: number | string | null) =>
  n
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(n))
    : '未安排';
export function MenuAdmin() {
  const toast = useToast();
  const [detail, setDetail] = useState<string | null>(null);
  const [clear, setClear] = useState(false);
  const query = useQuery({
    ...endpoint<{ settings: Settings; jobs: Job[] }>(base + '/jobs'),
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === 'running') ? 4000 : false),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => api(base + path, { method, body }),
    onSuccess: () => {
      toast('操作成功');
      queryClient.invalidateQueries({ queryKey: [base + '/jobs'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  const s = query.data.settings;
  return (
    <div className="stack stack--md">
      <form
        id="menuSettingsForm"
        key={s.revision}
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          action.mutate({
            path: '/settings',
            method: 'PUT',
            body: {
              revision: s.revision,
              provider: v.menuProvider,
              base_url: v.menuBase,
              model: v.menuModel,
              api_key: v.menuKey,
              daily_time: v.menuDailyTime,
              schedule_mode: v.menuScheduleMode,
              enabled: new FormData(e.currentTarget).has('menuEnabled'),
            },
          });
          (e.currentTarget.elements.namedItem('menuKey') as HTMLInputElement).value = '';
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">菜单同步设置</h2>
        </div>
        <div className="panel__body stack">
          <Field label="提供商" name="menuProvider">
            <select
              className="select"
              id="menuProvider"
              name="menuProvider"
              defaultValue={s.provider}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
              <option value="compatible">OpenAI 兼容接口</option>
            </select>
          </Field>
          <Field label="API Base URL" name="menuBase" defaultValue={s.base_url} type="url" />
          <Field label="视觉模型 ID" name="menuModel" defaultValue={s.model} />
          <Field label="自动检查计划" name="menuScheduleMode">
            <select
              id="menuScheduleMode"
              name="menuScheduleMode"
              className="select"
              defaultValue={s.schedule_mode}
            >
              <option value="weekend">周末每小时检查，周一补查</option>
              <option value="daily">每天一次</option>
            </select>
          </Field>
          <Field label="API Key" name="menuKey" type="password" />
          <p className="field__hint" id="menuKeyHint">
            {s.has_api_key ? `已保存 ${s.masked_api_key}；留空保留。` : '尚未保存 Key。'}
          </p>
          <Field
            label="每日同步时间（北京时间）"
            name="menuDailyTime"
            type="time"
            defaultValue={s.daily_time}
            required
          />
          <label className="check-row">
            <input
              type="checkbox"
              className="check"
              id="menuEnabled"
              name="menuEnabled"
              defaultChecked={s.enabled}
            />
            <span>开启无人值守自动同步</span>
          </label>
          <p id="menuSchedule">
            {s.schedule_mode === 'weekend'
              ? '周六、周日 08:00–22:00 每小时；周一 08:00、12:00 补查'
              : `每日 ${s.daily_time}`}
            （北京时间） · 下一次自动同步：{date(s.next_run_at)}
          </p>
          <p id="menuConfigStatus" role="status">
            {s.last_test?.message || '尚未测试模型配置'}
          </p>
        </div>
        <div className="panel__foot row row--wrap">
          <button
            className="btn btn--danger-quiet"
            type="button"
            id="menuDeleteKey"
            disabled={!s.has_api_key}
            onClick={() => setClear(true)}
          >
            删除 Key
          </button>
          <button
            className="btn"
            type="button"
            id="menuTest"
            disabled={action.isPending}
            onClick={() => action.mutate({ path: '/test' })}
          >
            测试已保存配置
          </button>
          <Submit id="menuSave" pending={action.isPending}>
            保存设置
          </Submit>
        </div>
      </form>
      <div className="panel">
        <div className="panel__head row row--between row--wrap">
          <h2 className="panel__title">同步任务</h2>
          <div className="row row--sm">
            <button type="button" className="btn" id="menuRefresh" onClick={() => query.refetch()}>
              刷新
            </button>
            <button
              type="button"
              className="btn btn--primary"
              id="menuSync"
              disabled={!!s.active_job_id || !s.model_tested || action.isPending}
              onClick={() => action.mutate({ path: '/jobs', body: {} })}
            >
              立即同步
            </button>
          </div>
        </div>
        <div className="panel__body stack" id="menuJobs">
          {query.data.jobs.length ? (
            query.data.jobs.map((j) => (
              <article className="card stack menu-job__meta" key={j.id}>
                <div className="row row--between row--wrap">
                  <h3 className="u-fs-base">
                    {j.trigger === 'automatic' ? '自动同步' : '手动同步'} · {date(j.created_at)}
                  </h3>
                  <span className="badge">{label(j.status)}</span>
                </div>
                <p className="u-muted u-fs-sm">
                  {label(j.phase)} · 已检查 {j.processed}/{j.total} 篇 · 成功 {j.succeeded} · 失败{' '}
                  {j.failed}
                </p>
                {j.error && <p>{j.error}</p>}
                <div className="row row--wrap">
                  <button
                    type="button"
                    className="btn btn--sm"
                    data-menu-detail={j.id}
                    onClick={() => setDetail(j.id)}
                  >
                    查看详情
                  </button>
                  {j.status === 'running' ? (
                    <button
                      type="button"
                      className="btn btn--sm btn--danger-quiet"
                      onClick={() => action.mutate({ path: `/jobs/${j.id}/cancel` })}
                    >
                      停止任务
                    </button>
                  ) : (
                    j.status !== 'succeeded' && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => action.mutate({ path: `/jobs/${j.id}/retry` })}
                      >
                        重试失败菜单
                      </button>
                    )
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty title="尚无同步任务" description="保存并测试模型配置后可立即同步。" />
          )}
        </div>
      </div>
      {detail && <MenuJob id={detail} onClose={() => setDetail(null)} />}
      {clear && (
        <Confirm
          title="删除菜单 API Key？"
          message="删除后自动同步关闭，正在运行的任务和配置测试会停止。"
          onClose={() => setClear(false)}
          onConfirm={() =>
            action.mutate({
              path: '/settings',
              method: 'PUT',
              body: { revision: s.revision, clear_api_key: true, enabled: false },
            })
          }
        />
      )}
    </div>
  );
}
function MenuJob({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const query = useQuery({
    ...endpoint<{ job: Job }>(`${base}/jobs/${id}`),
    refetchInterval: (q) => (q.state.data?.job.status === 'running' ? 4000 : false),
  });
  const [images, setImages] = useState<Record<string, string[]>>({});
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);
  async function artifact(source: string, kind: string) {
    const url = `${base}/jobs/${id}/artifacts/${kind}?source_id=${encodeURIComponent(source)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('资料尚未生成或无权访问');
    return response;
  }
  async function showImages(source: string) {
    try {
      const info = await (await artifact(source, 'source')).json();
      const values: string[] = [];
      for (let i = 0; i < info.image_count; i++) {
        const response = await artifact(source, `image-${i}`);
        const blob = await response.blob();
        const src = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
        values.push(src);
      }
      setImages((old) => ({ ...old, [source]: values }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function download(source: string, kind: string) {
    try {
      const response = await artifact(source, kind);
      const url = URL.createObjectURL(await response.blob());
      urls.current.push(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = source.replace(/:/g, '-') + `-${kind}.json`;
      a.click();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function supplement(e: FormEvent<HTMLFormElement>, source: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set('source_id', source);
    try {
      await api(base + '/jobs', { method: 'POST', body: form });
      toast('补充图片已保存，正在重新识别');
      queryClient.invalidateQueries();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <Dialog
      id="menuJobDialog"
      title="菜单任务详情"
      className="dialog--sheet dialog--wide"
      onClose={onClose}
    >
      <div className="dialog__body stack" id="menuJobDetail">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          query.data.job.items?.map((item) => (
            <section key={item.source_id} className="card stack menu-job__meta">
              <h3>{item.title}</h3>
              <p>
                {label(item.status)} · {label(item.phase)} · {item.records_count} 条
              </p>
              {item.error && <p>{item.error}</p>}
              <div className="row row--wrap">
                <button
                  type="button"
                  className="btn btn--sm"
                  data-menu-file="source"
                  onClick={() => showImages(item.source_id)}
                >
                  查看原图
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => download(item.source_id, 'menu')}
                >
                  下载 JSON
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  data-menu-file="diagnostic"
                  onClick={() => download(item.source_id, 'diagnostic')}
                >
                  下载诊断
                </button>
                <SiteLink
                  className="btn btn--sm"
                  href={`/admin.html#menu-import`}
                  onClick={() => {
                    sessionStorage.setItem(
                      'menuImportTarget',
                      JSON.stringify({ source: item.source_id, job: id }),
                    );
                    onClose();
                  }}
                >
                  编辑 JSON 并手动发布
                </SiteLink>
              </div>
              <div className="menu-images" data-images>
                {images[item.source_id]?.map((src, i) => (
                  <Picture
                    src={src}
                    caption={`菜单原图 ${i + 1}`}
                    key={i}
                    className="thumb u-w-full"
                  />
                ))}
              </div>
              {['failed', 'cancelled', 'interrupted'].includes(item.status) &&
                query.data.job.status !== 'running' && (
                  <form onSubmit={(e) => supplement(e, item.source_id)}>
                    <label className="field">
                      补充该篇全部菜单图片
                      <input
                        type="file"
                        className="input"
                        name="images"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        required
                      />
                    </label>
                    <button type="submit" className="btn btn--sm">
                      补充图片并重试
                    </button>
                  </form>
                )}
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}
