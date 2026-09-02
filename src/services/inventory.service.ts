import { inventoryRepository, InventoryFilter, InventoryItemMeta } from '../repositories/inventory.repository';

export class InventoryService {
  async createInventory(data: {
    date: string | Date;
    items: { name: string; quantity: number; perItemPrice: number; totalPrice?: number }[];
    totalPrice?: number;
    notes?: string | null;
  }) {
    const formattedItems: InventoryItemMeta[] = data.items.map(item => {
      const quantity = Number(item.quantity) || 0;
      const perItemPrice = Number(item.perItemPrice) || 0;
      const calculatedTotal = Number(item.totalPrice) !== undefined && !isNaN(Number(item.totalPrice))
        ? Number(item.totalPrice)
        : Number((quantity * perItemPrice).toFixed(2));

      return {
        name: item.name.trim(),
        quantity,
        perItemPrice,
        totalPrice: calculatedTotal,
      };
    });

    const grandTotal = data.totalPrice !== undefined && Number(data.totalPrice) > 0
      ? Number(data.totalPrice)
      : formattedItems.reduce((acc, curr) => acc + curr.totalPrice, 0);

    return inventoryRepository.create({
      date: new Date(data.date),
      metaInfo: formattedItems,
      totalPrice: Number(grandTotal.toFixed(2)),
      notes: data.notes || null,
    });
  }

  async getAllInventory(filter?: InventoryFilter) {
    return inventoryRepository.findAll(filter);
  }

  async getInventoryById(id: number) {
    const record = await inventoryRepository.findById(id);
    if (!record) {
      throw new Error(`Inventory record with ID ${id} not found`);
    }
    return record;
  }

  async updateInventory(id: number, data: {
    date?: string | Date;
    items?: { name: string; quantity: number; perItemPrice: number; totalPrice?: number }[];
    totalPrice?: number;
    notes?: string | null;
  }) {
    const existing = await this.getInventoryById(id);
    if (!existing) throw new Error('Inventory record not found');

    const updatePayload: any = {};

    if (data.date) {
      updatePayload.date = new Date(data.date);
    }

    if (data.items) {
      const formattedItems: InventoryItemMeta[] = data.items.map(item => {
        const quantity = Number(item.quantity) || 0;
        const perItemPrice = Number(item.perItemPrice) || 0;
        const calculatedTotal = Number(item.totalPrice) !== undefined && !isNaN(Number(item.totalPrice))
          ? Number(item.totalPrice)
          : Number((quantity * perItemPrice).toFixed(2));

        return {
          name: item.name.trim(),
          quantity,
          perItemPrice,
          totalPrice: calculatedTotal,
        };
      });
      updatePayload.metaInfo = formattedItems;

      const grandTotal = data.totalPrice !== undefined && Number(data.totalPrice) >= 0
        ? Number(data.totalPrice)
        : formattedItems.reduce((acc, curr) => acc + curr.totalPrice, 0);

      updatePayload.totalPrice = Number(grandTotal.toFixed(2));
    } else if (data.totalPrice !== undefined) {
      updatePayload.totalPrice = Number(data.totalPrice);
    }

    if (data.notes !== undefined) {
      updatePayload.notes = data.notes;
    }

    return inventoryRepository.update(id, updatePayload);
  }

  async deleteInventory(id: number) {
    await this.getInventoryById(id);
    return inventoryRepository.delete(id);
  }
}

export const inventoryService = new InventoryService();
