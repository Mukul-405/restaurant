import { Router } from 'express';
import { getRevenueAnalysis, getWaiterAnalysis, getBookingAnalysis, getChannelAnalysis } from '../controllers/analysis.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Only ADMIN can access analysis routes
router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/revenue', getRevenueAnalysis);
router.get('/waiter', getWaiterAnalysis);
router.get('/bookings', getBookingAnalysis);
router.get('/channel', getChannelAnalysis);

export default router;
