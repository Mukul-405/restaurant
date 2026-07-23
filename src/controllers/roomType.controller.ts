import { Request, Response, NextFunction } from 'express';
import { roomTypeService } from '../services/roomType.service';
import { z } from 'zod';

const roomTypeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  roomCode: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  maxAdults: z.number().int().min(1),
  maxChildren: z.number().int().min(0),
  totalRooms: z.number().int().min(0),
  basePrice: z.number().min(0).optional().nullable(),
  extraPersonAmount: z.number().min(0).optional().nullable(),
  rateplanCodes: z.array(z.object({
    code: z.string().trim(),
    price: z.number()
  })).max(20).optional().nullable(),
  rooms: z.array(z.object({
    roomNumber: z.string().trim(),
    status: z.string().trim()
  })).max(100).optional().nullable(),
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
      const roomTypes = await roomTypeService.getAllRoomTypes();
      res.status(200).json(roomTypes);
    } catch (error) { next(error); }
  }

  async getAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate are required" });
      const availability = await roomTypeService.getAvailability(startDate as string, endDate as string);
      res.status(200).json(availability);
    } catch (error) { next(error); }
  }

  async getRoomTypeById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const roomType = await roomTypeService.getRoomTypeById(id);
      if (!roomType) return res.status(404).json({ message: 'Not found' });
      res.status(200).json(roomType);
    } catch (error) { next(error); }
  }

  async updateRoomType(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const data = roomTypeSchema.partial().parse(req.body);
      const roomType = await roomTypeService.updateRoomType(id, data as any);
      res.status(200).json({ message: 'Updated successfully', roomType });
    } catch (error) { next(error); }
  }

  async addRoom(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
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
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
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
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      await roomTypeService.deleteRoomType(id);
      res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) { next(error); }
  }
}

export const roomTypeController = new RoomTypeController();
