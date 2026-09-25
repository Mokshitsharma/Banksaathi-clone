import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  role: Role;
  /** Must match users.token_version; bumping it revokes every outstanding token. */
  ver: number;
}

export function signToken(user: AuthUser & { tokenVersion: number }): string {
  return jwt.sign({ role: user.role, ver: user.tokenVersion } satisfies Omit<TokenPayload, 'sub'>, env.JWT_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: (user.role === 'admin' ? env.ADMIN_JWT_EXPIRES_IN : env.JWT_EXPIRES_IN) as jwt.SignOptions['expiresIn'],
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
  // Re-read role and token version so demotion, deletion and logout take effect immediately.
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, tokenVersion: true } });
  if (!user) return next(unauthorized('Account no longer exists'));
  if (user.tokenVersion !== payload.ver) return next(unauthorized('Session has been signed out'));
  req.user = { id: user.id, role: user.role };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
