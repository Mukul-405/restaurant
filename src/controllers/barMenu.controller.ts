import { Request, Response, NextFunction } from 'express';
import { barMenuService } from '../services/barMenu.service';
import { z } from 'zod';
import { logger } from '../config/logger';

const bulkCategoriesSchema = z.object({
  categories: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
});

const createBarMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.number().min(0),
  description: z.string().trim().max(500).optional(),
  categoryName: z.string().trim().min(1).max(100),
});

const updateBarMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  price: z.number().min(0).optional(),
  description: z.string().trim().max(500).optional(),
  isAvailable: z.boolean().optional(),
  categoryName: z.string().trim().min(1).max(100).optional(),
});

export class BarMenuController {
  async createBulkCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = bulkCategoriesSchema.parse(req.body);
      const result = await barMenuService.bulkCreateCategories(data.categories);
      logger.info({ count: data.categories.length }, 'Bar menu categories created');
      res.status(201).json(result);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create bar menu categories');
      next(error);
    }
  }

  async createBarMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createBarMenuItemSchema.parse(req.body);
      const result = await barMenuService.createBarMenuItem(data);
      logger.info({ barMenuItemId: result.id }, 'Bar menu item created');
      res.status(201).json(result);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create bar menu item');
      next(error);
    }
  }

  async getAllBarMenuItems(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await barMenuService.getAllBarMenuItems();
      res.status(200).json(items);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get bar menu items');
      next(error);
    }
  }

  async updateBarMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });

      const data = updateBarMenuItemSchema.parse(req.body);
      const result = await barMenuService.updateBarMenuItem(id, data);
      logger.info({ barMenuItemId: id }, 'Bar menu item updated');
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error, barMenuItemId: req.params.id }, 'Failed to update bar menu item');
      next(error);
    }
  }

  async deleteBarMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });

      await barMenuService.deleteBarMenuItem(id);
      logger.info({ barMenuItemId: id }, 'Bar menu item deleted');
      res.status(200).json({ message: 'Bar menu item deleted successfully' });
    } catch (error) {
      logger.error({ err: error, barMenuItemId: req.params.id }, 'Failed to delete bar menu item');
      next(error);
    }
  }
}

export const barMenuController = new BarMenuController();
