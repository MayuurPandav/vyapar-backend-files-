const { getDB } = require('../config/db');

/**
 * Inspects real product inventory for low-stock items.
 * Does NOT generate or insert any duplicate data into MongoDB.
 *
 * @param {string} [username] - Optional filter for specific merchant store.
 * @returns {Promise<{totalLowStock: number, lowStockItems: Array<{name: string, stock: number, minStock: number, category: string}>}>}
 */
async function checkLowStockAlerts(username) {
  try {
    const db = getDB();
    const query = {};
    if (username) {
      query.$or = [{ username }, { createdBy: username }];
    }

    const products = await db.collection('products').find(query).toArray();

    const lowStockItems = [];
    products.forEach(p => {
      const currentStock = parseFloat(p.stock !== undefined ? p.stock : (p.qty || 0)) || 0;
      const minStock = parseFloat(p.minStockLevel || p.minStock || 5) || 5;

      if (currentStock <= minStock) {
        lowStockItems.push({
          id: String(p._id),
          name: p.productName || p.name || 'Unnamed Product',
          stock: currentStock,
          minStock,
          category: p.category || 'General',
          sku: p.sku || p.barcode || 'N/A'
        });
      }
    });

    return {
      totalLowStock: lowStockItems.length,
      lowStockItems
    };
  } catch (err) {
    console.error('Error checking low stock alerts:', err);
    return { totalLowStock: 0, lowStockItems: [] };
  }
}

module.exports = checkLowStockAlerts;
