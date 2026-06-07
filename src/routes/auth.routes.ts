import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { userRepository } from '../repositories/user.repository';

const router = Router();

router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

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
