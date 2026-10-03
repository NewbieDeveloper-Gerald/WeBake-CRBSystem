const { Pool } = require('pg');

async function seedProducts() {
  const pool = new Pool({
    user: 'postgres.tzntlmafvenbqcmjmkay',
    password: 'qsGEAd3s$xY@vCG',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Seeding initial bakery products & bundles...');

    const productsData = [
      {
        name: 'Mamon',
        slug: 'mamon',
        desc: 'Soft and fluffy Filipino sponge cake, perfect for merienda or pasalubong. Light, airy, and melt-in-your-mouth delicious.',
        categorySlug: 'bestsellers',
        isFeatured: true,
        pieces: 25,
        price: 105.00
      },
      {
        name: 'Otap',
        slug: 'otap',
        desc: 'Crispy, flaky oval-shaped puff pastry with a caramelized sugar coating. A beloved Visayan delicacy enjoyed by all ages.',
        categorySlug: 'bestsellers',
        isFeatured: true,
        pieces: 25,
        price: 105.00
      },
      {
        name: 'Eggnog',
        slug: 'eggnog',
        desc: 'Sweet and crumbly meringue-based cookie, delicately baked to perfection. A classic Filipino bakery staple.',
        categorySlug: 'breads',
        isFeatured: false,
        pieces: 25,
        price: 105.00
      },
      {
        name: 'Buttertoast',
        slug: 'buttertoast',
        desc: 'Golden, crunchy butter-toasted bread slices. Perfectly toasted with a rich, buttery flavor ideal for wholesale.',
        categorySlug: 'breads',
        isFeatured: false,
        pieces: 25,
        price: 105.00
      }
    ];

    for (const item of productsData) {
      // Find category
      const catRes = await pool.query('SELECT id FROM product_categories WHERE slug = $1;', [item.categorySlug]);
      const catId = catRes.rows[0]?.id || 1;

      // Insert product if not exists
      const prodRes = await pool.query(`
        INSERT INTO products (category_id, product_name, slug, description, is_featured, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (product_name) DO UPDATE 
        SET description = EXCLUDED.description, is_featured = EXCLUDED.is_featured
        RETURNING id, product_name;
      `, [catId, item.name, item.slug, item.desc, item.isFeatured]);

      const productId = prodRes.rows[0].id;
      console.log(`Inserted/Updated product: ${item.name} (ID: ${productId})`);

      // Insert product bundle
      const bundleCheck = await pool.query('SELECT id FROM product_bundles WHERE product_id = $1;', [productId]);
      if (bundleCheck.rows.length === 0) {
        await pool.query(`
          INSERT INTO product_bundles (product_id, bundle_title, pieces_per_bundle, wholesale_price, min_order_bundles, is_active)
          VALUES ($1, '1 Bundle', $2, $3, 1, true);
        `, [productId, item.pieces, item.price]);
        console.log(`  Added bundle: 1 Bundle (${item.pieces} pcs @ PHP ${item.price})`);
      }
    }

    console.log('\n--- Seeding Complete ---');
    const finalProds = await pool.query(`
      SELECT p.id, p.product_name, c.category_name, b.bundle_title, b.pieces_per_bundle, b.wholesale_price
      FROM products p
      JOIN product_categories c ON p.category_id = c.id
      JOIN product_bundles b ON b.product_id = p.id
      ORDER BY p.id;
    `);

    console.log('Current Catalog in Supabase:');
    finalProds.rows.forEach(r => {
      console.log(`  #${r.id} ${r.product_name} [${r.category_name}] -> ${r.bundle_title} (${r.pieces_per_bundle} pcs @ PHP ${r.wholesale_price})`);
    });

  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await pool.end();
  }
}

seedProducts();
