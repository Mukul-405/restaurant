import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Applying authenticate middleware assuming all routes need to be protected
// Similar to other routes if applicable, if not you can adjust based on requirements
router.use(authenticate);

router.post('/', orderController.createOrder);
router.get('/', orderController.searchOrders);
// Must stay above '/:id', otherwise 'kots' is parsed as an order id.
router.get('/kots', authorize(['ADMIN']), orderController.getKots);
router.get('/:id', orderController.getOrderById);
router.post('/:id/transfer-to-room', orderController.transferToRoom);
router.put('/:id', orderController.updateOrder);

export default router;
