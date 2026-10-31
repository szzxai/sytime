import { type User } from '@sytime/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Picture, Upload } from '../components/Media';
import { Icon, useToast } from '../components/ui';
import { AuthFrame, PasswordField, TextField } from '../components/FormFields';
import { StudentIdentity } from '../components/Submissions';
import { api, ApiError, formValues, nextUrl } from '../lib/api';
import { RequireLogin, useSession } from '../lib/session';
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
  const session = useSession(),
    toast = useToast();
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
      setTimeout(() => location.assign(nextUrl()), 500);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403 && error.data.error === 'banned')
        setBan(error.data);
      else toast(error.message, 'error');
    },
  });
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
      if (reason.current) reason.current.value = '';
    },
    onError: (error) => {
      toast(error.message, 'error');
      if (error instanceof ApiError && error.status === 429)
        setCooldown(Number(error.data.retry_after) || 600);
    },
  });
  return (
    <AuthFrame title="欢迎回来" description="登录后管理个人设置，学生认证后可提交评价">
      <form
        id="loginForm"
        className="form"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          const body = formValues(e.currentTarget);
          setUsername(body.username);
          credentials.current = body.password;
          setBan(null);
          login.mutate(body);
        }}
      >
        <div id="loginAlert" hidden={!ban}>
          {ban && (
            <div className="alert alert--danger" role="alert">
              <Icon name="ban" />
              <div className="alert__body">
                <span className="alert__title">账号已被封禁</span>
                {ban.ban_reason ? `封禁理由：${ban.ban_reason}` : '未填写封禁理由'}
                {Number(ban.allow_appeal) !== 1 && (
                  <p>此账号不允许在线申诉，如需解封请联系运营者</p>
                )}
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
        >
          登录
        </button>
      </form>
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
export function RegisterPage() {
  const session = useSession();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      if (body.password !== body.confirm) throw new Error('两次输入的密码不一致');
      await api('/api/register', { method: 'POST', auth: false, body });
      return api<{ token: string; user: User }>('/api/login', {
        method: 'POST',
        auth: false,
        body: { username: body.username, password: body.password },
      });
    },
    onSuccess: (data) => {
      session.login(data.token, data.user);
      toast('注册成功');
      location.assign(nextUrl());
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <AuthFrame title="创建账号" description="注册普通账号，认证学生后可提交内容审核" register>
      <form
        id="registerForm"
        className="form"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(formValues(e.currentTarget));
        }}
      >
        <TextField
          label="用户名"
          id="username"
          name="username"
          autoComplete="username"
          enterKeyHint="next"
          hint="注册后不可修改"
          required
        />
        <TextField
          label="昵称"
          id="nickname"
          name="nickname"
          autoComplete="nickname"
          enterKeyHint="next"
          maxLength={20}
          hint="最多 20 字"
          required
        />
        <PasswordField
          label="密码"
          id="password"
          name="password"
          autoComplete="new-password"
          enterKeyHint="next"
          required
        />
        <TextField
          label="确认密码"
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          enterKeyHint="go"
          required
        />
        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          id="submitBtn"
          disabled={mutation.isPending}
        >
          注册
        </button>
      </form>
    </AuthFrame>
  );
}
export function StudentVerifyPage() {
  return (
    <RequireLogin>
      <StudentIdentity />
    </RequireLogin>
  );
}
