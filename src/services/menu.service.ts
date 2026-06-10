import { menuRepository } from '../repositories/menu.repository';
import fs from 'fs';
import csvParser from 'csv-parser';

export class MenuService {
  async bulkCreateCategories(categories: string[]) {
    if (!categories || categories.length === 0) {
      throw new Error('No categories provided');
    }
    await menuRepository.createManyCategories(categories);
    return { message: 'Categories created successfully' };
  }

  async createMenuItem(data: { name: string; price: number; description?: string; categoryName: string }) {
    // Check if category exists, if not create it
    let category = await menuRepository.findCategoryByName(data.categoryName);
    if (!category) {
      category = await menuRepository.createCategory(data.categoryName);
    }

    const menuItem = await menuRepository.createMenuItem({
      name: data.name,
      price: data.price,
      description: data.description,
      categoryId: category.id,
    });

    return menuItem;
  }

  async processMenuCsv(filePath: string) {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          try {
            // 1. Extract unique categories from CSV
            // Expected headers: Category, Item Name, Price, Description
            const uniqueCategoryNames = [...new Set(results.map((row) => row['Category']?.trim()).filter(Boolean))];
            
            // 2. Bulk create categories (skips duplicates automatically)
            if (uniqueCategoryNames.length > 0) {
              await menuRepository.createManyCategories(uniqueCategoryNames as string[]);
            }

            // 3. Fetch all categories to map name to ID
            const allCategories = await menuRepository.getAllCategories();
            const categoryMap = new Map();
            allCategories.forEach((cat: any) => categoryMap.set(cat.name, cat.id));

            // 4. Map CSV rows to MenuItem data
            const menuItemsData = results.map(row => {
              const categoryName = row['Category']?.trim();
              const categoryId = categoryMap.get(categoryName);
              
              if (!categoryId) {
                // If somehow missing, skip or handle (shouldn't happen because we just created them)
                return null;
              }

              return {
                name: row['Item Name']?.trim(),
                price: parseFloat(row['Price']) || 0,
                description: row['Description']?.trim() || undefined,
                categoryId: categoryId,
              };
            }).filter(item => item !== null) as any[];

            // 5. Bulk insert menu items
            if (menuItemsData.length > 0) {
              await menuRepository.createManyMenuItems(menuItemsData);
            }

            // 6. Cleanup the temp file
            fs.unlinkSync(filePath);

            resolve({ message: 'CSV processed successfully', itemsProcessed: menuItemsData.length });
          } catch (error) {
            // Cleanup the temp file on error too
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            reject(error);
          }
        })
        .on('error', (error) => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          reject(error);
        });
    });
  }

  async getAllMenuItems() {
    const categories = await menuRepository.getAllCategories();
    const items = await menuRepository.getAllMenuItems();
    
    const mappedItems = items.map(item => ({
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
      let category = await menuRepository.findCategoryByName(data.categoryName);
      if (!category) {
        category = await menuRepository.createCategory(data.categoryName);
      }
      updateData.categoryId = category.id;
    }

    return menuRepository.updateMenuItem(id, updateData);
  }

  async deleteMenuItem(id: number) {
    return menuRepository.deleteMenuItem(id);
  }
}

export const menuService = new MenuService();
