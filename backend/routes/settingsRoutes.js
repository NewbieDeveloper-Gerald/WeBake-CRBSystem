/**
 * ====================================================================
 * WeBake - Bakery Store Settings Routes (Supabase Backed)
 * Handles store payment methods, operating hours, and configuration
 * ====================================================================
 */

const express = require('express');
const db = require('../database/db');

const router = express.Router();

/**
 * GET /api/settings
 * Retrieves all bakery store settings
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT setting_key, setting_value FROM store_settings;');
    const map = {};
    rows.forEach(r => { map[r.setting_key] = r.setting_value; });

    return res.json({
      success: true,
      settings: {
        gcashNumber: map['gcash_number'] || '0917-123-4567',
        paymayaNumber: map['paymaya_number'] || '0918-987-6543',
        accountName: map['account_name'] || 'Gerald V.',
        gcashQr: map['gcash_qr'] || '../img/gcash-qr.svg',
        paymayaQr: map['paymaya_qr'] || '../img/paymaya-qr.svg',
        storeHours: map['store_hours'] || '6:00 AM - 8:00 PM',
        cutoffTime: map['cutoff_time'] || '2:00 PM',
        deliveryAreas: map['delivery_areas'] || 'Marilao, Bulacan'
      }
    });
  } catch (error) {
    console.error('[Settings GET Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings.', error: error.message });
  }
});

/**
 * PUT /api/settings
 * Updates bakery store settings in database
 */
router.put('/', async (req, res) => {
  const client = await db.getClient();
  try {
    const body = req.body || {};
    const keyMap = {
      gcashNumber: 'gcash_number',
      paymayaNumber: 'paymaya_number',
      accountName: 'account_name',
      gcashQr: 'gcash_qr',
      paymayaQr: 'paymaya_qr',
      storeHours: 'store_hours',
      cutoffTime: 'cutoff_time',
      deliveryAreas: 'delivery_areas'
    };

    await client.query('BEGIN');
    for (const [prop, dbKey] of Object.entries(keyMap)) {
      if (body[prop] !== undefined) {
        await client.query(`
          INSERT INTO store_settings (setting_key, setting_value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (setting_key) DO UPDATE
          SET setting_value = EXCLUDED.setting_value, updated_at = NOW();
        `, [dbKey, String(body[prop])]);
      }
    }
    await client.query('COMMIT');

    return res.json({ success: true, message: 'Store settings saved successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Settings PUT Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to save settings.', error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
