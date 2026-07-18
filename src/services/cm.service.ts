import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class CmService {
  async processReservation(payload: any) {
    const { action, bookingId, channel } = payload;

    if (action === 'book') {
      await this.createBooking(payload);
    } else if (action === 'modify') {
      await this.modifyBooking(payload);
    } else if (action === 'cancel') {
      await this.cancelBooking(bookingId, channel);
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }
  }

  private mapPayloadToDbFields(payload: any) {
    const bookedOnDate = new Date(payload.bookedOn.replace(' ', 'T'));

    return {
      bookingId: payload.bookingId,
      source: 'OTA' as any,
      channel: payload.channel,
      guestName: `${payload.guest.firstName} ${payload.guest.lastName}`.trim(),
      guestEmail: payload.guest.email,
      guestPhone: payload.guest.phone || 'N/A', // fallback if empty
      guestAddress: payload.guest.address || {},
      checkIn: new Date(payload.checkin),
      checkOut: new Date(payload.checkout),
      rooms: (payload.rooms || []).map((r: any, index: number) => ({
        id: index,
        roomCode: r.roomCode,
        rateplanCode: r.rateplanCode,
        adults: r.occupancy?.adults || 1,
        children: r.occupancy?.children || 0,
        roomNumber: ''
      })),
      totalAmount: payload.amount.amountAfterTax,
      taxAmount: payload.amount.tax,
      commission: payload.amount.commission || null,
      paymentStatus: payload.pah ? ('PENDING' as any) : ('PAID' as any),
      payAtHotel: payload.pah,
      status: 'RESERVED' as any,
      specialRequests: payload.specialRequests || null,
      bookedOn: bookedOnDate,
      webhookPayload: payload,
    };
  }

  private async createBooking(payload: any) {
    const data = this.mapPayloadToDbFields(payload);

    await prisma.userRoomBooking.create({
      data
    });
  }

  private async modifyBooking(payload: any) {
    // Aiosell says modify payload is the new full state.
    // We should find the existing booking by channel and bookingId.
    const existing = await prisma.userRoomBooking.findFirst({
      where: {
        bookingId: payload.bookingId,
        channel: payload.channel
      }
    });

    if (!existing) {
      // If it doesn't exist, we can just create it to be safe, or throw error.
      // Creating is usually safer for out-of-order webhooks.
      await this.createBooking(payload);
      return;
    }

    const data = this.mapPayloadToDbFields(payload);

    await prisma.userRoomBooking.update({
      where: { id: existing.id },
      data
    });
  }

  private async cancelBooking(bookingId: string, channel: string) {
    const existing = await prisma.userRoomBooking.findFirst({
      where: {
        bookingId: bookingId,
        channel: channel
      }
    });

    if (existing) {
      await prisma.userRoomBooking.update({
        where: { id: existing.id },
        data: {
          status: 'CANCELLED' as any
        }
      });
    }
  }

  async fetchInventory(startDate: string, endDate: string) {
    const hotelCode = process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';
    const username = process.env.AIOSELL_USERNAME || 'sandbox';
    const password = process.env.AIOSELL_PASSWORD || 'sandbox123';

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const payload = {
      type: "inventory",
      hotelCode,
      startDate,
      endDate
    };

    const pmsSlug = process.env.AIOSELL_PMS_SLUG || 'sample-pms';
    const response = await fetch(`https://live.aiosell.com/api/v2/cm/data/${pmsSlug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  async fetchRates(startDate: string, endDate: string) {
    const hotelCode = process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';
    const username = process.env.AIOSELL_USERNAME || 'sandbox';
    const password = process.env.AIOSELL_PASSWORD || 'sandbox123';

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const payload = {
      type: "rates",
      hotelCode,
      startDate,
      endDate
    };

    const pmsSlug = process.env.AIOSELL_PMS_SLUG || 'sample-pms';
    const response = await fetch(`https://live.aiosell.com/api/v2/cm/data/${pmsSlug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  async fetchReservations(startDate: string, endDate: string) {
    const hotelCode = process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';
    const username = process.env.AIOSELL_USERNAME || 'sandbox';
    const password = process.env.AIOSELL_PASSWORD || 'sandbox123';

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const payload = {
      type: "reservation",
      hotelCode,
      startDate,
      endDate
    };

    const pmsSlug = process.env.AIOSELL_PMS_SLUG || 'sample-pms';
    const response = await fetch(`https://live.aiosell.com/api/v2/cm/data/${pmsSlug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  async pushInventory(updates: any[], toChannels?: string[]) {
    const hotelCode = process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';
    const username = process.env.AIOSELL_USERNAME || 'sandbox';
    const password = process.env.AIOSELL_PASSWORD || 'sandbox123';
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    
    const payload: any = {
      hotelCode,
      updates
    };

    if (toChannels && toChannels.length > 0) {
      payload.toChannels = toChannels;
    }

    const pmsSlug = process.env.AIOSELL_PMS_SLUG || 'sample-pms';
    const response = await fetch(`https://live.aiosell.com/api/v2/cm/update/${pmsSlug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  async pushRates(updates: any[], toChannels?: string[]) {
    const hotelCode = process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';
    const username = process.env.AIOSELL_USERNAME || 'sandbox';
    const password = process.env.AIOSELL_PASSWORD || 'sandbox123';
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    
    const payload: any = {
      hotelCode,
      updates
    };

    if (toChannels && toChannels.length > 0) {
      payload.toChannels = toChannels;
    }

    const pmsSlug = process.env.AIOSELL_PMS_SLUG || 'sample-pms';
    const response = await fetch(`https://live.aiosell.com/api/v2/cm/update-rates/${pmsSlug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }
}

export const cmService = new CmService();
