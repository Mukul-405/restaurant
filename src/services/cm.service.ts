import { prisma } from '../config/prisma';

class CmService {
  async processReservation(payload: any) {
    const { action, bookingId, channel } = payload;
    if (!['book', 'modify', 'cancel'].includes(action)) {
      throw new Error(`Unsupported action: ${action}`);
    }

    const existing = await prisma.userRoomBooking.findFirst({
      where: { bookingId, channel }
    });

    if (action === 'cancel') {
      if (existing) {
        await prisma.userRoomBooking.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED' as any }
        });
      }
      return;
    }

    const data = this.mapPayloadToDbFields(payload);
    
    if (existing) {
      await prisma.userRoomBooking.update({ where: { id: existing.id }, data });
    } else {
      await prisma.userRoomBooking.create({ data });
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



  private async callAiosellApi(endpoint: string, payload: any) {
    const username = process.env.AIOSELL_USERNAME || 'sandbox';
    const password = process.env.AIOSELL_PASSWORD || 'sandbox123';
    const pmsSlug = process.env.AIOSELL_PMS_SLUG || 'sample-pms';
    
    payload.hotelCode = payload.hotelCode || process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';

    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const response = await fetch(`https://live.aiosell.com/api/v2/cm/${endpoint}/${pmsSlug}`, {
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

  async fetchInventory(startDate: string, endDate: string) {
    return this.callAiosellApi('data', { type: "inventory", startDate, endDate });
  }

  async fetchRates(startDate: string, endDate: string) {
    return this.callAiosellApi('data', { type: "rates", startDate, endDate });
  }

  async fetchReservations(startDate: string, endDate: string) {
    return this.callAiosellApi('data', { type: "reservation", startDate, endDate });
  }

  /**
   * Pushes inventory updates.
   * Note: This method also handles Inventory Restrictions Push natively, 
   * just include a `restrictions` object instead of `available` inside `updates`.
   */
  async pushInventory(updates: any[], toChannels?: string[]) {
    return this.callAiosellApi('update', { 
      updates, 
      ...(toChannels?.length ? { toChannels } : {}) 
    });
  }

  /**
   * Pushes rate updates.
   * Note: This method also handles Rate Restrictions Push natively,
   * just include a `restrictions` object inside `updates`.
   */
  async pushRates(updates: any[], toChannels?: string[]) {
    return this.callAiosellApi('update-rates', { 
      updates, 
      ...(toChannels?.length ? { toChannels } : {}) 
    });
  }
}

export const cmService = new CmService();
