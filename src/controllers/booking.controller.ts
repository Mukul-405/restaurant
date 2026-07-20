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
    roomNumber: z.string().optional().nullable()
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

  async getBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone } = req.query;
      const phoneStr = typeof phone === 'string' ? phone : undefined;
      const bookings = await bookingService.getBookingsByPhone(phoneStr);
      res.status(200).json(bookings);
    } catch (error) {
      next(error);
    }
  }

  async checkInBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const { rooms } = req.body;
      if (!rooms || !Array.isArray(rooms)) {
        return res.status(400).json({ message: 'Rooms array is required for check-in' });
      }
      const booking = await bookingService.checkInBooking(id, rooms);
      res.status(200).json({ message: 'Checked in successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('not available') || error.message.includes('status'))) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }
  async checkOutBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const booking = await bookingService.checkOutBooking(id);
      res.status(200).json({ message: 'Checked out successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status'))) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }
  async editBookingRooms(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const { rooms } = req.body;
      if (!rooms || !Array.isArray(rooms)) {
        return res.status(400).json({ message: 'Rooms array is required for editing rooms' });
      }
      const booking = await bookingService.editBookingRooms(id, rooms);
      res.status(200).json({ message: 'Rooms edited successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status') || error.message.includes('occupied') || error.message.includes('exist'))) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  }

}

export const bookingController = new BookingController();
