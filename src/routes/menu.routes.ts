import { Router } from 'express';
import { menuController } from '../controllers/menu.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Reading the menu is not gated: taking an order needs it, whatever the role.
// Menu is re-fetched on every order screen open, so reads get the order-side ceiling.
router.get('/', readLimit(60 * 1000, 120), menuController.getAllMenuItems);
router.post('/categories/bulk', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.createBulkCategories);
router.post('/', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.createMenuItem);
router.patch('/:id', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.updateMenuItem);
router.delete('/:id', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.deleteMenuItem);

export default router;
