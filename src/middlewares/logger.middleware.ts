import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = (req as any).user;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const isRead = req.method === 'GET';

    logger.info(
      {
        type: isRead ? 'API_READ' : 'API_WRITE',
        method: req.method,
        url: req.originalUrl || req.url,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        status: res.statusCode,
        durationMs: duration,
        userId: user?.id || 'anonymous',
        userRole: user?.role || undefined,
        ip,
      },
      `[${isRead ? 'READ' : 'WRITE'}] ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} in ${duration}ms (User: ${user?.id || 'anonymous'}, Role: ${user?.role || 'none'})`
    );
  });

  next();
};
