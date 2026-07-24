import { Request, Response, NextFunction } from 'express';
import { cmService } from '../services/cm.service';
import { z } from 'zod';

const baseWebhookSchema = z.object({
  bookingId: z.string(),
  channel: z.string(),
});

const bookOrModifySchema = baseWebhookSchema.extend({
  action: z.enum(['book', 'modify']),
  guest: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.any().optional(),
  }),
  checkin: z.string(),
  checkout: z.string(),
  bookedOn: z.string(),
  rooms: z.array(z.object({
    roomCode: z.string(),
    rateplanCode: z.string(),
    occupancy: z.object({
      adults: z.number().int().min(1),
      children: z.number().int().min(0),
    }).optional(),
  })).min(1),
  amount: z.object({
    amountAfterTax: z.number(),
    tax: z.number(),
    commission: z.number().optional(),
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
      
      res.status(200).json({ success: true, message: 'Reservation Updated Successfully' });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid webhook payload', errors: error.issues });
      }
      console.error('Webhook error:', error);
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
      console.error('Fetch Inventory error:', error);
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
      console.error('Fetch Rates error:', error);
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
      console.error('Fetch Reservations error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }
  async pushInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates, toChannels } = inventoryPushSchema.parse(req.body);

      const data = await cmService.pushInventory(updates, toChannels);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid push payload', errors: error.issues });
      }
      console.error('Push Inventory error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async pushRates(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates, toChannels } = ratesPushSchema.parse(req.body);

      const data = await cmService.pushRates(updates, toChannels);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'Invalid push payload', errors: error.issues });
      }
      console.error('Push Rates error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }
}

export const cmController = new CmController();
