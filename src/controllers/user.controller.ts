import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { z } from 'zod';
import { Role } from '@prisma/client';

const createMemberSchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().min(10),
  password: z.string().min(6).optional(),
  role: z.enum(Object.values(Role) as [string, ...string[]]),
});

export class UserController {
  async createMember(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createMemberSchema.parse(req.body);
      const user = await userService.createMember({
        ...data,
        role: data.role as Role,
      });
      res.status(201).json({ message: 'Member created successfully', user });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }
      next(error);
    }
  }

  async blockMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await userService.blockMember(id);
      res.status(200).json({ message: 'Member blocked successfully', user: result });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  }

  async unblockMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await userService.unblockMember(id);
      res.status(200).json({ message: 'Member unblocked successfully', user: result });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  }

  async deleteMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await userService.deleteMember(id);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  }

  async getAllMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await userService.getAllMembers();
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
