import { passwordRules } from '@sytime/shared';
import { SiteLink } from './SiteLink';
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './ui';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  strength?: boolean;
};

export function TextField({ label, hint, id, ...input }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input className="input" id={id} {...input} />
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

export function PasswordField({ label, hint, id, strength = true, ...input }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const rules = strength ? passwordRules(value) : [];
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="input-group">
        <input
          className="input input--end"
          id={id}
          {...input}
          type={visible ? 'text' : 'password'}
          maxLength={strength ? 72 : undefined}
          aria-describedby={strength ? `${id}-rules` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            input.onChange?.(e);
          }}
        />
        <div className="input-group__end">
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            data-password-toggle=""
            aria-label={visible ? '隐藏密码' : '显示密码'}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? 'eye-off' : 'eye'} />
          </button>
        </div>
      </div>
      {strength && (
        <div className="password-checks" id={`${id}-rules`}>
          <p className="field__hint">
            {rules.every((r) => r.passed) ? '密码符合要求' : '密码需要满足以下要求：'}
          </p>
          <ul>
            {rules.map((rule) => (
              <li key={rule.label} className={rule.passed ? 'is-met' : ''}>
                <span aria-hidden="true">{rule.passed ? '✓' : '○'}</span>
                {rule.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hint !== undefined && (
        <div className="field__foot">
          <span className="field__hint">{hint}</span>
        </div>
      )}
    </div>
  );
}

export function AuthFrame({
  title,
  description,
  children,
  register = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  register?: boolean;
}) {
  const next = new URLSearchParams(location.search).get('next');
  const href = `${register ? '/login.html' : '/register.html'}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <main id="main" className="auth container container--narrow">
      <div className="card auth-card">
        <div className="auth-card__brand">
          <img
            className="brand__mark"
            src="/img/brand-lime.svg?v=20261019"
            alt=""
            width={40}
            height={40}
          />
        </div>
        <h1 className="auth-card__title">{title}</h1>
        <p className="auth-card__desc">{description}</p>
        {children}
        <p className="auth-card__switch">
          {register ? '已有账号？' : '还没有账号？'}
          <SiteLink href={href}>{register ? '立即登录' : '立即注册'}</SiteLink>
        </p>
      </div>
    </main>
  );
}

/** A counter for native uncontrolled fields; subscriptions end with the component. */
export function FieldCounter({ htmlFor, max }: { htmlFor: string; max: number }) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    const field = document.getElementById(htmlFor) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!field) return;
    const update = () => setLength(field.value.length);
    const reset = () => queueMicrotask(update);
    update();
    field.addEventListener('input', update);
    field.form?.addEventListener('reset', reset);
    return () => {
      field.removeEventListener('input', update);
      field.form?.removeEventListener('reset', reset);
    };
  }, [htmlFor]);
  return (
    <span className={`field__counter${length > max ? ' is-over' : ''}`}>
      {length} / {max}
    </span>
  );
}
