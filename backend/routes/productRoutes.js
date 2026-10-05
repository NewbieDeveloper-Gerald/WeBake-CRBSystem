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

/**
 * GET /api/products/all
 * Returns all products (active and inactive) for Admin Catalog and Inventory
 */
router.get('/all', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.product_name AS name,
        p.slug,
        p.description AS desc,
        p.image_url AS img,
        p.is_featured,
        p.is_active,
        c.id AS category_id,
        c.category_name,
        c.slug AS category_slug,
        b.id AS bundle_id,
        b.bundle_title,
        b.pieces_per_bundle AS min,
        b.wholesale_price AS price
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      LEFT JOIN product_bundles b ON b.product_id = p.id
      ORDER BY p.id ASC;
    `;

    const { rows } = await db.query(query);

    return res.json({
      success: true,
      count: rows.length,
      products: rows.map(r => {
        const bundlePrice = parseFloat(r.price || 105);
        const pieces = parseInt(r.min || 25, 10);
        const loosePrice = Math.round(bundlePrice / pieces) || 5;
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          desc: r.desc || '',
          price: bundlePrice,
          min: pieces,
          loosePrice: loosePrice,
          img: r.img || '',
          category: r.category_name || 'All Products',
          categoryId: r.category_id || 1,
          categorySlug: r.category_slug || 'breads',
          isFeatured: r.is_featured,
          isActive: r.is_active,
          status: r.is_active ? 'in_stock' : 'out_of_stock'
        };
      })
    });
  } catch (error) {
    console.error('[Admin All Products Route Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve catalog from database.',
      error: error.message
    });
  }
});

/**
 * POST /api/products
 * Adds a new product and wholesale bundle into the database
 */
router.post('/', async (req, res) => {
  const client = await db.getClient();
  try {
    const { name, desc, price, min, categoryId, img, isFeatured } = req.body || {};
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Product name and wholesale price are required.' });
    }

    const cleanName = name.trim();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const numPrice = parseFloat(price);
    const numMin = parseInt(min || 25, 10);
    const catId = parseInt(categoryId || 1, 10);

    await client.query('BEGIN');

    const prodRes = await client.query(`
      INSERT INTO products (category_id, product_name, slug, description, image_url, is_featured, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, product_name, slug, description;
    `, [catId, cleanName, slug, desc || '', img || '', !!isFeatured]);
    const newProd = prodRes.rows[0];

    await client.query(`
      INSERT INTO product_bundles (product_id, bundle_title, pieces_per_bundle, wholesale_price, min_order_bundles, is_active)
      VALUES ($1, '1 Bundle', $2, $3, 1, true);
    `, [newProd.id, numMin, numPrice]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Product created successfully in database.',
      product: {
        id: newProd.id,
        name: newProd.product_name,
        desc: newProd.description,
        price: numPrice,
        min: numMin,
        loosePrice: Math.round(numPrice / numMin) || 5,
        status: 'in_stock',
        isActive: true
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Create Product Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to create product: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/products/:id
 * Updates product details and bundle pricing
 */
router.put('/:id', async (req, res) => {
  const client = await db.getClient();
  try {
    const pid = parseInt(req.params.id, 10);
    const { name, desc, price, min, status } = req.body || {};

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Product name and price are required.' });
    }

    const cleanName = name.trim();
    const numPrice = parseFloat(price);
    const numMin = parseInt(min || 25, 10);
    const isActive = status !== 'out_of_stock';

    await client.query('BEGIN');

    await client.query(`
      UPDATE products
      SET product_name = $1, description = $2, is_active = $3, updated_at = NOW()
      WHERE id = $4;
    `, [cleanName, desc || '', isActive, pid]);

    await client.query(`
      UPDATE product_bundles
      SET pieces_per_bundle = $1, wholesale_price = $2, is_active = $3, updated_at = NOW()
      WHERE product_id = $4;
    `, [numMin, numPrice, isActive, pid]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Product updated successfully in database.',
      product: {
        id: pid,
        name: cleanName,
        desc: desc || '',
        price: numPrice,
        min: numMin,
        loosePrice: Math.round(numPrice / numMin) || 5,
        status: isActive ? 'in_stock' : 'out_of_stock',
        isActive: isActive
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Update Product Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update product: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/products/:id/status
 * Toggles product stock availability
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const pid = parseInt(req.params.id, 10);
    const { status, isActive } = req.body || {};

    let targetActive;
    if (typeof isActive === 'boolean') {
      targetActive = isActive;
    } else if (status) {
      targetActive = status === 'in_stock';
    } else {
      // Toggle current
      const curr = await db.query('SELECT is_active FROM products WHERE id = $1;', [pid]);
      targetActive = !curr.rows[0]?.is_active;
    }

    await db.query(`UPDATE products SET is_active = $1, updated_at = NOW() WHERE id = $2;`, [targetActive, pid]);
    await db.query(`UPDATE product_bundles SET is_active = $1, updated_at = NOW() WHERE product_id = $2;`, [targetActive, pid]);

    return res.json({
      success: true,
      message: 'Product status updated.',
      isActive: targetActive,
      status: targetActive ? 'in_stock' : 'out_of_stock'
    });
  } catch (err) {
    console.error('[Toggle Product Status Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update status: ' + err.message });
  }
});

/**
 * DELETE /api/products/:id
 * Soft deactivates product
 */
router.delete('/:id', async (req, res) => {
  try {
    const pid = parseInt(req.params.id, 10);
    await db.query(`UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1;`, [pid]);
    await db.query(`UPDATE product_bundles SET is_active = false, updated_at = NOW() WHERE product_id = $1;`, [pid]);
    return res.json({ success: true, message: 'Product deactivated successfully.' });
  } catch (err) {
    console.error('[Delete Product Error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to deactivate product: ' + err.message });
  }
});

module.exports = router;
