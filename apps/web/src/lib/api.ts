/* eslint-disable no-control-regex -- Reject non-printable characters in untrusted text. */
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { errorText } from './errors';
export class ApiError extends Error {
  constructor(
    public status: number,
    public data: Record<string, unknown>,
  ) {
    super(errorText(status, data));
  }
}
export type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean };
export async function api<T = Record<string, unknown>>(
  path: string,
  { body, auth = true, ...options }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem('token');
  if (auth && token) headers.set('Authorization', `Bearer ${token}`);
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers, body: payload }).catch(
    (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error('网络连接失败，请检查网络后重试');
    },
  );
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && auth && token && localStorage.getItem('token') === token) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('sytime:session-expired'));
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
export const endpoint = <T>(path: string, auth = true) =>
  queryOptions({
    queryKey: [path, auth ? localStorage.getItem('token') : 'public'],
    queryFn: ({ signal }) => api<T>(path, { signal, auth }),
  });
export function loginUrl() {
  return `/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}
export function nextUrl(fallback = 'index.html') {
  const next = new URLSearchParams(location.search).get('next') || fallback;
  return /^(?:\/(?!\/)|[a-zA-Z0-9_-]+\.html(?:[?#]|$))/.test(next) && !/[\\\x00-\x1f]/.test(next)
    ? next
    : fallback;
}
export function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
export function safeUrl(value: unknown) {
  const s = String(value || '');
  if (s.startsWith(`blob:${location.origin}/`)) return s;
  return /^(\/|\.\/|[a-zA-Z0-9_-]+\/|data:image\/(png|jpeg|webp);base64,)/.test(s) &&
    !/^\/\//.test(s)
    ? s
    : '';
}
export function formatTime(value?: number) {
  return value
    ? new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(value * 1000)
    : '';
}
export function distance(value: unknown) {
  const n = Number(value);
  return n >= 1000 ? `${(n / 1000).toFixed(1)} 千米` : `${n} 米`;
}
export function money(value: unknown) {
  return `¥${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 2)}`;
}
