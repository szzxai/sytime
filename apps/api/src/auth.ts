import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import type { DatabaseClient } from '../../../packages/db/src/client';
import { users } from '../../../packages/db/src/schema';
import { roleWeights, type Role } from '../../../packages/shared/src/index';

export function createAuth(db: DatabaseClient, secret: string) {
  const checkRole = (requiredRole?: Role) => async (c: Context, next: Next) => {
    let user: { id: number | null; role: Role; username: string | null } = {
      id: null,
      role: 'guest',
      username: null,
    };
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (token) {
      try {
        const payload = jwt.verify(token, secret) as jwt.JwtPayload;
        const account = db
          .select()
          .from(users)
          .where(eq(users.id, Number(payload.id)))
          .get();
        // Resolve the current account on every request: a ban/demotion takes effect immediately.
        if (account?.status === 'active')
          user = { id: account.id, role: account.role as Role, username: account.username };
      } catch {
        /* An invalid/expired credential behaves as a guest. */
      }
    }
    c.set('user', user);
    if (requiredRole && roleWeights[user.role] < roleWeights[requiredRole])
      return c.json({ error: 'forbidden' }, 403);
    return next();
  };
  const requireLogin = async (c: Context, next: Next) =>
    checkRole()(c, async () => {
      if (c.get('user').id == null) {
        c.res = c.json({ error: 'login required' }, 401);
        return;
      }
      return next();
    });
  return { checkRole, requireLogin };
}
