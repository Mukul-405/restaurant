import { Request, Response, NextFunction } from 'express';
import { menuService } from '../services/menu.service';
import { z } from 'zod';

const bulkCategoriesSchema = z.object({
  categories: z.array(z.string()).min(1),
});

const createMenuItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0),
  description: z.string().optional(),
  categoryName: z.string().min(1),
});

const updateMenuItemSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  description: z.string().optional(),
  isAvailable: z.boolean().optional(),
  categoryName: z.string().min(1).optional(),
});

export class MenuController {
  async createBulkCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = bulkCategoriesSchema.parse(req.body);
      const result = await menuService.bulkCreateCategories(data.categories);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createMenuItemSchema.parse(req.body);
      const result = await menuService.createMenuItem(data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }



  async getAllMenuItems(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await menuService.getAllMenuItems();
      res.status(200).json(items);
    } catch (error) {
      next(error);
    }
  }

  async updateMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });

      const data = updateMenuItemSchema.parse(req.body);
      const result = await menuService.updateMenuItem(id, data);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });

      await menuService.deleteMenuItem(id);
      res.status(200).json({ message: 'Menu item deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const menuController = new MenuController();
