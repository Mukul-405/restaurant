import { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.service';
import { z } from 'zod';

const bookingSchema = z.object({
  guestName: z.string().min(1, 'Guest name is required'),
  guestPhone: z.string().min(1, 'Guest phone is required'),
  guestEmail: z.string().email().optional().or(z.literal('')),
  checkIn: z.string(),
  checkOut: z.string(),
  specialRequests: z.string().optional(),
  totalAdults: z.number().int().min(1),
  totalChildren: z.number().int().min(0),
  rooms: z.array(z.object({
    roomCode: z.string(),
    rateplanCode: z.string(),
    adults: z.number().int(),
    children: z.number().int(),
    roomNumber: z.string()
  })).min(1, 'At least one room is required'),
  source: z.enum(['DIRECT', 'OTA']).default('DIRECT')
});

export class BookingController {
  async createBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const data = bookingSchema.parse(req.body);
      
      const booking = await bookingService.createBooking(data as any);
      
      res.status(201).json({ message: 'Booking created successfully', booking });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation failed', errors: error.issues });
      }
      if (error.message && (error.message.includes('already booked') || error.message.includes('not exist') || error.message.includes('not available'))) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }


}

export const bookingController = new BookingController();
