import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { z } from 'zod';
import { Role } from '@prisma/client';



const loginSchema = z.object({
  phoneNumber: z.string().min(10),
  password: z.string().min(6),
});

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login(data.phoneNumber, data.password);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid credentials')) {
        return res.status(401).json({ message: error.message });
      }
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: 'Refresh token is required' });
      }
      const result = await authService.refreshToken(token);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && (error.message.includes('expired') || error.message.includes('not found'))) {
        return res.status(401).json({ message: error.message });
      }
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: 'Refresh token is required' });
      }
      await authService.logout(token);
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
