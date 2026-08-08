import { prisma } from '../config/prisma';

export const getRevenueAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const result = await prisma.order.aggregate({
    _sum: {
      baseAmount: true,
      gstAmount: true,
      finalDiscountedAmount: true,
    },
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  });

  const paymentModeGroup = await prisma.order.groupBy({
    by: ['paymentMode'],
    _sum: {
      baseAmount: true,
      gstAmount: true,
      finalDiscountedAmount: true,
    },
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  });

  const paymentModes = {
    CASH: { baseAmount: 0, gstAmount: 0, totalAmount: 0 },
    CARD: { baseAmount: 0, gstAmount: 0, totalAmount: 0 },
    UPI: { baseAmount: 0, gstAmount: 0, totalAmount: 0 },
  };

  paymentModeGroup.forEach((item) => {
    const base = Number(item._sum.baseAmount || 0);
    const gst = Number(item._sum.gstAmount || 0);
    const total = Number(item._sum.finalDiscountedAmount || 0);

    const mode = item.paymentMode === 'CARD' ? 'CARD' : item.paymentMode === 'UPI' ? 'UPI' : 'CASH';
    paymentModes[mode].baseAmount += base;
    paymentModes[mode].gstAmount += gst;
    paymentModes[mode].totalAmount += total;
  });

  return {
    totalBaseAmount: Number(result._sum.baseAmount || 0),
    totalGstAmount: Number(result._sum.gstAmount || 0),
    totalFinalDiscountedAmount: Number(result._sum.finalDiscountedAmount || 0),
    paymentModes,
    cashAmount: paymentModes.CASH.totalAmount,
    cardAmount: paymentModes.CARD.totalAmount,
    upiAmount: paymentModes.UPI.totalAmount,
  };
};

export const getWaiterAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const result = await prisma.order.groupBy({
    by: ['userId'],
    _sum: {
      finalDiscountedAmount: true,
    },
    _count: {
      id: true,
    },
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  });

  // Fetch user details for each waiter
  const userIds = result.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
    },
  });

  const waiterAnalysis = result.map((r) => {
    const user = users.find((u) => u.id === r.userId);
    return {
      userId: r.userId,
      waiterName: user?.name || 'Unknown',
      phoneNumber: user?.phoneNumber || 'N/A',
      totalOrders: r._count.id,
      totalRevenue: r._sum.finalDiscountedAmount || 0,
    };
  });

  return waiterAnalysis;
};

export const getBookingAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const dbResult = await prisma.$queryRaw<
    { totalRoomRevenue: number; totalBookings: number; totalRoomsSold: number }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('CHECKED_IN', 'CHECKED_OUT') THEN "totalAmount" ELSE 0 END), 0) as "totalRoomRevenue",
      COUNT(*)::int as "totalBookings",
      COALESCE(SUM(CASE WHEN status IN ('CHECKED_IN', 'CHECKED_OUT')
        THEN jsonb_array_length(CASE WHEN jsonb_typeof(rooms) = 'array' THEN rooms ELSE '[]'::jsonb END)
        ELSE 0 END), 0)::int as "totalRoomsSold"
    FROM "UserRoomBooking"
    WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      AND status <> 'CANCELLED'
  `;

  const { totalRoomRevenue, totalBookings, totalRoomsSold } = dbResult[0] || {
    totalRoomRevenue: 0,
    totalBookings: 0,
    totalRoomsSold: 0,
  };

  return {
    totalRoomRevenue: Number(totalRoomRevenue),
    totalBookings: Number(totalBookings),
    totalRoomsSold: Number(totalRoomsSold),
  };
};

export const getChannelAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const dbResult = await prisma.$queryRaw<{ channel: string; count: number }[]>`
    SELECT channel, COUNT(*)::int as count
    FROM "UserRoomBooking"
    WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} AND channel IS NOT NULL
    GROUP BY channel
  `;

  const channelBreakdown: Record<string, number> = {};
  dbResult.forEach(row => {
    channelBreakdown[row.channel] = Number(row.count);
  });

  return { channelBreakdown };
};

