import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { userService } from '../services/user.service';
import { z } from 'zod';
import { Permission, Role } from '@prisma/client';
import { logger } from '../config/logger';

// SUPERADMIN is provisioned by hand in the DB, so it is not offered here.
const assignableRoles = Object.values(Role).filter(r => r !== Role.SUPERADMIN);
const roleSchema = z.enum(assignableRoles as [string, ...string[]]);
const permissionsSchema = z.array(z.enum(Object.values(Permission) as [string, ...string[]]));

const createMemberSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phoneNumber: z.string().trim().min(10).max(15),
  password: z.string().min(12).max(128),
  role: roleSchema,
  permissions: permissionsSchema.default([]),
});

const updateMemberSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  role: roleSchema.optional(),
  permissions: permissionsSchema.optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(12).max(128),
});

export class UserController {
  async createMember(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createMemberSchema.parse(req.body);
      const user = await userService.createMember({
        ...data,
        role: data.role as Role,
        permissions: data.permissions as Permission[],
      });
      logger.info({ userId: user.id }, 'Member created');
      res.status(201).json({ message: 'Member created successfully', user });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }
      logger.error({ err: error }, 'Failed to create member');
      next(error);
    }
  }

  async updateMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = updateMemberSchema.parse(req.body);
      const user = await userService.updateMember(id, {
        ...data,
        role: data.role as Role | undefined,
        permissions: data.permissions as Permission[] | undefined,
      });
      logger.info({ userId: id }, 'Member updated');
      res.status(200).json({ message: 'Member updated successfully', user });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      logger.error({ err: error, userId: req.params.id }, 'Failed to update member');
      next(error);
    }
  }

  async blockMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await userService.blockMember(id);
      logger.info({ userId: id }, 'Member blocked');
      res.status(200).json({ message: 'Member blocked successfully', user: result });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      logger.error({ err: error, userId: req.params.id }, 'Failed to block member');
      next(error);
    }
  }

  async unblockMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await userService.unblockMember(id);
      logger.info({ userId: id }, 'Member unblocked');
      res.status(200).json({ message: 'Member unblocked successfully', user: result });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      logger.error({ err: error, userId: req.params.id }, 'Failed to unblock member');
      next(error);
    }
  }

  async deleteMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await userService.deleteMember(id);
      logger.info({ userId: id }, 'Member deleted');
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      logger.error({ err: error, userId: req.params.id }, 'Failed to delete member');
      next(error);
    }
  }

  async getAllMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await userService.getAllMembers();
      res.status(200).json(users);
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch members');
      next(error);
    }
  }

  async resetPassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const data = resetPasswordSchema.parse(req.body);
      const result = await userService.resetPassword(id, data.password, req.user!.id);
      logger.info({ userId: id, requesterId: req.user!.id }, 'Member password reset');
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      logger.error({ err: error, userId: req.params.id }, 'Failed to reset member password');
      next(error);
    }
  }
}

export const userController = new UserController();
