import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { getCookie } from 'hono/cookie';
import type { DatabaseClient } from '../../../packages/db/src/client';
import { roleWeights, type Role } from '../../../packages/shared/src/index';
export function createAuth(db: DatabaseClient, secret: string) {
  const checkRole = (requiredRole?: Role) => async (c: Context, next: Next) => {
    let user: { id: number | null; role: Role; username: string | null; session_id?: string } = {
      id: null,
      role: 'guest',
      username: null,
    };
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : getCookie(c, 'sytime_session');
    if (token) {
      try {
        const payload = jwt.verify(token, secret, {
          algorithms: ['HS256'],
          issuer: 'sytime',
          audience: 'sytime-web',
        }) as jwt.JwtPayload;
        const account = db.$client
          .prepare(
            `SELECT u.id,u.username,u.role,u.status,u.session_version FROM users u JOIN account_sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires_at>unixepoch() AND s.version=u.session_version`,
          )
          .get(payload.sid) as
          | { id: number; username: string; role: Role; status: string; session_version: number }
          | undefined;
        if (
          account?.status === 'active' &&
          account.id === payload.id &&
          Object.hasOwn(roleWeights, account.role) &&
          account.role !== 'guest'
        )
          user = {
            id: account.id,
            role: account.role,
            username: account.username,
            session_id: payload.sid,
          };
      } catch {
        /* Invalid, expired, or revoked sessions are anonymous. */
      }
    }
    c.set('user', user);
    if (requiredRole && user.id === null) return c.json({ error: 'login required' }, 401);
    if (requiredRole && roleWeights[user.role] < roleWeights[requiredRole])
      return c.json({ error: 'forbidden' }, 403);
    return next();
  };
  const requireLogin = checkRole('user');
  return { checkRole, requireLogin };
}
