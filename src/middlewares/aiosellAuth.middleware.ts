import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const aiosellAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username !== env.AIOSELL_USERNAME || password !== env.AIOSELL_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
};
