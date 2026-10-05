/**
 * ====================================================================
 * WeBake Admin Portal — Product Catalog Management (admin-products.js)
 * Product CRUD operations, bundle pricing, and quick availability toggles.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let activeEditProductId = null;

  const tableBody = document.getElementById('products-table-body');
  const addModal = document.getElementById('modal-add-product');
  const editModal = document.getElementById('modal-edit-product');

  function renderProducts() {
    if (!tableBody) return;
    const products = window.WeBakeAdmin.getProducts();

    if (products.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <p class="empty-desc">No products in catalog. Click "+ Add New Product" to create one.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = products.map(p => {
      const loose = p.loosePrice || 5;
      const statusBadge = p.status === 'in_stock'
        ? `<span class="badge badge-instock">In Stock</span>`
        : (p.status === 'low_stock' ? `<span class="badge badge-lowstock">Low Stock</span>` : `<span class="badge badge-outofstock">Sold Out</span>`);

      return `
        <tr>
          <td>
            <div class="d-flex align-center gap-half">
              <div class="pos-card-media" style="width:40px; height:40px; border-radius:4px;">
                <i class="fas fa-bread-slice text-primary"></i>
              </div>
              <div>
                <strong>${p.name}</strong>
                <div class="text-muted font-sm">${p.desc ? p.desc.slice(0, 45) + '...' : ''}</div>
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
  }

  function toggleProductStock(pid) {
    const products = window.WeBakeAdmin.getProducts();
    const p = products.find(x => x.id === pid);
    if (!p) return;

    if (p.status === 'in_stock') p.status = 'low_stock';
    else if (p.status === 'low_stock') p.status = 'out_of_stock';
    else p.status = 'in_stock';

    window.WeBakeAdmin.saveProducts(products);
    window.WeBakeAdmin.showToast(`${p.name} status updated to: ${p.status.replace('_', ' ')}`, 'info');
    renderProducts();
  }

  function openEditProductModal(pid) {
    const products = window.WeBakeAdmin.getProducts();
    const p = products.find(x => x.id === pid);
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

  function saveEditProduct(e) {
    e.preventDefault();
    if (!activeEditProductId) return;

    const products = window.WeBakeAdmin.getProducts();
    const p = products.find(x => x.id === activeEditProductId);
    if (p) {
      p.name = document.getElementById('edit-p-name').value.trim() || p.name;
      p.desc = document.getElementById('edit-p-desc').value.trim();
      p.price = parseFloat(document.getElementById('edit-p-price').value) || p.price;
      p.min = parseInt(document.getElementById('edit-p-pcs').value, 10) || 25;
      p.loosePrice = parseFloat(document.getElementById('edit-p-loose').value) || 5;
      p.status = document.getElementById('edit-p-status').value;

      window.WeBakeAdmin.saveProducts(products);
      window.WeBakeAdmin.showToast(`Updated ${p.name} catalog details!`, 'success');
    }

    if (editModal) editModal.classList.remove('active');
    renderProducts();
  }

  function addNewProduct(e) {
    e.preventDefault();
    const name = document.getElementById('add-p-name').value.trim();
    const desc = document.getElementById('add-p-desc').value.trim();
    const price = parseFloat(document.getElementById('add-p-price').value) || 105;
    const pcs = parseInt(document.getElementById('add-p-pcs').value, 10) || 25;
    const loose = parseFloat(document.getElementById('add-p-loose').value) || 5;

    if (!name) {
      window.WeBakeAdmin.showToast('Product name is required.', 'danger');
      return;
    }

    const products = window.WeBakeAdmin.getProducts();
    const newId = Date.now();

    products.push({
      id: newId,
      name,
      desc,
      price,
      min: pcs,
      loosePrice: loose,
      status: 'in_stock',
      img: ''
    });

    window.WeBakeAdmin.saveProducts(products);
    window.WeBakeAdmin.showToast(`Added ${name} to bakery catalog!`, 'success');

    document.getElementById('form-add-product').reset();
    if (addModal) addModal.classList.remove('active');
    renderProducts();
  }

  function deleteProduct(pid) {
    const products = window.WeBakeAdmin.getProducts();
    const p = products.find(x => x.id === pid);
    if (!p) return;

    if (confirm(`Are you sure you want to remove ${p.name} from the catalog?`)) {
      const updated = products.filter(x => x.id !== pid);
      window.WeBakeAdmin.saveProducts(updated);
      window.WeBakeAdmin.showToast(`Removed ${p.name} from catalog.`, 'info');
      renderProducts();
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
