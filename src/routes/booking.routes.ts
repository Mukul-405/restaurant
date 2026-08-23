import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requirePermission(Permission.MANAGE_RESERVATIONS));

// Peak season: front desk fires many check-ins/check-outs per minute.
router.post('/', writeLimit(60 * 1000, 60), bookingController.createBooking);
router.get('/', readLimit(60 * 1000, 120), bookingController.getBookings);
router.get('/:id', readLimit(60 * 1000, 120), bookingController.getBookingById);
router.patch('/:id/check-in', writeLimit(60 * 1000, 60), bookingController.checkInBooking);
router.patch('/:id/check-out', writeLimit(60 * 1000, 60), bookingController.checkOutBooking);
router.patch('/:id/extend-checkout', writeLimit(60 * 1000, 60), bookingController.extendCheckout);
router.patch('/:id/cancel', writeLimit(60 * 1000, 60), bookingController.cancelBooking);
router.patch('/:id/edit-rooms', writeLimit(60 * 1000, 60), bookingController.editBookingRooms);

export default router;
