import { Request, Response, NextFunction } from 'express';
import { roomTypeService } from '../services/roomType.service';
import { z } from 'zod';

const roomTypeSchema = z.object({
  name: z.string().min(1),
  roomCode: z.string().min(1),
  description: z.string().optional(),
  maxAdults: z.number().int().min(1),
  maxChildren: z.number().int().min(0),
  totalRooms: z.number().int().min(0),
  basePrice: z.number().min(0).optional().nullable(),
  extraPersonAmount: z.number().min(0).optional().nullable(),
  rateplanCodes: z.array(z.object({
    code: z.string(),
    price: z.number()
  })).optional().nullable(),
  rooms: z.array(z.any()).optional().nullable(),
  isActive: z.boolean().optional(),
});

export class RoomTypeController {
  async createRoomType(req: Request, res: Response, next: NextFunction) {
    try {
      const data = roomTypeSchema.parse(req.body);
      const roomType = await roomTypeService.createRoomType(data as any);
      res.status(201).json({ message: 'Room type created', roomType });
    } catch (error) { next(error); }
  }

  async getAllRoomTypes(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const roomTypes = await roomTypeService.getAllRoomTypes(startDate as string, endDate as string);
      res.status(200).json(roomTypes);
    } catch (error) { next(error); }
  }

  async getRoomTypeById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const roomType = await roomTypeService.getRoomTypeById(id);
      if (!roomType) return res.status(404).json({ message: 'Not found' });
      res.status(200).json(roomType);
    } catch (error) { next(error); }
  }

  async updateRoomType(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const data = roomTypeSchema.partial().parse(req.body);
      const roomType = await roomTypeService.updateRoomType(id, data as any);
      res.status(200).json({ message: 'Updated successfully', roomType });
    } catch (error) { next(error); }
  }

  async addRoom(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      // Expected body: { roomNumber: '101', status: 'no status', userRoomBookingId: '' }
      const { roomNumber, status } = req.body;
      if (!roomNumber) {
        return res.status(400).json({ message: 'Room number is required' });
      }
      const roomType = await roomTypeService.addRoomToType(id, { roomNumber, status: status || 'no status' });
      res.status(200).json({ message: 'Room added successfully', roomType });
    } catch (error: any) { 
      if (error.message && (error.message.includes('already exists') || error.message.includes('Maximum limit'))) {
        return res.status(400).json({ message: error.message });
      }
      next(error); 
    }
  }

  async deleteRoom(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      const roomNumber = req.params.roomNumber as string;
      if (!roomNumber) {
        return res.status(400).json({ message: 'Room number is required' });
      }
      const roomType = await roomTypeService.deleteRoomFromType(id, roomNumber);
      res.status(200).json({ message: 'Room deleted successfully', roomType });
    } catch (error) { next(error); }
  }

  async deleteRoomType(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      await roomTypeService.deleteRoomType(id);
      res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) { next(error); }
  }
}

export const roomTypeController = new RoomTypeController();
