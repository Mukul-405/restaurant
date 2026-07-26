import { Router } from 'express';
import { roomTypeController } from '../controllers/roomType.controller';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Reads stay open: taking a reservation needs room types and availability.
router.get('/', readLimit(), roomTypeController.getAllRoomTypes);
router.get('/availability', readLimit(), roomTypeController.getAvailability);
router.get('/:id', readLimit(), roomTypeController.getRoomTypeById);
router.post('/', requirePermission(Permission.MANAGE_ROOMS), writeLimit(), roomTypeController.createRoomType);
router.patch('/:id', requirePermission(Permission.MANAGE_ROOMS), writeLimit(), roomTypeController.updateRoomType);
router.post('/:id/rooms', requirePermission(Permission.MANAGE_ROOMS), writeLimit(), roomTypeController.addRoom);
router.delete('/:id/rooms/:roomNumber', requirePermission(Permission.MANAGE_ROOMS), writeLimit(), roomTypeController.deleteRoom);
router.delete('/:id', requirePermission(Permission.MANAGE_ROOMS), writeLimit(), roomTypeController.deleteRoomType);

export default router;
