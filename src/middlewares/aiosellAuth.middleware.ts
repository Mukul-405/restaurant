import { Request, Response, NextFunction } from 'express';

export const aiosellAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  const EXPECTED_USERNAME = process.env.AIOSELL_USERNAME || 'sandbox';
  const EXPECTED_PASSWORD = process.env.AIOSELL_PASSWORD || 'sandbox123';

  if (username !== EXPECTED_USERNAME || password !== EXPECTED_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
};
