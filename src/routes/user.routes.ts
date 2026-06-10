import { Router, Request, Response, NextFunction } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Routes
router.get('/', authenticate, authorize(['ADMIN']), userController.getAllMembers);
router.post('/', authenticate, authorize(['ADMIN']), userController.createMember);

router.patch('/:id/block', authenticate, authorize(['ADMIN']), userController.blockMember);
router.patch('/:id/unblock', authenticate, authorize(['ADMIN']), userController.unblockMember);
router.patch('/:id/reset-password', authenticate, authorize(['ADMIN']), userController.resetPassword);
router.delete('/:id', authenticate, authorize(['ADMIN']), userController.deleteMember);

export default router;
