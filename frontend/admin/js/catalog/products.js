/**
 * ====================================================================
 * WeBake Admin Portal — Product Catalog Management (admin-products.js)
 * Fully connected to unified backend API (/api/products/all, POST, PUT, DELETE)
 * backed by Supabase PostgreSQL products & product_bundles tables.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let activeEditProductId = null;
  let cachedProducts = [];

  const tableBody = document.getElementById('products-table-body');
  const addModal = document.getElementById('modal-add-product');
  const editModal = document.getElementById('modal-edit-product');

  async function renderProducts() {
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top:0.5rem;">Loading catalog from database...</p>
        </td>
      </tr>
    `;

    try {
      let products = [];
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/products/all');
        if (res && res.success && Array.isArray(res.products)) {
          products = res.products;
          cachedProducts = products;
          try { localStorage.setItem('weBakeProducts', JSON.stringify(products)); } catch (e) {}
        }
      }

      if (!products.length) {
        products = window.WeBakeAdmin?.getProducts() || [];
        cachedProducts = products;
      }

      if (products.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7">
              <div class="empty-state">
                <p class="empty-desc">No products found in the database. Click "+ Add New Product" to create one.</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = products.map(p => {
        const loose = p.loosePrice || Math.round(p.price / (p.min || 25)) || 5;
        const statusBadge = p.status === 'in_stock'
          ? `<span class="badge badge-instock">In Stock</span>`
          : (p.status === 'low_stock' ? `<span class="badge badge-lowstock">Low Stock</span>` : `<span class="badge badge-outofstock">Sold Out</span>`);

        return `
          <tr data-id="${p.id}">
            <td>
              <div class="d-flex align-center gap-half">
                <div class="pos-card-media" style="width:40px; height:40px; border-radius:4px; display:flex; align-items:center; justify-content:center; background:var(--accent-soft);">
                  <i class="fas fa-bread-slice text-primary"></i>
                </div>
                <div>
                  <strong>${window.escapeHtml ? window.escapeHtml(p.name) : p.name}</strong>
                  <div class="text-muted font-sm">${p.desc ? (window.escapeHtml ? window.escapeHtml(p.desc.slice(0, 45)) : p.desc.slice(0, 45)) + '...' : ''}</div>
                </div>
              </div>
            </td>
            <td><strong>${window.WeBakeAdmin.formatPHP(p.price)}</strong> / bundle</td>
            <td>${p.min || 25} pcs</td>
            <td>${window.WeBakeAdmin.formatPHP(loose)} / pc</td>
            <td>${statusBadge}</td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-toggle-stock" data-id="${p.id}">
                <i class="fas fa-toggle-on"></i> Toggle Status
              </button>
            </td>
            <td>
              <div class="order-actions-cell">
                <button type="button" class="btn btn-outline btn-sm btn-edit-p" data-id="${p.id}" title="Edit Product">
                  <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn btn-outline btn-sm text-danger btn-del-p" data-id="${p.id}" title="Delete Product">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tableBody.querySelectorAll('.btn-toggle-stock').forEach(btn => {
        btn.addEventListener('click', () => toggleProductStock(parseInt(btn.dataset.id, 10)));
      });

      tableBody.querySelectorAll('.btn-edit-p').forEach(btn => {
        btn.addEventListener('click', () => openEditProductModal(parseInt(btn.dataset.id, 10)));
      });

      tableBody.querySelectorAll('.btn-del-p').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(parseInt(btn.dataset.id, 10)));
      });

    } catch (err) {
      console.error('[Admin Products Render Error]:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state" style="color:var(--danger);">
              <i class="fas fa-exclamation-triangle fa-2x"></i>
              <h4 class="empty-title">Error Loading Products</h4>
              <p class="empty-desc">${err.message || 'Cannot reach database server.'}</p>
              <button class="btn btn-outline btn-sm mt-1" onclick="location.reload()">Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
  }

  async function toggleProductStock(pid) {
    try {
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.patch(`/products/${pid}/status`, {});
        if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(res.message || 'Status updated in database!', 'info');
      }
      renderProducts();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to update status: ' + err.message, 'danger');
    }
  }

  function openEditProductModal(pid) {
    const p = cachedProducts.find(x => x.id === pid);
    if (!p || !editModal) return;

    activeEditProductId = pid;
    document.getElementById('edit-p-name').value = p.name;
    document.getElementById('edit-p-desc').value = p.desc || '';
    document.getElementById('edit-p-price').value = p.price;
    document.getElementById('edit-p-pcs').value = p.min || 25;
    document.getElementById('edit-p-loose').value = p.loosePrice || 5;
    document.getElementById('edit-p-status').value = p.status || 'in_stock';

    editModal.classList.add('active');
  }

  async function saveEditProduct(e) {
    e.preventDefault();
    if (!activeEditProductId) return;

    const payload = {
      name: document.getElementById('edit-p-name').value.trim(),
      desc: document.getElementById('edit-p-desc').value.trim(),
      price: parseFloat(document.getElementById('edit-p-price').value),
      min: parseInt(document.getElementById('edit-p-pcs').value, 10),
      status: document.getElementById('edit-p-status').value
    };

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.put(`/products/${activeEditProductId}`, payload);
        if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Product updated in database!', 'success');
      }
      if (editModal) editModal.classList.remove('active');
      renderProducts();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to save changes: ' + err.message, 'danger');
    }
  }

  async function addNewProduct(e) {
    e.preventDefault();
    const name = document.getElementById('add-p-name').value.trim();
    const desc = document.getElementById('add-p-desc').value.trim();
    const price = parseFloat(document.getElementById('add-p-price').value) || 105;
    const pcs = parseInt(document.getElementById('add-p-pcs').value, 10) || 25;

    if (!name) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Product name is required.', 'danger');
      return;
    }

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.post('/products', {
          name,
          desc,
          price,
          min: pcs,
          categoryId: 1
        });
        if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(`Added ${name} to database catalog!`, 'success');
      }

      document.getElementById('form-add-product').reset();
      if (addModal) addModal.classList.remove('active');
      renderProducts();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to create product: ' + err.message, 'danger');
    }
  }

  async function deleteProduct(pid) {
    const p = cachedProducts.find(x => x.id === pid);
    if (!p) return;

    if (confirm(`Are you sure you want to deactivate ${p.name}? It will be hidden from customer ordering.`)) {
      try {
        if (window.WeBakeAdminAPI) {
          await window.WeBakeAdminAPI.del(`/products/${pid}`);
          if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(`Deactivated ${p.name}.`, 'info');
        }
        renderProducts();
      } catch (err) {
        if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to deactivate: ' + err.message, 'danger');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderProducts();

    document.getElementById('btn-open-add-product')?.addEventListener('click', () => {
      if (addModal) addModal.classList.add('active');
    });

    document.getElementById('btn-close-add-p')?.addEventListener('click', () => {
      if (addModal) addModal.classList.remove('active');
    });

    document.getElementById('btn-close-edit-p')?.addEventListener('click', () => {
      if (editModal) editModal.classList.remove('active');
    });

    document.getElementById('form-add-product')?.addEventListener('submit', addNewProduct);
    document.getElementById('form-edit-product')?.addEventListener('submit', saveEditProduct);

    window.addEventListener('weBakeAdminUpdate', () => {
      renderProducts();
    });
  });

})(window, document);
