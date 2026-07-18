import { Request, Response, NextFunction } from 'express';
import { cmService } from '../services/cm.service';

class CmController {
  async updateReservation(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = req.body;
      
      if (!payload || !payload.action) {
        return res.status(400).json({ success: false, message: 'Invalid payload: missing action' });
      }

      await cmService.processReservation(payload);
      
      res.status(200).json({ success: true, message: 'Reservation Updated Successfully' });
    } catch (error: any) {
      console.error('Webhook error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async fetchInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
      }

      const data = await cmService.fetchInventory(startDate as string, endDate as string);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Fetch Inventory error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async fetchRates(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
      }

      const data = await cmService.fetchRates(startDate as string, endDate as string);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Fetch Rates error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async fetchReservations(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
      }

      const data = await cmService.fetchReservations(startDate as string, endDate as string);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Fetch Reservations error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }
  async pushInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates, toChannels } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ success: false, message: 'updates array is required in body' });
      }

      const data = await cmService.pushInventory(updates, toChannels);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Push Inventory error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }

  async pushRates(req: Request, res: Response, next: NextFunction) {
    try {
      const { updates, toChannels } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ success: false, message: 'updates array is required in body' });
      }

      const data = await cmService.pushRates(updates, toChannels);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('Push Rates error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  }
}

export const cmController = new CmController();
