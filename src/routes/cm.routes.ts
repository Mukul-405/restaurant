import { Router } from 'express';
import { cmController } from '../controllers/cm.controller';
import { aiosellAuth } from '../middlewares/aiosellAuth.middleware';

const router = Router();

// Internal frontend routes (No Channel Manager Basic Auth required)
router.get('/inventory', cmController.fetchInventory);
router.post('/inventory/push', cmController.pushInventory);
router.get('/rates', cmController.fetchRates);
router.post('/rates/push', cmController.pushRates);
router.get('/reservations', cmController.fetchReservations);

// External Aiosell webhook routes (Require Aiosell Basic Auth)
router.use(aiosellAuth);
router.post('/update_reservation', cmController.updateReservation);

export default router;
