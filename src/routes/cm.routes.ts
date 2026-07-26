import { Router } from 'express';
import { cmController } from '../controllers/cm.controller';
import { aiosellAuth } from '../middlewares/aiosellAuth.middleware';
import { authenticate, requirePermission } from '../middlewares/auth.middleware';
import { readLimit, writeLimit } from '../middlewares/rateLimit.middleware';
import { Permission } from '@prisma/client';

const router = Router();

// Internal frontend routes — the "Room Status" sidebar section.
router.get('/inventory', authenticate, requirePermission(Permission.VIEW_ROOM_STATUS), readLimit(), cmController.fetchInventory);
router.post('/inventory/push', authenticate, requirePermission(Permission.VIEW_ROOM_STATUS), writeLimit(), cmController.pushInventory);
router.get('/rates', authenticate, requirePermission(Permission.VIEW_ROOM_STATUS), readLimit(), cmController.fetchRates);
router.post('/rates/push', authenticate, requirePermission(Permission.VIEW_ROOM_STATUS), writeLimit(), cmController.pushRates);
router.get('/reservations', authenticate, requirePermission(Permission.VIEW_ROOM_STATUS), readLimit(), cmController.fetchReservations);

// External Aiosell webhook routes (Require Aiosell Basic Auth)
router.use(aiosellAuth);
router.post('/update_reservation', cmController.updateReservation);

export default router;
