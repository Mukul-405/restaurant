import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { orderService } from '../services/order.service';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().min(0),
});

const createOrderSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
  items: z.array(orderItemSchema).min(1),
  baseAmount: z.number().min(0),
  gstAmount: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  finalDiscountedAmount: z.number().min(0),
  tableNumber: z.number().int().positive().optional(),
  kotHistory: z.any().optional(),
});

const updateOrderSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  cancellationReason: z.string().optional(),
  items: z.array(orderItemSchema).min(1).optional(),
  baseAmount: z.number().min(0).optional(),
  gstAmount: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  finalDiscountedAmount: z.number().min(0).optional(),
  tableNumber: z.number().int().positive().optional(),
  kotHistory: z.any().optional(),
});

const searchOrderSchema = z.object({
  id: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  phoneNumber: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  userId: z.string().optional(),
  page: z.string().optional().default('1').transform(val => parseInt(val)),
  limit: z.string().optional().default('10').transform(val => parseInt(val)),
});

export class OrderController {
  async createOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = createOrderSchema.parse(req.body);
      const result = await orderService.createOrder({
        ...data,
        userId: req.user!.id,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });

      const result = await orderService.getOrderById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });

      const data = updateOrderSchema.parse(req.body);
      const result = await orderService.updateOrder(id, data);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async searchOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = searchOrderSchema.parse(req.query);
      
      // Enforce isolation: Waiters can only see their own orders
      if (req.user!.role !== 'ADMIN') {
        query.userId = req.user!.id;
      }

      const result = await orderService.searchOrders(query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();
