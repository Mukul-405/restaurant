import { Router } from 'express';
import { cmController } from '../controllers/cm.controller';
import { aiosellAuth } from '../middlewares/aiosellAuth.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Internal frontend routes (Require JWT auth + ADMIN role)
router.get('/inventory', authenticate, authorize(['ADMIN']), cmController.fetchInventory);
router.post('/inventory/push', authenticate, authorize(['ADMIN']), cmController.pushInventory);
router.get('/rates', authenticate, authorize(['ADMIN']), cmController.fetchRates);
router.post('/rates/push', authenticate, authorize(['ADMIN']), cmController.pushRates);
router.get('/reservations', authenticate, authorize(['ADMIN']), cmController.fetchReservations);

// External Aiosell webhook routes (Require Aiosell Basic Auth)
router.use(aiosellAuth);
router.post('/update_reservation', cmController.updateReservation);

export default router;
