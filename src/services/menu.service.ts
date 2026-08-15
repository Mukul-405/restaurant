import { menuRepository } from '../repositories/menu.repository';

export class MenuService {
  private cachedMenu: {
    categories: { id: number; name: string }[];
    items: any[];
  } | null = null;
  private lastFetched: number = 0;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL (auto-invalidated on any write)

  public invalidateCache() {
    this.cachedMenu = null;
    this.lastFetched = 0;
  }

  async bulkCreateCategories(categories: string[]) {
    if (!categories || categories.length === 0) {
      throw new Error('No categories provided');
    }
    await menuRepository.createManyCategories(categories);
    this.invalidateCache();
    return { message: 'Categories created successfully' };
  }

  async createMenuItem(data: { name: string; price: number; description?: string; categoryName: string }) {
    const category = await menuRepository.upsertCategory(data.categoryName);

    const menuItem = await menuRepository.createMenuItem({
      name: data.name,
      price: data.price,
      description: data.description,
      categoryId: category.id,
    });

    this.invalidateCache();

    return {
      id: menuItem.id,
      name: menuItem.name,
      description: menuItem.description,
      price: menuItem.price,
      isAvailable: menuItem.isAvailable,
      categoryName: menuItem.category.name,
    };
  }

  async getAllMenuItems() {
    const now = Date.now();
    if (this.cachedMenu && now - this.lastFetched < this.CACHE_TTL_MS) {
      return this.cachedMenu;
    }

    const categories = await menuRepository.getAllCategories();
    const items = await menuRepository.getAllMenuItems();
    
    const mappedItems = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      isAvailable: item.isAvailable,
      categoryName: item.category.name,
    }));

    this.cachedMenu = {
      categories: categories.map((cat: any) => ({ id: cat.id, name: cat.name })),
      items: mappedItems,
    };
    this.lastFetched = now;

    return this.cachedMenu;
  }

  async updateMenuItem(id: number, data: { name?: string; price?: number; description?: string; isAvailable?: boolean; categoryName?: string }) {
    const updateData: any = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isAvailable !== undefined) updateData.isAvailable = data.isAvailable;

    // If categoryName is provided, find or create the category and link it
    if (data.categoryName) {
      const category = await menuRepository.upsertCategory(data.categoryName);
      updateData.categoryId = category.id;
    }

    const updatedItem = await menuRepository.updateMenuItem(id, updateData);
    
    this.invalidateCache();

    return {
      id: updatedItem.id,
      name: updatedItem.name,
      description: updatedItem.description,
      price: updatedItem.price,
      isAvailable: updatedItem.isAvailable,
      categoryName: updatedItem.category.name,
    };
  }

  async deleteMenuItem(id: number) {
    const result = await menuRepository.deleteMenuItem(id);
    this.invalidateCache();
    return result;
  }
}

export const menuService = new MenuService();
