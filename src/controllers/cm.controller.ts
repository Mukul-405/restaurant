import { Request, Response, NextFunction } from 'express';
import { cmService } from '../services/cm.service';
import { z } from 'zod';
import { logger } from '../config/logger';

const baseWebhookSchema = z.object({
  bookingId: z.string(),
  channel: z.string(),
  hotelCode: z.string(),
});

const bookOrModifySchema = baseWebhookSchema.extend({
  action: z.enum(['book', 'modify']),
  cmBookingId: z.string().optional().nullable(),
  segment: z.string(),
  guest: z.object({
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    address: z.any().optional().nullable(),
  }).optional().nullable(),
  checkin: z.string(),
  checkout: z.string(),
  bookedOn: z.string(),
  rooms: z.array(z.object({
    roomCode: z.string(),
    rateplanCode: z.string(),
    guestName: z.string().optional().nullable(),
    occupancy: z.object({
      adults: z.number().int().min(1),
      children: z.number().int().min(0),
    }).optional(),
    prices: z.array(z.object({
      date: z.string(),
      sellRate: z.number(),
    })).optional(),
  })).min(1),
  amount: z.object({
    amountAfterTax: z.number(),
    amountBeforeTax: z.number(),
    tax: z.number(),
    currency: z.string(),
    commission: z.number().optional().nullable(),
    tcs: z.number().optional().nullable(),
    tds: z.number().optional().nullable(),
  }),
  pah: z.boolean(),
  specialRequests: z.string().optional().nullable(),
});

const cancelSchema = baseWebhookSchema.extend({
  action: z.literal('cancel'),
});

const webhookPayloadSchema = z.discriminatedUnion('action', [
  bookOrModifySchema,
  cancelSchema
]);

const cmDateQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'startDate cannot be after endDate',
  path: ['startDate'],
});

const basePushUpdateSchema = z.object({
  hotelCode: z.string().optional(),
  toChannels: z.array(z.string()).optional(),
});

const pushDateRange = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const inventoryPushSchema = basePushUpdateSchema.extend({
  updates: z.array(pushDateRange.extend({
    rooms: z.array(z.object({
      roomCode: z.string(),
      available: z.number().int().min(0).optional(),
      restrictions: z.any().optional()
    })).min(1)
  })).min(1)
});

const ratesPushSchema = basePushUpdateSchema.extend({
  updates: z.array(pushDateRange.extend({
    rates: z.array(z.object({
      roomCode: z.string(),
      rateplanCode: z.string(),
      rate: z.number().min(0).optional(),
      restrictions: z.any().optional()
    })).min(1)
  })).min(1)
});

class CmController {
  async updateReservation(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = webhookPayloadSchema.parse(req.body);

      await cmService.processReservation(payload);

      // Per-action message, matching the Aiosell docs exactly.
      const messages = {
        book: 'Reservation Updated Successfully',
        modify: 'Reservation Modified Successfully',
        cancel: 'Reservation Cancelled Successfully',
      } as const;
      logger.info({ bookingId: payload.bookingId, action: payload.action }, 'CM reservation processed');
      res.status(200).json({ success: true, message: messages[payload.action] });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid webhook payload', errors: error.issues });
      }

      logger.error({ err: error }, 'Failed to process CM reservation');
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async fetchInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = cmDateQuerySchema.parse(req.query);

      const data = await cmService.fetchInventory(startDate, endDate);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid query parameters', errors: error.issues });
      }

      logger.error({ err: error }, 'Failed to fetch CM inventory');
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async fetchRates(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = cmDateQuerySchema.parse(req.query);

      const data = await cmService.fetchRates(startDate, endDate);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid query parameters', errors: error.issues });
      }

      logger.error({ err: error }, 'Failed to fetch CM rates');
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async fetchReservations(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = cmDateQuerySchema.parse(req.query);

      const data = await cmService.fetchReservations(startDate, endDate);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid query parameters', errors: error.issues });
      }

      logger.error({ err: error }, 'Failed to fetch CM reservations');
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }
  async pushInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates, toChannels } = inventoryPushSchema.parse(req.body);

      const data = await cmService.pushInventory(updates, toChannels);
      logger.info({ toChannels }, 'CM inventory pushed');
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid push payload', errors: error.issues });
      }

      logger.error({ err: error }, 'Failed to push CM inventory');
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async pushRates(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates, toChannels } = ratesPushSchema.parse(req.body);

      const data = await cmService.pushRates(updates, toChannels);
      logger.info({ toChannels }, 'CM rates pushed');
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid push payload', errors: error.issues });
      }

      logger.error({ err: error }, 'Failed to push CM rates');
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }
}

export const cmController = new CmController();
