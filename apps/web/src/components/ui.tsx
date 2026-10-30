import { SiteLink } from './SiteLink';
import { roleHues, roleLabels, type Role, type Title, type User } from '@sytime/shared';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { formatTime, safeUrl } from '../lib/api';
import { useSession } from '../lib/session';
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <svg className={`icon ${className}`} aria-hidden="true">
      <use href={`/img/icons.svg#i-${name}`} />
    </svg>
  );
}
export function Avatar({ user, size = 'sm' }: { user: Partial<User>; size?: string }) {
  const [broken, setBroken] = useState(false);
  const label = user.nickname || user.username || '?';
  const hues = ['teal', 'vermilion', 'ochre', 'bamboo', 'wisteria', 'indigo', 'rose'];
  return (
    <span
      className={`avatar avatar--${size}`}
      data-hue={hues[Number(user.id || 0) % 7]}
      data-initial={label.slice(0, 1)}
    >
      {safeUrl(user.avatar_url) && !broken ? (
        <img src={safeUrl(user.avatar_url)} alt="" onError={() => setBroken(true)} />
      ) : (
        label.slice(0, 1)
      )}
    </span>
  );
}
export function TitleBadge({ title }: { title?: Title | null }) {
  return title ? (
    <span className="title-badge" data-hue={title.hue || title.color} title={title.description}>
      <Icon name="award" />
      <span className="title-badge__text">{title.name}</span>
    </span>
  ) : null;
}
export function RoleTag({ role, showRole = 1 }: { role?: Role; showRole?: number }) {
  return role && (role === 'user' || showRole !== 0) ? (
    <span className="role-tag" data-hue={roleHues[role]}>
      {roleLabels[role]}
    </span>
  ) : null;
}
export function UserLine({
  user,
  time,
  size = 'sm',
}: {
  user: Partial<User>;
  time?: number;
  size?: string;
}) {
  const session = useSession();
  const href = session.user?.id === user.id ? '/profile.html' : `/user.html?id=${user.id}`;
  return (
    <div className="user-line">
      <SiteLink
        className="user-avatar user-avatar--link"
        href={href}
        aria-label={`查看${user.nickname || user.username}的主页`}
      >
        <Avatar user={user} size={size} />
      </SiteLink>
      <div className="user-line__body">
        <div className="user-line__top">
          <span className="user-line__name">{user.nickname || user.username}</span>
          <TitleBadge title={user.user_title || user.title} />
          <RoleTag role={user.role} showRole={user.show_role} />
        </div>
        {time && (
          <div className="user-line__meta">
            <time dateTime={new Date(time * 1000).toISOString()}>{formatTime(time)}</time>
          </div>
        )}
      </div>
    </div>
  );
}
export function Stars({ rating, large = false }: { rating: number; large?: boolean }) {
  return (
    <span
      className={`stars${large ? ' stars--lg' : ''}`}
      style={{ '--rating': rating } as CSSProperties}
      role="img"
      aria-label={`评分 ${rating} 分，满分 5 分`}
    >
      <span className="stars__row stars__base">
        {[1, 2, 3, 4, 5].map((x) => (
          <Icon key={x} name="star" />
        ))}
      </span>
      <span className="stars__fill">
        <span className="stars__row">
          {[1, 2, 3, 4, 5].map((x) => (
            <Icon key={x} name="star" />
          ))}
        </span>
      </span>
    </span>
  );
}
export function Empty({
  title = '这里还没有内容',
  description,
  icon = 'inbox',
  children,
}: {
  title?: string;
  description?: string;
  icon?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} />
      </div>
      <div className="empty__title">{title}</div>
      {description && <div className="empty__desc">{description}</div>}
      {children && <div className="empty__actions">{children}</div>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="stack" role="status" aria-busy="true" aria-label="加载中">
      {[1, 2, 3].map((x) => (
        <div key={x} className="card">
          <span className="skeleton skeleton--title" />
          <span className="skeleton skeleton--text" />
          <span className="skeleton skeleton--text skeleton--short" />
        </div>
      ))}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry: () => unknown }) {
  return (
    <Empty title="加载失败" description={error.message} icon="alert-circle">
      <button type="button" className="btn" data-retry onClick={retry}>
        <Icon name="refresh" />
        重试
      </button>
    </Empty>
  );
}
export function PageHead({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head__main">
        {eyebrow && <span className="page-head__eyebrow">{eyebrow}</span>}
        <h1 className="page-head__title">{title}</h1>
        {description && <p className="page-head__desc">{description}</p>}
      </div>
      {children && <div className="page-head__actions">{children}</div>}
    </div>
  );
}
export function Tabs({
  value,
  items,
  onChange,
  className = 'segmented',
  label = '视图',
}: {
  value: string;
  items: { value: string; label: ReactNode; id?: string }[];
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={className}
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        const i = items.findIndex((x) => x.value === value);
        const n =
          e.key === 'ArrowRight'
            ? (i + 1) % items.length
            : e.key === 'ArrowLeft'
              ? (i - 1 + items.length) % items.length
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? items.length - 1
                  : -1;
        if (n >= 0) {
          e.preventDefault();
          onChange(items[n].value);
          (e.currentTarget.children[n] as HTMLButtonElement).focus();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={className === 'tabs' ? 'tab' : 'segmented__item'}
          role="tab"
          id={item.id}
          data-view={item.value}
          aria-selected={value === item.value}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
export function Field({
  label,
  name,
  required,
  type = 'text',
  defaultValue,
  placeholder,
  maxLength,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  maxLength?: number;
  children?: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={name}>
        {label}
        {required && <span className="field__required"> *</span>}
      </label>
      {children || (
        <input
          className="input"
          id={name}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}
    </div>
  );
}
export function Submit({
  pending,
  children = '保存',
  id,
  disabled = false,
}: {
  disabled?: boolean;
  pending: boolean;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="submit"
      className="btn btn--primary"
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? '提交中…' : children}
    </button>
  );
}
export function Dialog({
  title,
  id: dialogId,
  header,
  children,
  onClose,
  className = '',
}: {
  title: string;
  id?: string;
  header?: ReactNode | false;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current!;
    const focus = document.activeElement as HTMLElement | null;
    el.showModal();
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      el.close();
      document.documentElement.style.overflow = overflow;
      focus?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      id={dialogId}
      className={`dialog ${className}`}
      aria-labelledby={header === undefined ? id : undefined}
      aria-label={header === undefined ? undefined : title}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {header === undefined ? (
        <div className="dialog__head">
          <h2 className="dialog__title" id={id}>
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            data-dialog-close
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      ) : (
        header
      )}
      {children}
    </dialog>,
    document.body,
  );
}
const ToastContext = createContext((_message: string, _tone?: string) => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: string }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (
    <ToastContext
      value={(message, tone = 'success') => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, message, tone }]);
        timers.current.push(setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500));
      }}
    >
      {children}
      {createPortal(
        <div className="toast-host" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast toast--${t.tone}`}
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon
                name={t.tone === 'error' ? 'alert-circle' : 'check-circle'}
                className="toast__icon"
              />
              <span className="toast__text">{t.message}</span>
              <button
                className="icon-btn"
                aria-label="关闭提示"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>,
        document.querySelector('dialog[open]') || document.body,
      )}
    </ToastContext>
  );
}
export function useToast() {
  return useContext(ToastContext);
}
export function Confirm({
  title,
  message,
  onConfirm,
  onClose,
  label = '删除',
}: {
  label?: string;
  title: string;
  message: string;
  onConfirm: () => unknown;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose} className="dialog--confirm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
          onConfirm();
        }}
      >
        <div className="dialog__body">{message}</div>
        <div className="dialog__foot">
          <button type="button" className="btn" autoFocus onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn--danger" data-r="ok">
            {label}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
