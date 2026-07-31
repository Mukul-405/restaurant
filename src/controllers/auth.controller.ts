import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authService } from '../services/auth.service';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { logger } from '../config/logger';



const loginSchema = z.object({
  phoneNumber: z.string().trim().min(10).max(15),
  password: z.string().min(12).max(128),
});

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login(data.phoneNumber, data.password);
      
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });

      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('XSRF-TOKEN', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });

      logger.info({ userId: result.user.id }, 'User logged in');
      res.status(200).json({ accessToken: result.accessToken, user: result.user });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid credentials')) {
        logger.warn('Login failed: invalid credentials');
        return res.status(401).json({ message: error.message });
      }
      logger.error({ err: error }, 'Login failed');
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.refreshToken;
      if (!token) {
        return res.status(401).json({ message: 'Refresh token is required' });
      }
      const result = await authService.refreshToken(token);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });

      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('XSRF-TOKEN', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });

      res.status(200).json({ accessToken: result.accessToken });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('expired') || error.message.includes('not found'))) {
        return res.status(401).json({ message: error.message });
      }
      logger.error({ err: error }, 'Token refresh failed');
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.refreshToken;
      if (token) {
        await authService.logout(token);
      }
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      });
      res.clearCookie('XSRF-TOKEN', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      });
      logger.info('User logged out');
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Logout failed');
      next(error);
    }
  }
}

export const authController = new AuthController();
