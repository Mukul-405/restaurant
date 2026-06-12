import { Router } from 'express';
import { getRevenueAnalysis, getWaiterAnalysis } from '../controllers/analysis.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Only ADMIN can access analysis routes
router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/revenue', getRevenueAnalysis);
router.get('/waiter', getWaiterAnalysis);

export default router;
