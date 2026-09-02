import { barMenuRepository } from '../repositories/barMenu.repository';
import { menuRepository } from '../repositories/menu.repository';
import { menuService } from './menu.service';

export class BarMenuService {
  private cachedBarMenu: {
    categories: { id: number; name: string }[];
    items: any[];
  } | null = null;
  private lastFetched: number = 0;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL (auto-invalidated on write)

  public invalidateCache() {
    this.cachedBarMenu = null;
    this.lastFetched = 0;
  }

  async bulkCreateCategories(categories: string[]) {
    if (!categories || categories.length === 0) {
      throw new Error('No categories provided');
    }
    await menuRepository.createManyCategories(categories);
    this.invalidateCache();
    menuService.invalidateCache();
    return { message: 'Categories created successfully' };
  }

  async createBarMenuItem(data: { name: string; price: number; description?: string; categoryName: string }) {
    const category = await menuRepository.upsertCategory(data.categoryName);

    const barMenuItem = await barMenuRepository.createBarMenuItem({
      name: data.name,
      price: data.price,
      description: data.description,
      categoryId: category.id,
    });

    this.invalidateCache();

    return {
      id: barMenuItem.id,
      name: barMenuItem.name,
      description: barMenuItem.description,
      price: barMenuItem.price,
      isAvailable: barMenuItem.isAvailable,
      categoryName: barMenuItem.category.name,
    };
  }

  async getAllBarMenuItems() {
    const now = Date.now();
    if (this.cachedBarMenu && now - this.lastFetched < this.CACHE_TTL_MS) {
      return this.cachedBarMenu;
    }

    const categories = await menuRepository.getAllCategories();
    const items = await barMenuRepository.getAllBarMenuItems();
    
    const mappedItems = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      isAvailable: item.isAvailable,
      categoryName: item.category.name,
    }));

    this.cachedBarMenu = {
      categories: categories.map((cat: any) => ({ id: cat.id, name: cat.name })),
      items: mappedItems,
    };
    this.lastFetched = now;

    return this.cachedBarMenu;
  }

  async updateBarMenuItem(id: number, data: { name?: string; price?: number; description?: string; isAvailable?: boolean; categoryName?: string }) {
    const updateData: any = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isAvailable !== undefined) updateData.isAvailable = data.isAvailable;

    if (data.categoryName) {
      const category = await menuRepository.upsertCategory(data.categoryName);
      updateData.categoryId = category.id;
    }

    const updatedItem = await barMenuRepository.updateBarMenuItem(id, updateData);
    
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

  async deleteBarMenuItem(id: number) {
    const result = await barMenuRepository.deleteBarMenuItem(id);
    this.invalidateCache();
    return result;
  }
}

export const barMenuService = new BarMenuService();
