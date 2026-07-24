import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate, authorize, verifyOrigin } from '../middlewares/auth.middleware';
import { userRepository } from '../repositories/user.repository';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const router = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each account to 5 requests per 15 minutes
  keyGenerator: (req, res) => {
    // Normalize phone number (digits only) or fallback to IP
    return req.body?.phoneNumber ? String(req.body.phoneNumber).replace(/\D/g, '') : ipKeyGenerator(req.ip || 'unknown');
  },
  message: { message: 'Too many login attempts, please try again' },
  standardHeaders: true, 
  legacyHeaders: false,
});

const refreshTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req, res) => {
    // Rate limit by the refresh token itself to avoid blocking everyone on the hotel WiFi
    return req.cookies?.refreshToken ? req.cookies.refreshToken : ipKeyGenerator(req.ip || 'unknown');
  },
  message: { message: 'Too many refresh token attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh-token', verifyOrigin, refreshTokenRateLimiter, authController.refreshToken);
router.post('/logout', verifyOrigin, authenticate, authController.logout);

// Example protected route
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const payload = (req as any).user;
    const dbUser = await userRepository.findById(payload.id);
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ 
      message: 'Protected user data', 
      user: {
        id: dbUser.id,
        name: dbUser.name,
        role: dbUser.role,
        phoneNumber: dbUser.phoneNumber,
        isActive: dbUser.isActive
      } 
    });
  } catch (error) {
    next(error);
  }
});

// Example admin only route
router.get('/admin', authenticate, authorize(['ADMIN']), (req, res) => {
  res.json({ message: 'Admin protected data' });
});

export default router;
