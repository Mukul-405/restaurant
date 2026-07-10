import { Router } from 'express';
import { roomTypeController } from '../controllers/roomType.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, roomTypeController.getAllRoomTypes);
router.get('/:id', authenticate, roomTypeController.getRoomTypeById);
router.post('/', authenticate, authorize(['ADMIN']), roomTypeController.createRoomType);
router.patch('/:id', authenticate, authorize(['ADMIN']), roomTypeController.updateRoomType);
router.post('/:id/rooms', authenticate, authorize(['ADMIN']), roomTypeController.addRoom);
router.delete('/:id/rooms/:roomNumber', authenticate, authorize(['ADMIN']), roomTypeController.deleteRoom);
router.delete('/:id', authenticate, authorize(['ADMIN']), roomTypeController.deleteRoomType);

export default router;
