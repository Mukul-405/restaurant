import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';

const router = Router();

router.post('/', bookingController.createBooking);

export default router;
