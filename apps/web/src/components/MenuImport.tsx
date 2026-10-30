import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, endpoint, queryClient } from '../lib/api';
import { Picture } from './Media';
import { Confirm, Empty, ErrorState, Field, Loading, Submit, useToast } from './ui';

type Source = {
  id: string;
  title: string;
  kind: string;
  article_id: number;
  records_count: number;
  revision: number;
};
type ImportData = {
  sources: Source[];
  jobs: { id: string; status: string; created_at: string; sources: { id: string }[] }[];
  history: {
    id: string;
    title: string;
    created_at: string;
    actor_id: number;
    records_count: number;
    revision: number;
  }[];
};
type Loaded = { source: Source; records: unknown[]; warning: string; image_count: number };
type Preview = {
  records: unknown[];
  count: number;
  dish_count: number;
  duplicates_removed: number;
  digest: string;
};
const base = '/api/admin/menu-sync';
const changed = '内容或目标已变更，请重新校验。';
const date = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
const statuses: Record<string, string> = {
  succeeded: '已完成',
  partial: '部分失败',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

export function MenuImport() {
  const toast = useToast();
  const query = useQuery(endpoint<ImportData>(base + '/imports'));
  const [target] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('menuImportTarget') || 'null') as {
        source: string;
        job: string;
      } | null;
    } catch {
      return null;
    }
  });
  const [source, setSource] = useState(target?.source || '');
  const [job, setJob] = useState(target?.job || '');
  const [title, setTitle] = useState('');
  const [json, setJson] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  const [validated, setValidated] = useState<Preview | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [status, setStatus] = useState(changed);
  const [warning, setWarning] = useState('');
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const serial = useRef(0);
  const urls = useRef<string[]>([]);
  const initialized = useRef(false);
  const body = () => ({
    json_text: json,
    source_id: source || null,
    title,
    expected_revision: revision,
    job_id: job || null,
  });
  function invalidate() {
    serial.current++;
    setValidated(null);
    setReviewed(false);
    setStatus(changed);
  }
  function clearImages() {
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setImages([]);
  }
  useEffect(
    () => () => {
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const preview = useMutation({
    mutationFn: async () => {
      const version = ++serial.current;
      const result = await api<Preview>(base + '/imports/preview', {
        method: 'POST',
        body: body(),
      });
      return { version, result };
    },
    onSuccess: ({ version, result }) => {
      if (version !== serial.current) return;
      setValidated(result);
      setJson(JSON.stringify(result.records, null, 2));
      setStatus(
        `校验通过：${result.count} 条供应记录、${result.dish_count} 道菜；去除 ${result.duplicates_removed} 条完全重复记录。确认核对后可发布。`,
      );
    },
    onError: (e) => {
      invalidate();
      setStatus(e.message);
      toast(e.message, 'error');
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      api<{ import: { source_id: string; count: number; revision: number } }>(base + '/imports', {
        method: 'POST',
        body: { ...body(), digest: validated?.digest, reviewed: true },
      }),
    onSuccess: (result) => {
      toast('菜单已发布');
      invalidate();
      setSource(result.import.source_id);
      setRevision(result.import.revision);
      setJob('');
      setJson('');
      clearImages();
      setStatus(`已发布 ${result.import.count} 条供应记录。`);
      queryClient.invalidateQueries();
    },
    onError: (e) => {
      invalidate();
      setStatus(e.message);
      toast(e.message, 'error');
    },
  });
  const load = useMutation({
    mutationFn: async () => {
      const version = ++serial.current;
      const result = await api<Loaded>(
        `${base}/imports/source?source_id=${encodeURIComponent(source)}${job ? `&job_id=${encodeURIComponent(job)}` : ''}`,
      );
      return { version, result };
    },
    onSuccess: ({ version, result }) => {
      if (version !== serial.current) return;
      setRevision(result.source.revision);
      setJson(JSON.stringify(result.records, null, 2));
      invalidate();
      setWarning(result.warning || '已载入 JSON。发布会替换该来源的全部记录。');
      setStatus(`已载入 ${result.records.length} 条，请修改并重新校验。`);
      sessionStorage.removeItem('menuImportTarget');
    },
    onError: (e) => {
      setStatus(e.message);
      toast(e.message, 'error');
    },
  });
  useEffect(() => {
    if (!target || !query.data || initialized.current) return;
    initialized.current = true;
    load.mutate();
  }, [target, query.data, load]);
  const imageLoad = useMutation({
    mutationFn: async () => {
      const version = serial.current;
      const path = `${base}/jobs/${encodeURIComponent(job)}/artifacts/`;
      const search = `?source_id=${encodeURIComponent(source)}`;
      const metadata = await api<{ image_count: number }>(path + 'source' + search);
      const images: string[] = [];
      try {
        for (let i = 0; i < metadata.image_count; i++) {
          const response = await fetch(path + `image-${i}` + search, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          if (!response.ok) throw new Error('原图尚未保存或无权访问');
          images.push(URL.createObjectURL(await response.blob()));
        }
        return { version, images };
      } catch (error) {
        images.forEach(URL.revokeObjectURL);
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result.version !== serial.current) {
        result.images.forEach(URL.revokeObjectURL);
        return;
      }
      clearImages();
      urls.current = result.images;
      setImages(result.images);
      if (!result.images.length) toast('该任务没有原图存档。', 'info');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  const busy = publish.isPending;
  return (
    <div className="stack stack--md">
      <form
        className="panel"
        id="menuImportForm"
        onSubmit={(e) => {
          e.preventDefault();
          if (validated && reviewed) publish.mutate();
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">手动导入菜单</h2>
        </div>
        <fieldset
          className="panel__body stack"
          disabled={busy}
          style={{ border: 0, minWidth: 0, margin: 0 }}
        >
          <Field label="导入目标" name="menuImportSource">
            <select
              className="select"
              id="menuImportSource"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setRevision(
                  query.data.sources.find((s) => s.id === e.target.value)?.revision ?? null,
                );
                setJob('');
                setWarning('');
                clearImages();
                invalidate();
              }}
            >
              <option value="">新建手动批次</option>
              {query.data.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {s.kind === 'manual' ? '手动批次' : s.article_id} · {s.records_count}{' '}
                  条
                </option>
              ))}
            </select>
          </Field>
          <div id="menuImportTitleField" hidden={!!source}>
            <Field label="批次标题" name="menuImportTitle">
              <input
                className="input"
                id="menuImportTitle"
                value={title}
                maxLength={300}
                onChange={(e) => {
                  setTitle(e.target.value);
                  invalidate();
                }}
              />
            </Field>
          </div>
          <div id="menuImportJobField" hidden={!source}>
            <Field label="JSON 来源" name="menuImportJob">
              <select
                className="select"
                id="menuImportJob"
                value={job}
                onChange={(e) => {
                  setJob(e.target.value);
                  setWarning('');
                  clearImages();
                  invalidate();
                }}
              >
                <option value="">已发布 JSON</option>
                {query.data.jobs
                  .filter((j) => j.status !== 'running' && j.sources.some((s) => s.id === source))
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      识图任务 · {date(j.created_at)} · {statuses[j.status] || j.status}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              id="menuImportLoad"
              hidden={!source}
              disabled={load.isPending}
              onClick={() => (json.trim() ? setConfirmLoad(true) : load.mutate())}
            >
              载入 JSON
            </button>
            <button
              type="button"
              className="btn"
              id="menuImportImages"
              hidden={!job}
              disabled={imageLoad.isPending}
              onClick={() => imageLoad.mutate()}
            >
              查看原图
            </button>
          </div>
          <div id="menuImportImageList" className="menu-images">
            {images.map((src, i) => (
              <Picture
                key={src}
                src={src}
                caption={`菜单原图 ${i + 1}`}
                className="thumb u-w-full"
              />
            ))}
          </div>
          <p className="callout" id="menuImportWarning">
            {warning ||
              (source
                ? '发布会替换该来源的全部记录。可载入已发布内容或选择识图结果。'
                : '新建批次会加入目录，不会替换其他来源。')}
          </p>
          <Field label="菜单 JSON" name="menuImportJson">
            <textarea
              className="textarea"
              rows={18}
              id="menuImportJson"
              required
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                invalidate();
              }}
            />
          </Field>
          <div id="menuImportStatus" role="status">
            {status}
          </div>
          <label className="check-row">
            <input
              className="check"
              type="checkbox"
              id="menuImportReviewed"
              checked={reviewed}
              disabled={!validated}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>已人工核对全部菜单内容</span>
          </label>
        </fieldset>
        <div className="panel__foot row">
          <button
            type="button"
            className="btn"
            id="menuImportValidate"
            disabled={preview.isPending || busy}
            onClick={() => preview.mutate()}
          >
            校验菜单
          </button>
          <Submit id="menuImportPublish" pending={busy} disabled={!validated || !reviewed}>
            {source ? '替换并发布菜单' : '发布菜单'}
          </Submit>
        </div>
      </form>
      <div className="panel">
        <div className="panel__head row row--between">
          <h2 className="panel__title">手动导入记录</h2>
          <button
            type="button"
            className="btn"
            id="menuImportRefresh"
            onClick={() => query.refetch()}
          >
            刷新
          </button>
        </div>
        <div className="panel__body stack" id="menuImportHistory">
          {query.data.history.length ? (
            query.data.history.map((h) => (
              <article className="card stack" key={h.id}>
                <h3 className="u-fs-base">{h.title}</h3>
                <p className="u-muted u-fs-sm">
                  {date(h.created_at)} · 操作者 #{h.actor_id} · {h.records_count} 条 · 修订{' '}
                  {h.revision}
                </p>
              </article>
            ))
          ) : (
            <Empty title="尚无手动导入记录" description="通过校验并发布后会记录操作者和修订。" />
          )}
        </div>
      </div>
      {confirmLoad && (
        <Confirm
          title="载入菜单 JSON？"
          message="载入会覆盖编辑框中尚未发布的内容。"
          label="载入"
          onClose={() => setConfirmLoad(false)}
          onConfirm={() => load.mutate()}
        />
      )}
    </div>
  );
}
