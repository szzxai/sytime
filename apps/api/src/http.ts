import type { Context } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
const mime: Record<string, string> = {
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
export function setHeaders(c: Context, name: string | Record<string, string>, value?: string) {
  if (typeof name === 'string') c.header(name, value!);
  else for (const [key, val] of Object.entries(name)) c.header(key, val);
  return c;
}
export function setContentType(c: Context, type: string) {
  c.header('Content-Type', type === 'png' ? 'image/png' : type);
  return c;
}
export function sendFile(c: Context, file: string) {
  if (!c.res.headers.has('Content-Type'))
    c.header('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
  c.res = c.body(fs.readFileSync(file));
  return c.res;
}
