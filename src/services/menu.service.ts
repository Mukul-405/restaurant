import { menuRepository } from '../repositories/menu.repository';
export class MenuService {
  async bulkCreateCategories(categories: string[]) {
    if (!categories || categories.length === 0) {
      throw new Error('No categories provided');
    }
    await menuRepository.createManyCategories(categories);
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

    return {
      categories: categories.map((cat: any) => ({ id: cat.id, name: cat.name })),
      items: mappedItems,
    };
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
    return menuRepository.deleteMenuItem(id);
  }
}

export const menuService = new MenuService();
