import { Request, Response, NextFunction } from 'express';
import { getRevenueAnalysisService, getWaiterAnalysisService, getBookingAnalysisService, getChannelAnalysisService, getOrderItemAnalysisService, getDailyBillSummaryService } from '../services/analysis.service';
import { logger } from '../config/logger';

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
    logger.error({ err: error }, 'Failed to get revenue analysis');
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
    logger.error({ err: error }, 'Failed to get waiter analysis');
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
    logger.error({ err: error }, 'Failed to get channel analysis');
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
    logger.error({ err: error }, 'Failed to get booking analysis');
    next(error);
  }
};

export const getOrderItemAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, error } = parseDateRange(req.query);
    if (error || !start || !end) return res.status(400).json({ error });

    const data = await getOrderItemAnalysisService(start, end);
    res.status(200).json(data);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get order item analysis');
    next(error);
  }
};

export const getDailyBillSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end, error } = parseDateRange(req.query);
    if (error || !start || !end) return res.status(400).json({ error });

    const data = await getDailyBillSummaryService(start, end);
    res.status(200).json(data);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get daily bill summary');
    next(error);
  }
};


