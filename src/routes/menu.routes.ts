import { Router } from 'express';
import { menuController } from '../controllers/menu.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Reading the menu is not gated: taking an order needs it, whatever the role.
// Menu is re-fetched on every order-modal open and the key is the user id, so a
// login shared across a floor of tablets shares one bucket — 120/min ran out and
// the order screen came up empty. Menu reads are one cheap query; give them room.
router.get('/', readLimit(60 * 1000, 600), menuController.getAllMenuItems);
router.post('/categories/bulk', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.createBulkCategories);
router.post('/', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.createMenuItem);
router.patch('/:id', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.updateMenuItem);
router.delete('/:id', requirePermission(Permission.MANAGE_MENU), writeLimit(), menuController.deleteMenuItem);

export default router;
