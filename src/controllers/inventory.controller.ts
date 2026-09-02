import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { inventoryService } from '../services/inventory.service';
import { logger } from '../config/logger';

const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(200),
  quantity: z.number().positive('Quantity must be greater than 0'),
  perItemPrice: z.number().min(0, 'Per item price cannot be negative'),
  totalPrice: z.number().min(0).optional(),
});

const createInventorySchema = z.object({
  date: z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Invalid date format' }),
  items: z.array(inventoryItemSchema).min(1, 'At least one item is required'),
  totalPrice: z.number().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const updateInventorySchema = z.object({
  date: z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional(),
  items: z.array(inventoryItemSchema).min(1, 'At least one item is required').optional(),
  totalPrice: z.number().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export class InventoryController {
  async createInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createInventorySchema.parse(req.body);
      const result = await inventoryService.createInventory(data as any);
      logger.info({ inventoryId: result.id, totalPrice: result.totalPrice }, 'Inventory record created');
      res.status(201).json(result);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create inventory record');
      next(error);
    }
  }

  async getAllInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, page, limit, search } = req.query;
      const filter = {
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        search: search ? String(search) : undefined,
        page: page ? parseInt(String(page), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined,
      };

      const result = await inventoryService.getAllInventory(filter);
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get inventory records');
      next(error);
    }
  }

  async getInventoryById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ message: 'Invalid inventory ID' });
        return;
      }

      const result = await inventoryService.getInventoryById(id);
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error, id: req.params.id }, 'Failed to get inventory record by ID');
      next(error);
    }
  }

  async updateInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ message: 'Invalid inventory ID' });
        return;
      }

      const data = updateInventorySchema.parse(req.body);
      const result = await inventoryService.updateInventory(id, data as any);
      logger.info({ inventoryId: id }, 'Inventory record updated');
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error, id: req.params.id }, 'Failed to update inventory record');
      next(error);
    }
  }

  async deleteInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ message: 'Invalid inventory ID' });
        return;
      }

      await inventoryService.deleteInventory(id);
      logger.info({ inventoryId: id }, 'Inventory record deleted');
      res.status(200).json({ message: 'Inventory record deleted successfully' });
    } catch (error) {
      logger.error({ err: error, id: req.params.id }, 'Failed to delete inventory record');
      next(error);
    }
  }
}

export const inventoryController = new InventoryController();
