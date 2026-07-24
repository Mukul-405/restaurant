import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

// Constant-time string compare: hash to fixed-length digests so timingSafeEqual
// never sees a length difference and no per-character timing leaks.
const safeEqual = (a: string, b: string): boolean => {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
};

export const aiosellAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header' });
  }

  const base64Credentials = authHeader.split(' ')[1] ?? '';
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const idx = credentials.indexOf(':');
  const username = idx === -1 ? credentials : credentials.slice(0, idx);
  const password = idx === -1 ? '' : credentials.slice(idx + 1);

  // Evaluate both before branching so a wrong username can't be distinguished
  // from a wrong password by timing.
  const okUser = safeEqual(username, env.AIOSELL_USERNAME);
  const okPass = safeEqual(password, env.AIOSELL_PASSWORD);
  if (!(okUser && okPass)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
};
