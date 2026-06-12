import { Request, Response, NextFunction } from 'express';
import { getRevenueAnalysisService, getWaiterAnalysisService } from '../services/analysis.service';

export const getRevenueAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required' });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startDate or endDate' });
    }

    if (start > end) {
      return res.status(400).json({ error: 'startDate cannot be after endDate' });
    }

    const data = await getRevenueAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getWaiterAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required' });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startDate or endDate' });
    }

    if (start > end) {
      return res.status(400).json({ error: 'startDate cannot be after endDate' });
    }

    const data = await getWaiterAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};
