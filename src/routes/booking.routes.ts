import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';

const router = Router();

router.post('/', bookingController.createBooking);
router.get('/', bookingController.getBookings);
router.patch('/:id/check-in', bookingController.checkInBooking);
router.patch('/:id/check-out', bookingController.checkOutBooking);
router.patch('/:id/edit-rooms', bookingController.editBookingRooms);

export default router;
