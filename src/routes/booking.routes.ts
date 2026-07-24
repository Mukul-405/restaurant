import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', bookingController.createBooking);
router.get('/', bookingController.getBookings);
router.get('/:id', bookingController.getBookingById);
router.patch('/:id/check-in', bookingController.checkInBooking);
router.patch('/:id/check-out', bookingController.checkOutBooking);
router.patch('/:id/edit-rooms', bookingController.editBookingRooms);

export default router;
