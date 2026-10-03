/**
 * ====================================================================
 * WeBake - Read-Only Product Catalog & Store Settings (api/products/index.js)
 * Authoritative server catalog loaded directly from Supabase PostgreSQL
 * ====================================================================
 */

const { getPool } = require('../_lib/db');
const { handleCors, sendJson, sendError } = require('../_lib/http');

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

  const pool = getPool();

  try {
    // 1. Fetch active products with category and wholesale bundle pricing
    const catalogQuery = `
      SELECT p.id, p.product_name, p.slug, p.description, p.image_url, p.is_featured,
             c.category_name, c.slug AS category_slug,
             pb.id AS bundle_id, pb.bundle_title, pb.pieces_per_bundle, pb.wholesale_price, pb.min_order_bundles
      FROM products p
      JOIN product_categories c ON c.id = p.category_id
      JOIN product_bundles pb ON pb.product_id = p.id AND pb.is_active = TRUE
      WHERE p.is_active = TRUE
      ORDER BY p.id ASC, pb.id ASC;
    `;
    const catalogRes = await pool.query(catalogQuery);

    // 2. Fetch store configuration settings (delivery fee, downpayment rate)
    const settingsRes = await pool.query(`
      SELECT setting_key, setting_value 
      FROM store_settings 
      WHERE setting_key IN ('standard_delivery_fee', 'downpayment_percentage');
    `);

    const settings = {
      standardDeliveryFee: 50.00,
      downpaymentPercentage: 50
    };

    settingsRes.rows.forEach(s => {
      if (s.setting_key === 'standard_delivery_fee') {
        settings.standardDeliveryFee = parseFloat(s.setting_value) || 50.00;
      } else if (s.setting_key === 'downpayment_percentage') {
        settings.downpaymentPercentage = parseFloat(s.setting_value) || 50;
      }
    });

    const products = catalogRes.rows.map(row => ({
      id: row.id,
      bundleId: row.bundle_id,
      name: row.product_name,
      slug: row.slug,
      description: row.description || '',
      category: row.category_name,
      categorySlug: row.category_slug,
      pieces: row.pieces_per_bundle,
      price: parseFloat(row.wholesale_price),
      minOrderBundles: row.min_order_bundles || 1,
      isFeatured: row.is_featured,
      imageUrl: row.image_url || ''
    }));

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return sendJson(res, 200, {
      success: true,
      products,
      settings
    });

  } catch (error) {
    return sendError(res, 500, 'Failed to retrieve product catalog.', error);
  }
};
