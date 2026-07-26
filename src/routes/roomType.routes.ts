import { Router } from 'express';
import { roomTypeController } from '../controllers/roomType.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.use(authenticate);

router.get('/', readLimit(), roomTypeController.getAllRoomTypes);
router.get('/availability', readLimit(), roomTypeController.getAvailability);
router.get('/:id', readLimit(), roomTypeController.getRoomTypeById);
router.post('/', authorize(['ADMIN']), writeLimit(), roomTypeController.createRoomType);
router.patch('/:id', authorize(['ADMIN']), writeLimit(), roomTypeController.updateRoomType);
router.post('/:id/rooms', authorize(['ADMIN']), writeLimit(), roomTypeController.addRoom);
router.delete('/:id/rooms/:roomNumber', authorize(['ADMIN']), writeLimit(), roomTypeController.deleteRoom);
router.delete('/:id', authorize(['ADMIN']), writeLimit(), roomTypeController.deleteRoomType);

export default router;
