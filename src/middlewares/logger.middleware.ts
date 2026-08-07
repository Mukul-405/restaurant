import { Request, Response, NextFunction } from 'express';
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
};
