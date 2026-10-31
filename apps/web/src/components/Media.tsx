import { useEffect, useRef, useState, type ReactNode } from 'react';
import { safeUrl } from '../lib/api';
import { prepareImage } from '../lib/imageUpload';
import { Dialog, Icon, useToast } from './ui';
export function Picture({
  src,
  caption,
  className = 'thumb',
}: {
  src?: string;
  caption: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const url = safeUrl(src);
  return url ? (
    <>
      <button
        type="button"
        className={className}
        data-zoom={url}
        data-caption={caption}
        aria-label={`查看${caption}`}
        onClick={() => setOpen(true)}
      >
        <img src={url} alt={caption} loading="lazy" decoding="async" />
      </button>
      {open && <ImageViewer src={url} caption={caption} onClose={() => setOpen(false)} />}
    </>
  ) : null;
}
export function ImageViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption: string;
  onClose: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const current = useRef(view);
  current.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  function scale(value: number, cx?: number, cy?: number) {
    const old = current.current;
    const s = Math.max(0.5, Math.min(8, value));
    const r = stage.current!.getBoundingClientRect();
    const x = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2),
      y = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    setView({
      scale: s,
      x: s <= 1 ? 0 : x - ((x - old.x) * s) / old.scale,
      y: s <= 1 ? 0 : y - ((y - old.y) * s) / old.scale,
    });
  }
  useEffect(() => {
    const el = stage.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      scale(current.current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  return (
    <Dialog header={false} title="图片查看器" className="viewer" onClose={onClose}>
      <div
        className="viewer__stage"
        ref={stage}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = [...pointers.current.values()];
          if (p.length === 2)
            pinch.current = {
              distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
              scale: view.scale,
            };
        }}
        onPointerMove={(e) => {
          const old = pointers.current.get(e.pointerId);
          if (!old) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = [...pointers.current.values()];
          if (p.length === 2 && pinch.current)
            scale(
              (pinch.current.scale * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)) /
                pinch.current.distance,
              (p[0].x + p[1].x) / 2,
              (p[0].y + p[1].y) / 2,
            );
          else if (view.scale > 1)
            setView((v) => ({ ...v, x: v.x + e.clientX - old.x, y: v.y + e.clientY - old.y }));
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        <img
          className="viewer__img"
          alt={caption}
          src={src}
          draggable={false}
          style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})` }}
          onDoubleClick={(e) =>
            view.scale > 1 ? setView({ scale: 1, x: 0, y: 0 }) : scale(2.5, e.clientX, e.clientY)
          }
        />
      </div>
      <div className="viewer__caption">{caption}</div>
      <button type="button" className="icon-btn viewer__close" aria-label="关闭" onClick={onClose}>
        <Icon name="close" />
      </button>
      <div className="viewer__bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="缩小"
          onClick={() => scale(view.scale / 1.3)}
        >
          <Icon name="minus" />
        </button>
        <span className="viewer__zoom" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="放大"
          onClick={() => scale(view.scale * 1.3)}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="适应屏幕"
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
        >
          <Icon name="fullscreen" />
        </button>
      </div>
    </Dialog>
  );
}
export function Upload({
  name = 'image',
  file,
  onChange,
  maxMB = 2,
  onProcessingChange,
  children,
}: {
  name?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  maxMB?: number;
  onProcessingChange?: (processing: boolean) => void;
  children?: ReactNode;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [processing, setProcessing] = useState(false);
  const selection = useRef(0);
  async function select(f?: File) {
    if (!f) return;
    const version = ++selection.current;
    setProcessing(true);
    onProcessingChange?.(true);
    // An earlier selection must never remain uploadable while this photo is being prepared.
    onChange(null);
    try {
      const prepared = await prepareImage(f, maxMB);
      if (version === selection.current) onChange(prepared);
    } catch (error) {
      if (version === selection.current) toast((error as Error).message, 'error');
    } finally {
      if (version === selection.current) {
        setProcessing(false);
        onProcessingChange?.(false);
        if (input.current) input.current.value = '';
      }
    }
  }
  return (
    <div className="field" data-upload aria-busy={processing}>
      <span className="field__label">
        图片 <span className="field__opt">（选填）</span>
      </span>
      <label
        className="upload"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          select(e.dataTransfer.files[0]);
        }}
      >
        <span className="upload__icon">
          <Icon name="image" className="icon--lg" />
        </span>
        <span className="upload__title">{processing ? '正在压缩图片…' : '点击选择或拖入图片'}</span>
        <span className="upload__hint">JPG / PNG，超过 {maxMB} MB 将自动压缩后上传</span>
        <input
          ref={(element) => {
            input.current = element;
            element?.setCustomValidity(processing ? '图片正在压缩，请稍候' : '');
          }}
          type="file"
          name={name}
          id={name}
          accept="image/jpeg,image/png"
          aria-label="上传图片"
          onChange={(e) => select(e.target.files?.[0])}
        />
      </label>
      <div className="upload-preview-slot">
        {file && (
          <div className="upload-preview">
            <img className="upload-preview__img" src={preview} alt="待上传图片" />
            <div className="upload-preview__meta">
              <div className="upload-preview__name">{file.name}</div>
              <div className="upload-preview__size">{Math.ceil(file.size / 1024)} KB</div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="移除图片"
              onClick={() => {
                ++selection.current;
                setProcessing(false);
                onProcessingChange?.(false);
                onChange(null);
                if (input.current) input.current.value = '';
              }}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
