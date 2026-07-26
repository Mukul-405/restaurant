import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.use(authenticate);


router.post('/', writeLimit(60 * 1000, 60), orderController.createOrder);
router.get('/', readLimit(60 * 1000, 120), orderController.searchOrders);

// Must stay above '/:id', otherwise 'kots' is parsed as an order id.
router.get('/kots', authorize(['ADMIN']), readLimit(), orderController.getKots);
router.get('/:id', readLimit(60 * 1000, 120), orderController.getOrderById);
router.post('/:id/transfer-to-room', writeLimit(60 * 1000, 60), orderController.transferToRoom);
router.put('/:id', writeLimit(60 * 1000, 60), orderController.updateOrder);

export default router;
