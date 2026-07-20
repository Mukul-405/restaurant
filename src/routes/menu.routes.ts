import { Router } from 'express';
import { menuController } from '../controllers/menu.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Authenticated/Authorized endpoints
router.get('/', authenticate, menuController.getAllMenuItems);
router.post('/categories/bulk', authenticate, authorize(['ADMIN']), menuController.createBulkCategories);
router.post('/', authenticate, authorize(['ADMIN']), menuController.createMenuItem);
router.patch('/:id', authenticate, authorize(['ADMIN']), menuController.updateMenuItem);
router.delete('/:id', authenticate, authorize(['ADMIN']), menuController.deleteMenuItem);

export default router;
