import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util';
import { prisma } from '../config/prisma';
import { Permission, Role } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    permissions: Permission[];
  };
}

/** SUPERADMIN passes every gate. Everyone else, including ADMIN, needs the box ticked. */
export const hasPermission = (
  user: { role: string; permissions: Permission[] } | undefined,
  permission: Permission,
): boolean => {
  if (!user) return false;
  if (user.role === Role.SUPERADMIN) return true;
  return user.permissions.includes(permission);
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    
    // Check if user still exists and is active
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User is inactive or deleted' });
    }

    req.user = { id: user.id, role: user.role, permissions: user.permissions };
    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

/** Gate a route on a sidebar-section permission. Must run after `authenticate`. */
export const requirePermission = (permission: Permission) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

export const verifyOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'https://restaurantfrontend-ei8x.onrender.com',
      'http://localhost:3000'
    ];
    
    if (!origin || !allowedOrigins.includes(origin)) {
      return res.status(403).json({ message: 'Forbidden: Invalid Origin' });
    }
  }
  next();
};

export const verifyCsrf = (req: Request, res: Response, next: NextFunction) => {
  // Only strictly enforce in production where sameSite: 'none' is used
  if (process.env.NODE_ENV === 'production') {
    const cookieToken = req.cookies['XSRF-TOKEN'];
    const headerToken = req.headers['x-xsrf-token'];
    
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ message: 'Forbidden: CSRF token mismatch or missing' });
    }
  }
  next();
};
