import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/', readLimit(60 * 1000, 600), inventoryController.getAllInventory);
router.get('/:id', readLimit(60 * 1000, 600), inventoryController.getInventoryById);
router.post('/', requirePermission(Permission.MANAGE_INVENTORY), writeLimit(), inventoryController.createInventory);
router.patch('/:id', requirePermission(Permission.MANAGE_INVENTORY), writeLimit(), inventoryController.updateInventory);
router.delete('/:id', requirePermission(Permission.MANAGE_INVENTORY), writeLimit(), inventoryController.deleteInventory);

export default router;
