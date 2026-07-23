import { Request, Response, NextFunction } from 'express';
import { getRevenueAnalysisService, getWaiterAnalysisService, getBookingAnalysisService, getChannelAnalysisService } from '../services/analysis.service';

function parseDateRange(query: any): { start?: Date; end?: Date; error?: string } {
  const { startDate, endDate } = query;
  if (!startDate || !endDate) {
    return { error: 'startDate and endDate query parameters are required' };
  }
  const start = new Date(startDate as string);
  const end = new Date(endDate as string);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: 'Invalid date format for startDate or endDate' };
  }
  if (start > end) {
    return { error: 'startDate cannot be after endDate' };
  }
  
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > ONE_YEAR_MS) {
    return { error: 'Date range cannot exceed 1 year. Please select a smaller range.' };
  }

  return { start, end };
}

export const getRevenueAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, error } = parseDateRange(req.query);
    if (error || !start || !end) return res.status(400).json({ error });

    const data = await getRevenueAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getWaiterAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, error } = parseDateRange(req.query);
    if (error || !start || !end) return res.status(400).json({ error });

    const data = await getWaiterAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getChannelAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, error } = parseDateRange(req.query);
    if (error || !start || !end) return res.status(400).json({ error });

    const data = await getChannelAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getBookingAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, error } = parseDateRange(req.query);
    if (error || !start || !end) return res.status(400).json({ error });

    const data = await getBookingAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};
