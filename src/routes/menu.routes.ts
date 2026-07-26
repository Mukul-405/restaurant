import { Router } from 'express';
import { menuController } from '../controllers/menu.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.use(authenticate);

// Menu is re-fetched on every order screen open, so reads get the order-side ceiling.
router.get('/', readLimit(60 * 1000, 120), menuController.getAllMenuItems);
router.post('/categories/bulk', authorize(['ADMIN']), writeLimit(), menuController.createBulkCategories);
router.post('/', authorize(['ADMIN']), writeLimit(), menuController.createMenuItem);
router.patch('/:id', authorize(['ADMIN']), writeLimit(), menuController.updateMenuItem);
router.delete('/:id', authorize(['ADMIN']), writeLimit(), menuController.deleteMenuItem);

export default router;
