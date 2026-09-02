import { Router } from 'express';
import { barMenuController } from '../controllers/barMenu.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/', readLimit(60 * 1000, 600), barMenuController.getAllBarMenuItems);
router.post('/categories/bulk', requirePermission(Permission.MANAGE_BAR_MENU), writeLimit(), barMenuController.createBulkCategories);
router.post('/', requirePermission(Permission.MANAGE_BAR_MENU), writeLimit(), barMenuController.createBarMenuItem);
router.patch('/:id', requirePermission(Permission.MANAGE_BAR_MENU), writeLimit(), barMenuController.updateBarMenuItem);
router.delete('/:id', requirePermission(Permission.MANAGE_BAR_MENU), writeLimit(), barMenuController.deleteBarMenuItem);

export default router;
