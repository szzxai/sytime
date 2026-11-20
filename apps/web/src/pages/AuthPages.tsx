import { type User } from '@sytime/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Picture, Upload } from '../components/Media';
import { Icon, useToast } from '../components/ui';
import { AuthFrame, PasswordField, TextField } from '../components/FormFields';
import { api, ApiError, formValues, nextUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { SiteLink } from '../components/SiteLink';
function useCooldown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return [remaining, setRemaining] as const;
}
export function LoginPage() {
  return <LoginScreen passwordLogin={false} />;
}
export function PasswordLoginPage() {
  return <LoginScreen passwordLogin />;
}
function LoginScreen({ passwordLogin }: { passwordLogin: boolean }) {
  const session = useSession(),
    toast = useToast();
  const ssoState = new URLSearchParams(location.search).get('sso');
  const returnPath = new URLSearchParams(location.search).has('next')
    ? '/' + nextUrl().replace(/^\//, '')
    : '';
  const [ssoMessage, setSSOMessage] = useState('');
  const [agreed, setAgreed] = useState(false);
  const consentRef = useRef<HTMLDivElement>(null);
  function checkConsent() {
    if (agreed) return true;
    const area = consentRef.current;
    area?.querySelector('input')?.focus({ preventScroll: true });
    area?.getAnimations().forEach((animation) => animation.cancel());
    area?.animate(
      matchMedia('(prefers-reduced-motion: reduce)').matches
        ? [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }]
        : [0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 360, easing: 'ease-in-out' },
    );
    return false;
  }
  const [username, setUsername] = useState('');
  const credentials = useRef('');
  const [ban, setBan] = useState<Record<string, unknown> | null>(null);
  const lastAppeal = ban?.last_appeal as { status: string; reason: string } | null | undefined;
  const [file, setFile] = useState<File | null>(null);
  const reason = useRef<HTMLTextAreaElement>(null);
  const [cooldown, setCooldown] = useCooldown();
  const login = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api<{ token: string; user: User }>('/api/login', { method: 'POST', auth: false, body }),
    onSuccess: (data) => {
      session.login(data.token, data.user);
      toast('登录成功');
      setTimeout(() => location.assign(nextUrl(data.user.default_page || 'index.html')), 500);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403 && error.data.error === 'banned')
        setBan(error.data);
      else toast(error.message, 'error');
    },
  });
  useEffect(() => {
    if (ssoState === 'success') {
      void api<{ user: User }>('/api/user/profile', { auth: false })
        .then(({ user }) => {
          session.login('session', user);
          location.replace(nextUrl());
        })
        .catch((e: Error) => setSSOMessage(e.message));
    } else if (ssoState === 'banned') {
      void api<Record<string, unknown>>('/api/sso/ban', { auth: false })
        .then(setBan)
        .catch((e: Error) => setSSOMessage(e.message));
    } else if (ssoState === 'error') {
      setSSOMessage(new URLSearchParams(location.search).get('message') || '社盟登录失败，请重试');
    } else if (ssoState === 'revoked') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('sytime:session-expired'));
      setSSOMessage('所有设备的本站会话已退出，请重新登录');
    }
    // This page consumes the server callback once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const appeal = useMutation({
    mutationFn: async () => {
      if (!reason.current?.value.trim()) throw new Error('请填写申诉理由');
      let image = '';
      if (file)
        image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      return api('/api/user/appeal', {
        method: 'POST',
        auth: false,
        body: {
          username,
          password: credentials.current,
          appeal_reason: reason.current.value,
          appeal_image: image,
        },
      });
    },
    onSuccess: () => {
      toast('申诉已提交，请等待管理员审核');
      setFile(null);
      setBan((value) =>
        value ? { ...value, last_appeal: { status: 'pending', reason: '' } } : value,
      );
      if (reason.current) reason.current.value = '';
    },
    onError: (error) => {
      toast(error.message, 'error');
      if (error instanceof ApiError && error.status === 429)
        setCooldown(Number(error.data.retry_after) || 600);
    },
  });
  return (
    <AuthFrame
      title={passwordLogin ? '账号密码登录' : '欢迎回来'}
      description={
        passwordLogin
          ? '管理员及现有账号使用原账号密码登录'
          : '学生使用社盟账号登录，管理员使用账号密码登录'
      }
    >
      {passwordLogin ? (
        <SiteLink
          className="btn btn--block"
          href={'/login.html' + (returnPath ? '?next=' + encodeURIComponent(returnPath) : '')}
        >
          返回选择登录方式
        </SiteLink>
      ) : (
        <div className="stack">
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={() => {
              if (checkConsent())
                location.assign(
                  '/api/sso/start' + (returnPath ? '?next=' + encodeURIComponent(returnPath) : ''),
                );
            }}
          >
            通过社盟账号登录
          </button>
          <SiteLink
            className="btn btn--lg btn--block"
            onClick={(e) => {
              if (!checkConsent()) e.preventDefault();
            }}
            href={
              '/login-password.html' + (returnPath ? '?next=' + encodeURIComponent(returnPath) : '')
            }
          >
            使用账号密码登录
          </SiteLink>
          {ssoMessage && (
            <p role="status" className="field__hint">
              {ssoMessage}
            </p>
          )}
        </div>
      )}
      <div id="loginAlert" hidden={!ban}>
        {ban && (
          <div className="alert alert--danger" role="alert">
            <Icon name="ban" />
            <div className="alert__body">
              <span className="alert__title">账号已被封禁</span>
              {ban.ban_reason ? `封禁理由：${ban.ban_reason}` : '未填写封禁理由'}
              {Number(ban.allow_appeal) !== 1 && <p>此账号不允许在线申诉，如需解封请联系运营者</p>}
              {lastAppeal && (
                <p>
                  最近申诉：
                  {{
                    pending: '待审核',
                    approved: '已通过',
                    rejected: '未通过',
                    withdrawn: '已撤回',
                  }[lastAppeal.status] || lastAppeal.status}
                  {lastAppeal.reason && ` · ${lastAppeal.reason}`}
                </p>
              )}
              <Picture src={String(ban.ban_image || '')} caption="封禁说明图片" />
            </div>
          </div>
        )}
      </div>
      {passwordLogin && (
        <form
          id="loginForm"
          className="form"
          autoComplete="on"
          onSubmit={(e) => {
            e.preventDefault();
            if (!checkConsent()) return;
            const body = formValues(e.currentTarget);
            setUsername(body.username);
            credentials.current = body.password;
            setBan(null);
            login.mutate(body);
          }}
        >
          <TextField
            label="用户名"
            id="username"
            name="username"
            autoComplete="username"
            enterKeyHint="go"
            required
          />
          <PasswordField
            label="密码"
            id="password"
            name="password"
            autoComplete="current-password"
            strength={false}
            enterKeyHint="go"
            required
          />
          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            id="submitBtn"
            disabled={login.isPending || login.isSuccess}
            onClick={(e) => {
              if (!checkConsent()) e.preventDefault();
            }}
          >
            登录
          </button>
        </form>
      )}
      <div className="login-consent" ref={consentRef}>
        <input
          id="loginConsent"
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          form={passwordLogin ? 'loginForm' : undefined}
          aria-required="true"
        />
        <div>
          <label htmlFor="loginConsent">我已阅读并同意</label>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">
            《用户协议》
          </a>
          <span>和</span>
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            《隐私政策》
          </a>
        </div>
      </div>
      <div id="appealBox" hidden={!ban || Number(ban.allow_appeal) !== 1}>
        <h2 className="form__group-title">申请解封</h2>
        <div className="field">
          <label className="field__label" htmlFor="appealReason">
            申诉理由
          </label>
          <textarea
            ref={reason}
            className="textarea"
            id="appealReason"
            placeholder="请说明情况，以便管理员审核"
            maxLength={500}
          />
        </div>
        <Upload name="appealImage" file={file} onChange={setFile} />
        <button
          type="button"
          className="btn btn--block"
          id="appealSubmit"
          disabled={appeal.isPending || cooldown > 0}
          onClick={() => appeal.mutate()}
        >
          {cooldown ? `等待 ${cooldown} 秒` : '提交申诉'}
        </button>
      </div>
    </AuthFrame>
  );
}
