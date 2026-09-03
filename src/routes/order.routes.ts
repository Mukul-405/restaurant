import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Peak season: one waiter can legitimately fire many orders/updates per minute.
router.post('/', requirePermission(Permission.MANAGE_ORDERS), writeLimit(60 * 1000, 60), orderController.createOrder);
router.get('/', requirePermission(Permission.MANAGE_ORDERS), readLimit(60 * 1000, 120), orderController.searchOrders);
router.get('/:id', requirePermission(Permission.MANAGE_ORDERS), readLimit(60 * 1000, 120), orderController.getOrderById);
router.post('/:id/transfer-to-room', requirePermission(Permission.MANAGE_ORDERS), writeLimit(60 * 1000, 60), orderController.transferToRoom);
router.put('/:id', requirePermission(Permission.MANAGE_ORDERS), writeLimit(60 * 1000, 60), orderController.updateOrder);

export default router;
