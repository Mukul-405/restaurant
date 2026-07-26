import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthRequest } from './auth.middleware';

export const userKey = (req: Request): string =>
  (req as AuthRequest).user?.id ?? ipKeyGenerator(req.ip || 'unknown');

const base = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  keyGenerator: userKey,
};

export const readLimit = (windowMs = 15 * 60 * 1000, limit = 60) =>
  rateLimit({ ...base, windowMs, limit, message: { message: 'Too many requests, please slow down' } });

export const writeLimit = (windowMs = 15 * 60 * 1000, limit = 20) =>
  rateLimit({ ...base, windowMs, limit, message: { message: 'Too many requests, please slow down' } });
