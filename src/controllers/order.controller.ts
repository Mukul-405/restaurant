import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { orderService } from '../services/order.service';
import { z } from 'zod';
import { OrderStatus, Role } from '@prisma/client';
import { logger } from '../config/logger';

// Data scoping, separate from the section permission: waiters see only their own
// orders, the two admin roles see everyone's.
const canSeeAllOrders = (role: string) => role === Role.ADMIN || role === Role.SUPERADMIN;

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  price: z.number().min(0),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(100),
  baseAmount: z.number().min(0),
  gstAmount: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  finalDiscountedAmount: z.number().min(0),
  tableNumber: z.number().int().positive().optional(),
  kotHistory: z.array(z.object({ menuItemId: z.number(), name: z.string().trim(), qty: z.number() })).max(500).optional(),
});

const updateOrderSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI']).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
  items: z.array(orderItemSchema).min(1).max(100).optional(),
  baseAmount: z.number().min(0).optional(),
  gstAmount: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  finalDiscountedAmount: z.number().min(0).optional(),
  tableNumber: z.number().int().positive().optional(),
  kotHistory: z.array(z.object({ menuItemId: z.number(), name: z.string().trim(), qty: z.number() })).max(500).optional(),
});

const searchOrderSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  userId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const kotQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class OrderController {
  async createOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = createOrderSchema.parse(req.body);
      const result = await orderService.createOrder({
        ...data,
        userId: req.user!.id,
      });
      logger.info({ orderId: result.id, userId: req.user!.id }, 'Order created');
      res.status(201).json(result);
    } catch (error) {
      logger.error({ err: error, userId: req.user?.id }, 'Failed to create order');
      next(error);
    }
  }

  async getOrderById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);

      const result = await orderService.getOrderById(id);

      if (!canSeeAllOrders(req.user!.role) && result.userId !== req.user!.id) {
        return res.status(403).json({ message: 'Forbidden: You do not own this order' });
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error, orderId: req.params.id }, 'Failed to get order');
      next(error);
    }
  }

  async updateOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);

      const existingOrder = await orderService.getOrderById(id);
      if (!canSeeAllOrders(req.user!.role) && existingOrder.userId !== req.user!.id) {
        return res.status(403).json({ message: 'Forbidden: You do not own this order' });
      }

      const data = updateOrderSchema.parse(req.body);
      const result = await orderService.updateOrder(id, data);
      logger.info({ orderId: id, userId: req.user!.id }, 'Order updated');
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error, orderId: req.params.id }, 'Failed to update order');
      next(error);
    }
  }

  async searchOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = searchOrderSchema.parse(req.query);

      // Enforce isolation: Waiters can only see their own orders
      if (!canSeeAllOrders(req.user!.role)) {
        query.userId = req.user!.id;
      }

      const result = await orderService.searchOrders(query);
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error }, 'Failed to search orders');
      next(error);
    }
  }
  async getKots(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = kotQuerySchema.parse(req.query);
      const result = await orderService.getKots(query);
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get KOTs');
      next(error);
    }
  }

  async transferToRoom(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);

      const existingOrder = await orderService.getOrderById(id);
      if (!canSeeAllOrders(req.user!.role) && existingOrder.userId !== req.user!.id) {
        return res.status(403).json({ message: 'Forbidden: You do not own this order' });
      }

      const { userRoomBookingId } = z.object({
        userRoomBookingId: z.number().int().positive()
      }).parse(req.body);

      const result = await orderService.transferToRoom(id, userRoomBookingId);
      logger.info({ orderId: id }, 'Order transferred to room');
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error, orderId: req.params.id }, 'Failed to transfer order to room');
      next(error);
    }
  }
}

export const orderController = new OrderController();
