/**
 * ====================================================================
 * WeBake Admin Portal — Daily Production & Live Inventory (admin-inventory.js)
 * Computes live stock from morning batches and confirmed database orders.
 * Connected to unified backend API (/api/products/all and /api/orders/all).
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let liveProducts = [];
  let liveOrders = [];

  async function loadData() {
    try {
      if (window.WeBakeAdminAPI) {
        const [prodRes, orderRes] = await Promise.all([
          window.WeBakeAdminAPI.get('/products/all').catch(() => null),
          window.WeBakeAdminAPI.get('/orders/all').catch(() => null)
        ]);

        if (prodRes && prodRes.success && Array.isArray(prodRes.products)) {
          liveProducts = prodRes.products;
        }
        if (orderRes && orderRes.success && Array.isArray(orderRes.orders)) {
          liveOrders = orderRes.orders;
        }
      }
    } catch (e) {
      console.warn('[Admin Inventory Data Load Warning]:', e.message);
    }

    if (!liveProducts.length) liveProducts = window.WeBakeAdmin?.getProducts() || [];
    if (!liveOrders.length) liveOrders = window.WeBakeAdmin?.getOrders() || [];

    populateProductSelects();
    renderInventory();
  }

  function populateProductSelects() {
    const batchSelect = document.getElementById('batch-product-select');
    const spoilSelect = document.getElementById('spoilage-product-select');

    const optionsHtml = liveProducts.map(p =>
      `<option value="${p.id}">${window.escapeHtml ? window.escapeHtml(p.name) : p.name}</option>`
    ).join('');

    if (batchSelect && optionsHtml) batchSelect.innerHTML = optionsHtml;
    if (spoilSelect && optionsHtml) spoilSelect.innerHTML = optionsHtml;
  }

  function renderInventory() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;

    const inventory = window.WeBakeAdmin.getInventory();

    // Calculate real-time sales deductions from real database orders
    const salesDeductions = {};
    liveProducts.forEach(p => { salesDeductions[p.id] = 0; });

    liveOrders.forEach(o => {
      if (o.status !== 'cancelled' && o.status !== 'refunded') {
        (o.items || []).forEach(item => {
          const pid = item.id || liveProducts.find(x => x.name.toLowerCase() === (item.name || '').toLowerCase())?.id;
          if (pid && salesDeductions[pid] !== undefined) {
            const bundles = item.unitType === 'bundle' ? item.qty : Math.ceil(item.qty / 25);
            salesDeductions[pid] += bundles;
          }
        });
      }
    });

    if (liveProducts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <p class="empty-desc">No products found in database.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = liveProducts.map(p => {
      const stockObj = (inventory.stock && inventory.stock[p.id]) || { morning: 100, carried: 0, spoilage: 0 };
      const morningBaked = stockObj.morning !== undefined ? stockObj.morning : 100;
      const carriedOver = stockObj.carried || 0;
      const spoilage = stockObj.spoilage || 0;
      const sold = salesDeductions[p.id] || 0;

      // Formula: (Morning + Carried) - Sold - Spoilage
      const remaining = Math.max(0, (morningBaked + carriedOver) - sold - spoilage);

      let badgeClass = 'badge-instock';
      let badgeLabel = 'Healthy Stock';
      if (remaining === 0) {
        badgeClass = 'badge-outofstock';
        badgeLabel = 'Out of Stock';
      } else if (remaining < 15) {
        badgeClass = 'badge-lowstock';
        badgeLabel = 'Low Stock';
      }

      return `
        <tr>
          <td>
            <strong>${window.escapeHtml ? window.escapeHtml(p.name) : p.name}</strong>
            <div class="text-muted font-sm">1 Bundle = ${p.min || 25} pcs</div>
          </td>
          <td><strong>${morningBaked}</strong> bundles</td>
          <td>${carriedOver} bundles</td>
          <td class="text-danger">-${sold} bundles</td>
          <td class="text-muted">-${spoilage} bundles</td>
          <td>
            <strong class="text-primary font-lg">${remaining}</strong> bundles
          </td>
          <td>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </td>
        </tr>
      `;
    }).join('');

    renderHistoryLogs(inventory);
  }

  function renderHistoryLogs(inventory) {
    const batchListEl = document.getElementById('inventory-history-tbody');
    if (!batchListEl) return;

    const batches = inventory.batches || [];
    if (batches.length === 0) {
      batchListEl.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              <p class="empty-desc">No morning batches or spoilage logs recorded yet. Use the forms above to start logging.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    batchListEl.innerHTML = batches.slice(0, 8).map(b => `
      <tr>
        <td>${b.date} ${b.time || ''}</td>
        <td><span class="badge ${b.type === 'baking' ? 'badge-confirmed' : 'badge-cancelled'}">${b.type === 'baking' ? 'Production Batch' : 'Spoilage / Damaged'}</span></td>
        <td><strong>${b.productName}</strong></td>
        <td><strong>${b.quantity} bundles</strong></td>
        <td>${b.notes || 'Routine entry'}</td>
      </tr>
    `).join('');
  }

  function logProductionBatch(e) {
    e.preventDefault();
    const pid = parseInt(document.getElementById('batch-product-select')?.value, 10);
    const qty = parseInt(document.getElementById('batch-qty-input')?.value, 10) || 0;
    const notes = document.getElementById('batch-notes-input')?.value.trim() || '';

    if (qty <= 0) {
      window.WeBakeAdmin.showToast('Please enter a valid batch quantity greater than 0.', 'danger');
      return;
    }

    const inventory = window.WeBakeAdmin.getInventory();
    const targetProduct = liveProducts.find(p => p.id === pid) || { name: 'Bread' };

    if (!inventory.stock) inventory.stock = {};
    if (!inventory.stock[pid]) inventory.stock[pid] = { morning: 0, carried: 0, spoilage: 0 };

    inventory.stock[pid].morning = (inventory.stock[pid].morning || 0) + qty;

    inventory.batches = inventory.batches || [];
    inventory.batches.unshift({
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'baking',
      productName: targetProduct.name,
      quantity: qty,
      notes: notes || 'Morning Baking Run'
    });

    window.WeBakeAdmin.saveInventory(inventory);
    window.WeBakeAdmin.showToast(`Logged ${qty} bundles of ${targetProduct.name} to morning production!`, 'success');

    document.getElementById('batch-qty-input').value = '';
    document.getElementById('batch-notes-input').value = '';
    renderInventory();
  }

  function logSpoilage(e) {
    e.preventDefault();
    const pid = parseInt(document.getElementById('spoilage-product-select')?.value, 10);
    const qty = parseInt(document.getElementById('spoilage-qty-input')?.value, 10) || 0;
    const reason = document.getElementById('spoilage-reason-select')?.value || 'Damaged in transit';

    if (qty <= 0) {
      window.WeBakeAdmin.showToast('Please enter a valid spoilage quantity greater than 0.', 'danger');
      return;
    }

    const inventory = window.WeBakeAdmin.getInventory();
    const targetProduct = liveProducts.find(p => p.id === pid) || { name: 'Bread' };

    if (!inventory.stock) inventory.stock = {};
    if (!inventory.stock[pid]) inventory.stock[pid] = { morning: 0, carried: 0, spoilage: 0 };

    inventory.stock[pid].spoilage = (inventory.stock[pid].spoilage || 0) + qty;

    inventory.batches = inventory.batches || [];
    inventory.batches.unshift({
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'spoilage',
      productName: targetProduct.name,
      quantity: qty,
      notes: `Loss: ${reason}`
    });

    window.WeBakeAdmin.saveInventory(inventory);
    window.WeBakeAdmin.showToast(`Logged ${qty} bundles of ${targetProduct.name} as spoilage.`, 'danger');

    document.getElementById('spoilage-qty-input').value = '';
    renderInventory();
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadData();

    document.getElementById('form-log-batch')?.addEventListener('submit', logProductionBatch);
    document.getElementById('form-log-spoilage')?.addEventListener('submit', logSpoilage);

    window.addEventListener('weBakeAdminUpdate', () => {
      loadData();
    });
  });

})(window, document);
