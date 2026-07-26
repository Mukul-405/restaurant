import { Router } from 'express';
import { getRevenueAnalysis, getWaiterAnalysis, getBookingAnalysis, getChannelAnalysis } from '../controllers/analysis.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { readLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Only ADMIN can access analysis routes
router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/revenue', readLimit(), getRevenueAnalysis);
router.get('/waiter', readLimit(), getWaiterAnalysis);
router.get('/bookings', readLimit(), getBookingAnalysis);
router.get('/channel', readLimit(), getChannelAnalysis);

export default router;
