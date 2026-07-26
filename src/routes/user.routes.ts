import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// Routes
router.get('/', readLimit(), userController.getAllMembers);
router.post('/', writeLimit(), userController.createMember);

router.patch('/:id/block', writeLimit(), userController.blockMember);
router.patch('/:id/unblock', writeLimit(), userController.unblockMember);
router.patch('/:id/reset-password', writeLimit(), userController.resetPassword);
router.delete('/:id', writeLimit(), userController.deleteMember);

export default router;
