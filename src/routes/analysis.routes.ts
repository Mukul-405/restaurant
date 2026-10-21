import { Router } from 'express';
import { getRevenueAnalysis, getWaiterAnalysis, getBookingAnalysis, getChannelAnalysis, getOrderItemAnalysis, getDailyBillSummary, getHotelRevenueAnalysis, getHotelDailyBillSummary } from '../controllers/analysis.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requirePermission(Permission.VIEW_ANALYSIS));

router.get('/revenue', readLimit(), getRevenueAnalysis);
router.get('/waiter', readLimit(), getWaiterAnalysis);
router.get('/bookings', readLimit(), getBookingAnalysis);
router.get('/hotel-revenue', readLimit(), getHotelRevenueAnalysis);
router.get('/channel', readLimit(), getChannelAnalysis);
router.get('/order-items', readLimit(), getOrderItemAnalysis);
router.get('/daily-bills', readLimit(), getDailyBillSummary);
router.get('/hotel-daily-bills', readLimit(), getHotelDailyBillSummary);

export default router;

