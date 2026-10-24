const { getDB } = require('../config/db');

/**
 * Searches the local merchant database first, then falls back to Open Food Facts / UPC databases.
 */
async function lookupBarcode(barcode, username = null) {
  if (!barcode) throw new Error('Barcode is required');
  const cleanCode = String(barcode).trim();

  // 1. Check local MongoDB products collection first
  try {
    const db = getDB();
    const query = { $or: [{ barcode: cleanCode }, { sku: cleanCode }, { id: cleanCode }] };
    if (username) query.username = username;
    const localProduct = await db.collection('products').findOne(query);

    if (localProduct) {
      return {
        found: true,
        source: 'local_inventory',
        product: {
          id: localProduct.id || localProduct._id,
          name: localProduct.name || localProduct.title,
          brand: localProduct.brand || 'In-House',
          category: localProduct.category || 'General',
          price: localProduct.price || localProduct.salePrice || 0,
          mrp: localProduct.mrp || localProduct.price || 0,
          barcode: cleanCode,
          sku: localProduct.sku || cleanCode,
          stock: localProduct.stock ?? localProduct.quantity ?? 0,
          imageUrl: localProduct.imageUrl || null
        }
      };
    }
  } catch (dbErr) {
    console.warn('[BARCODE-LOOKUP] Local DB lookup error:', dbErr.message);
  }

  // 2. Query Global Open Food Facts API (Free, millions of Indian & global FMCG products)
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`;
    const offRes = await fetch(offUrl, {
      headers: {
        'User-Agent': 'VyaparBilling/2.0 (support@vyapar.com)'
      }
    });

    if (offRes.ok) {
      const offData = await offRes.json();
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const name = p.product_name_en || p.product_name || p.generic_name || 'Packaged Product';
        const brand = p.brands || p.brand_owner || 'Brand';
        const category = p.categories ? p.categories.split(',')[0].trim() : 'Packaged Goods';
        const imageUrl = p.image_front_url || p.image_url || null;
        const quantity = p.quantity || '';

        return {
          found: true,
          source: 'OpenFoodFacts Global',
          product: {
            name: quantity ? `${name} (${quantity})` : name,
            brand,
            category,
            barcode: cleanCode,
            sku: cleanCode,
            price: 0,
            mrp: 0,
            imageUrl,
            description: p.ingredients_text || ''
          }
        };
      }
    }
  } catch (offErr) {
    console.warn('[BARCODE-LOOKUP] Open Food Facts lookup notice:', offErr.message);
  }

  // 3. Query UPCitemdb trial API
  try {
    const upcUrl = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(cleanCode)}`;
    const upcRes = await fetch(upcUrl);
    if (upcRes.ok) {
      const upcData = await upcRes.json();
      if (upcData.items && upcData.items.length > 0) {
        const item = upcData.items[0];
        return {
          found: true,
          source: 'UPCitemdb Global',
          product: {
            name: item.title,
            brand: item.brand,
            category: item.category ? item.category.split('>')[0].trim() : 'General Retail',
            barcode: cleanCode,
            sku: cleanCode,
            price: item.lowest_recorded_price || 0,
            mrp: item.highest_recorded_price || 0,
            imageUrl: item.images && item.images.length > 0 ? item.images[0] : null,
            description: item.description || ''
          }
        };
      }
    }
  } catch (upcErr) {
    console.warn('[BARCODE-LOOKUP] UPCitemdb lookup notice:', upcErr.message);
  }

  // Fallback: Barcode parsed but not in global databases
  return {
    found: false,
    barcode: cleanCode,
    message: 'Product not found in global databases. Ready to create as new item.'
  };
}

module.exports = {
  lookupBarcode
};
