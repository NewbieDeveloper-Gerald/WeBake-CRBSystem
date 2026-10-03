/**
 * ====================================================================
 * WeBake - Product & Catalog Routes
 * Fetches products, wholesale bundles, and categories from Supabase
 * ====================================================================
 */

const express = require('express');
const db = require('../database/db');

const router = express.Router();

/**
 * GET /api/products
 * Returns active products along with their wholesale bundle pricing
 */
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.product_name AS name,
        p.slug,
        p.description AS desc,
        p.image_url AS img,
        p.is_featured,
        c.category_name,
        c.slug AS category_slug,
        b.id AS bundle_id,
        b.bundle_title,
        b.pieces_per_bundle AS min,
        b.wholesale_price AS price
      FROM products p
      JOIN product_categories c ON p.category_id = c.id
      JOIN product_bundles b ON b.product_id = p.id AND b.is_active = true
      WHERE p.is_active = true
      ORDER BY p.id ASC;
    `;

    const { rows } = await db.query(query);

    return res.json({
      success: true,
      count: rows.length,
      products: rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        desc: r.desc,
        price: parseFloat(r.price),
        min: r.min,
        img: r.img || '',
        category: r.category_name,
        categorySlug: r.category_slug,
        isFeatured: r.is_featured
      }))
    });
  } catch (error) {
    console.error('[Products Route Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve products from database.',
      error: error.message
    });
  }
});

/**
 * GET /api/products/categories
 * Returns active product categories
 */
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, category_name, slug, display_order 
      FROM product_categories 
      WHERE is_active = true 
      ORDER BY display_order ASC;
    `);

    return res.json({
      success: true,
      categories: rows
    });
  } catch (error) {
    console.error('[Categories Route Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve categories.',
      error: error.message
    });
  }
});

module.exports = router;
