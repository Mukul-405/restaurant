import { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.service';
import { normalizePhone } from '../utils/phone.util';
import { z } from 'zod';
import { logger } from '../config/logger';

const bookingSchema = z.object({
  guestName: z.string().trim().min(1, 'Guest name is required').max(200),
  guestPhone: z.string().trim().regex(/^\+?\d+$/, 'Guest phone must contain only digits (optional + allowed)').max(20).transform(normalizePhone),
  guestEmail: z.string().email().optional().or(z.literal('')),
  checkIn: z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Invalid checkIn date format' }),
  checkOut: z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Invalid checkOut date format' }),
  roomDiscountAmount: z.number().nonnegative().optional(),
  foodDiscountAmount: z.number().nonnegative().optional(),
  specialRequests: z.string().max(1000).optional(),
  totalAdults: z.number().int().min(1),
  totalChildren: z.number().int().min(0),
  rooms: z.array(z.object({
    roomCode: z.string().trim(),
    rateplanCode: z.string().trim(),
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
    roomNumber: z.string().trim().optional().nullable(),
    price: z.number().nonnegative().optional()
  })).min(1, 'At least one room is required').max(50),
  source: z.enum(['DIRECT', 'OTA']).default('DIRECT'),
  totalAmount: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional()
});

const searchBookingSchema = z.object({
  phone: z.string().optional(),
  status: z.enum(['ALL', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED']).optional().default('ALL'),
  date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export class BookingController {
  async createBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const data = bookingSchema.parse(req.body);
      
      const booking = await bookingService.createBooking(data as any);

      logger.info({ bookingId: booking.id }, 'Booking created');
      res.status(201).json({ message: 'Booking created successfully', booking });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation failed', errors: error.issues });
      }
      if (error.message && (error.message.includes('already booked') || error.message.includes('not exist') || error.message.includes('not available'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error }, 'Failed to create booking');
      next(error);
    }
  }

  async getBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const query = searchBookingSchema.parse(req.query);
      const result = await bookingService.searchBookings(query);
      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation failed', errors: error.issues });
      }
      logger.error({ err: error }, 'Failed to get bookings');
      next(error);
    }
  }

  async checkInBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { rooms } = req.body;
      if (!rooms || !Array.isArray(rooms)) {
        return res.status(400).json({ message: 'Rooms array is required for check-in' });
      }
      const booking = await bookingService.checkInBooking(id, rooms);
      logger.info({ bookingId: id }, 'Booking checked in');
      res.status(200).json({ message: 'Checked in successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('not available') || error.message.includes('status'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to check in booking');
      next(error);
    }
  }

  async getBookingById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const booking = await bookingService.getBookingById(id);
      res.status(200).json(booking);
    } catch (error: any) {
      if (error.message && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to get booking');
      next(error);
    }
  }
  async checkOutBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const schema = z.object({
        roomDiscountAmount: z.number().nonnegative().optional().default(0),
        foodDiscountAmount: z.number().nonnegative().optional().default(0),
      });
      const { roomDiscountAmount, foodDiscountAmount } = schema.parse(req.body);
      const booking = await bookingService.checkOutBooking(id, roomDiscountAmount, foodDiscountAmount);
      logger.info({ bookingId: id }, 'Booking checked out');
      res.status(200).json({ message: 'Checked out successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to check out booking');
      next(error);
    }
  }

  async cancelBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const booking = await bookingService.cancelBooking(id);
      logger.info({ bookingId: id }, 'Booking cancelled');
      res.status(200).json({ message: 'Booking cancelled successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to cancel booking');
      next(error);
    }
  }

  async editBookingRooms(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { rooms } = req.body;
      if (!rooms || !Array.isArray(rooms)) {
        return res.status(400).json({ message: 'Rooms array is required for editing rooms' });
      }
      const booking = await bookingService.editBookingRooms(id, rooms);
      logger.info({ bookingId: id }, 'Booking rooms edited');
      res.status(200).json({ message: 'Rooms edited successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status') || error.message.includes('occupied') || error.message.includes('exist'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to edit booking rooms');
      next(error);
    }
  }

  async extendCheckout(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { newCheckOut } = req.body;
      if (!newCheckOut || isNaN(Date.parse(newCheckOut))) {
        return res.status(400).json({ message: 'Invalid or missing newCheckOut date' });
      }
      const booking = await bookingService.extendCheckoutDate(id, newCheckOut);
      logger.info({ bookingId: id, newCheckOut }, 'Booking checkout date extended');
      res.status(200).json({ message: 'Checkout date extended successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status') || error.message.includes('greater than') || error.message.includes('Not enough rooms available'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to extend checkout date');
      next(error);
    }
  }

  async updateGuestDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const schema = z.object({
        guestName: z.string().trim().min(1, 'Guest name is required').max(100),
        guestPhone: z.string().trim().min(5, 'Valid phone number is required').max(20),
      });
      const data = schema.parse(req.body);
      const booking = await bookingService.updateGuestDetails(id, data.guestName, data.guestPhone);
      logger.info({ bookingId: id, guestName: data.guestName, guestPhone: data.guestPhone }, 'Booking guest details updated');
      res.status(200).json({ message: 'Guest details updated successfully', booking });
    } catch (error: any) {
      if (error.message && (error.message.includes('not found') || error.message.includes('status') || error.message.includes('Cannot edit'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to update booking guest details');
      next(error);
    }
  }

  async updatePaymentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const schema = z.object({
        paymentStatus: z.enum(['PENDING', 'PAID']).default('PAID'),
        paymentMode: z.enum(['CASH', 'CARD', 'UPI']),
      });
      const { paymentStatus, paymentMode } = schema.parse(req.body);
      const booking = await bookingService.updatePaymentStatus(id, paymentStatus, paymentMode);
      logger.info({ bookingId: id, paymentStatus, paymentMode }, 'Booking payment status updated');
      res.status(200).json({ message: 'Payment status updated successfully', booking });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation failed', errors: error.issues });
      }
      if (error.message && (error.message.includes('not found') || error.message.includes('status'))) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error, bookingId: req.params.id }, 'Failed to update booking payment status');
      next(error);
    }
  }

}

export const bookingController = new BookingController();
