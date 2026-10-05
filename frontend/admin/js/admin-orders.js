/**
 * ====================================================================
 * WeBake Admin Portal — Orders & Verification Management (admin-orders.js)
 * Downpayment verification, proof zooming, balance collection, order editing.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let currentFilterStatus = 'all';
  let currentFilterChannel = 'all';
  let currentSearchQuery = '';
  let activeSelectedOrder = null;

  // --- DOM Elements ---
  const ordersTableBody = document.getElementById('orders-table-body');
  const searchInput = document.getElementById('orders-search');
  const channelFilterSelect = document.getElementById('orders-channel-filter');
  const verifyModal = document.getElementById('modal-verify-payment');
  const balanceModal = document.getElementById('modal-collect-balance');
  const editModal = document.getElementById('modal-edit-order');
  const lightboxModal = document.getElementById('modal-proof-lightbox');

  // --- 1. Render Orders Table ---
  function renderOrders() {
    if (!ordersTableBody) return;

    const allOrders = window.WeBakeAdmin.getOrders();

    const filtered = allOrders.filter(order => {
      // Status Filter
      if (currentFilterStatus !== 'all') {
        if (currentFilterStatus === 'pending' && order.status !== 'pending') return false;
        if (currentFilterStatus === 'in_production' && order.status !== 'in_production' && order.status !== 'preparing' && order.status !== 'confirmed') return false;
        if (currentFilterStatus === 'ready' && order.status !== 'ready_for_pickup' && order.status !== 'out_for_delivery') return false;
        if (currentFilterStatus === 'completed' && order.status !== 'completed') return false;
        if (currentFilterStatus === 'cancelled' && order.status !== 'cancelled' && order.status !== 'refunded' && order.status !== 'cancellation_requested') return false;
      }

      // Channel Filter
      if (currentFilterChannel !== 'all') {
        const orderChannel = order.channel || (order.orderId.includes('WALK') ? 'walkin' : 'online');
        if (orderChannel !== currentFilterChannel) return false;
      }

      // Search Query
      if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        const idMatch = (order.orderId || '').toLowerCase().includes(q);
        const nameMatch = (order.customer?.name || '').toLowerCase().includes(q);
        const phoneMatch = (order.customer?.contact || '').toLowerCase().includes(q);
        const refMatch = (order.referenceNumber || '').toLowerCase().includes(q);
        if (!idMatch && !nameMatch && !phoneMatch && !refMatch) return false;
      }

      return true;
    });

    // Update Tab Counters
    updateTabCounts(allOrders);

    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-icon-wrap"><i class="fas fa-inbox"></i></div>
              <h4 class="empty-title">No Orders Found</h4>
              <p class="empty-desc">There are no orders matching the selected filter criteria. When customer orders are placed, they will appear here automatically.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    ordersTableBody.innerHTML = filtered.map(o => {
      const isWalkin = (o.channel === 'walkin' || (o.orderId && o.orderId.includes('WALK')));
      const channelBadge = isWalkin
        ? `<span class="badge badge-channel-walkin"><i class="fas fa-store"></i> Walk-In</span>`
        : `<span class="badge badge-channel-online"><i class="fas fa-globe"></i> Online</span>`;

      const itemsSummary = (o.items || []).map(i => `${i.qty}x ${i.rawName || i.name}`).join(', ') || 'Bread assortment';
      const isDownpayment = o.balance > 0;

      return `
        <tr data-id="${o.orderId}">
          <td>
            <div class="order-id-cell">${o.orderId}</div>
            <div class="customer-contact">${o.date || 'Recent'} ${o.time || ''}</div>
          </td>
          <td>
            <div class="order-customer-info">
              <span class="customer-name">${o.customer?.name || 'Customer'}</span>
              <span class="customer-contact">${o.customer?.contact || o.customer?.email || 'No contact provided'}</span>
            </div>
          </td>
          <td>${channelBadge}</td>
          <td>
            <div class="order-items-snippet" title="${itemsSummary}">${itemsSummary}</div>
          </td>
          <td>
            <div class="order-financials">
              <span class="order-total-val">${window.WeBakeAdmin.formatPHP(o.total)}</span>
              ${isDownpayment ? `
                <span class="order-downpayment-val">Downpayment: ${window.WeBakeAdmin.formatPHP(o.downpayment)}</span>
                <span class="order-balance-val">Balance: ${window.WeBakeAdmin.formatPHP(o.balance)}</span>
              ` : `
                <span class="order-downpayment-val" style="color:var(--success);">Fully Paid</span>
              `}
            </div>
          </td>
          <td>
            <div class="order-payment-meta">
              <span>${o.paymentMethod || 'GCash'}</span>
              <span class="order-ref-num">${o.referenceNumber ? `Ref: ${o.referenceNumber}` : (isWalkin ? 'Counter Cash' : 'N/A')}</span>
            </div>
          </td>
          <td>${window.WeBakeAdmin.getStatusBadge(o.status)}</td>
          <td>
            <div class="order-actions-cell">
              ${o.status === 'pending' ? `
                <button type="button" class="btn btn-primary btn-sm btn-verify-order" data-id="${o.orderId}">
                  <i class="fas fa-check-circle"></i> Verify
                </button>
              ` : ''}

              ${(o.status === 'ready_for_pickup' || o.status === 'out_for_delivery') && o.balance > 0 ? `
                <button type="button" class="btn btn-success btn-sm btn-collect-balance" data-id="${o.orderId}">
                  <i class="fas fa-money-bill-wave"></i> Collect
                </button>
              ` : ''}

              <button type="button" class="btn btn-outline btn-sm btn-edit-order" data-id="${o.orderId}" title="Edit Order Details">
                <i class="fas fa-edit"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Row Action Buttons
    ordersTableBody.querySelectorAll('.btn-verify-order').forEach(btn => {
      btn.addEventListener('click', () => openVerifyModal(btn.dataset.id));
    });

    ordersTableBody.querySelectorAll('.btn-collect-balance').forEach(btn => {
      btn.addEventListener('click', () => openBalanceModal(btn.dataset.id));
    });

    ordersTableBody.querySelectorAll('.btn-edit-order').forEach(btn => {
      btn.addEventListener('click', () => openEditOrderModal(btn.dataset.id));
    });
  }

  // --- Update Tab Counters ---
  function updateTabCounts(orders) {
    const counts = {
      all: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      in_production: orders.filter(o => o.status === 'in_production' || o.status === 'preparing' || o.status === 'confirmed').length,
      ready: orders.filter(o => o.status === 'ready_for_pickup' || o.status === 'out_for_delivery').length,
      completed: orders.filter(o => o.status === 'completed').length,
      cancelled: orders.filter(o => o.status === 'cancelled' || o.status === 'refunded' || o.status === 'cancellation_requested').length
    };

    document.querySelectorAll('.order-tab-btn').forEach(btn => {
      const status = btn.dataset.status;
      const countSpan = btn.querySelector('.order-tab-count');
      if (countSpan && counts[status] !== undefined) {
        countSpan.textContent = counts[status];
      }
    });
  }

  // --- 2. Payment Verification Modal ---
  function openVerifyModal(orderId) {
    const orders = window.WeBakeAdmin.getOrders();
    activeSelectedOrder = orders.find(o => o.orderId === orderId);
    if (!activeSelectedOrder || !verifyModal) return;

    // Fill Modal Data
    document.getElementById('verify-order-id').textContent = activeSelectedOrder.orderId;
    document.getElementById('verify-cust-name').textContent = activeSelectedOrder.customer?.name || 'Customer';
    document.getElementById('verify-cust-contact').textContent = activeSelectedOrder.customer?.contact || activeSelectedOrder.customer?.email || 'N/A';
    document.getElementById('verify-cust-address').textContent = activeSelectedOrder.customer?.address || 'Pickup at store';
    document.getElementById('verify-order-total').textContent = window.WeBakeAdmin.formatPHP(activeSelectedOrder.total);
    document.getElementById('verify-downpayment-amt').textContent = window.WeBakeAdmin.formatPHP(activeSelectedOrder.downpayment);
    document.getElementById('verify-balance-amt').textContent = window.WeBakeAdmin.formatPHP(activeSelectedOrder.balance);
    document.getElementById('verify-payment-method').textContent = activeSelectedOrder.paymentMethod || 'GCash';
    document.getElementById('verify-ref-number').textContent = activeSelectedOrder.referenceNumber || 'No reference number entered';

    // Proof Screenshot
    const proofImgEl = document.getElementById('verify-proof-image');
    const noProofMsg = document.getElementById('verify-no-proof');
    const rejectBox = document.getElementById('verify-rejection-box');
    if (rejectBox) rejectBox.classList.remove('active');

    if (activeSelectedOrder.proofImage) {
      if (proofImgEl) {
        proofImgEl.src = activeSelectedOrder.proofImage;
        proofImgEl.style.display = 'block';
      }
      if (noProofMsg) noProofMsg.style.display = 'none';
    } else {
      if (proofImgEl) proofImgEl.style.display = 'none';
      if (noProofMsg) noProofMsg.style.display = 'block';
    }

    verifyModal.classList.add('active');
  }

  function approveDownpayment() {
    if (!activeSelectedOrder) return;

    const orders = window.WeBakeAdmin.getOrders();
    const target = orders.find(o => o.orderId === activeSelectedOrder.orderId);
    if (target) {
      target.status = 'in_production'; // moves to in production / confirmed
      target.downpaymentVerifiedAt = new Date().toLocaleString();
      window.WeBakeAdmin.saveOrders(orders);
      syncUserOrderHistory(target);
      window.WeBakeAdmin.showToast(`Downpayment verified for ${target.orderId}! Order moved to In-Production.`, 'success');
    }

    if (verifyModal) verifyModal.classList.remove('active');
    renderOrders();
  }

  function rejectDownpayment() {
    const rejectReasonInput = document.getElementById('verify-rejection-reason');
    const reason = rejectReasonInput ? rejectReasonInput.value.trim() : 'Invalid reference number or receipt';

    if (!activeSelectedOrder) return;

    const orders = window.WeBakeAdmin.getOrders();
    const target = orders.find(o => o.orderId === activeSelectedOrder.orderId);
    if (target) {
      target.status = 'cancelled';
      target.cancellationReason = `Payment Rejected by Bakery: ${reason}`;
      window.WeBakeAdmin.saveOrders(orders);
      syncUserOrderHistory(target);
      window.WeBakeAdmin.showToast(`Order ${target.orderId} marked as Cancelled/Rejected.`, 'danger');
    }

    if (verifyModal) verifyModal.classList.remove('active');
    renderOrders();
  }

  // --- 3. Delivery & Balance Collection Modal ---
  function openBalanceModal(orderId) {
    const orders = window.WeBakeAdmin.getOrders();
    activeSelectedOrder = orders.find(o => o.orderId === orderId);
    if (!activeSelectedOrder || !balanceModal) return;

    document.getElementById('balance-order-id').textContent = activeSelectedOrder.orderId;
    document.getElementById('balance-cust-name').textContent = activeSelectedOrder.customer?.name || 'Customer';
    document.getElementById('balance-due-amount').textContent = window.WeBakeAdmin.formatPHP(activeSelectedOrder.balance);

    balanceModal.classList.add('active');
  }

  function confirmBalanceCollected() {
    if (!activeSelectedOrder) return;

    const selectedPayOption = document.querySelector('input[name="balance-payment-mode"]:checked');
    const method = selectedPayOption ? selectedPayOption.value : 'Cash';

    const orders = window.WeBakeAdmin.getOrders();
    const target = orders.find(o => o.orderId === activeSelectedOrder.orderId);
    if (target) {
      target.status = 'completed';
      target.balanceCollected = target.balance;
      target.balancePaymentMethod = method;
      target.balance = 0;
      target.completedAt = new Date().toLocaleString();
      window.WeBakeAdmin.saveOrders(orders);
      syncUserOrderHistory(target);
      window.WeBakeAdmin.showToast(`Order ${target.orderId} completed! 50% Balance collected via ${method}.`, 'success');
    }

    if (balanceModal) balanceModal.classList.remove('active');
    renderOrders();
  }

  // --- 4. Edit Order Modal ---
  function openEditOrderModal(orderId) {
    const orders = window.WeBakeAdmin.getOrders();
    activeSelectedOrder = orders.find(o => o.orderId === orderId);
    if (!activeSelectedOrder || !editModal) return;

    document.getElementById('edit-order-id-label').textContent = activeSelectedOrder.orderId;
    document.getElementById('edit-cust-name').value = activeSelectedOrder.customer?.name || '';
    document.getElementById('edit-cust-phone').value = activeSelectedOrder.customer?.contact || '';
    document.getElementById('edit-cust-email').value = activeSelectedOrder.customer?.email || '';
    document.getElementById('edit-cust-address').value = activeSelectedOrder.customer?.address || '';
    document.getElementById('edit-order-status-select').value = activeSelectedOrder.status || 'pending';

    renderEditItemsTable();

    editModal.classList.add('active');
  }

  function renderEditItemsTable() {
    const tbody = document.getElementById('edit-items-tbody');
    if (!tbody || !activeSelectedOrder) return;

    tbody.innerHTML = (activeSelectedOrder.items || []).map((item, idx) => `
      <tr>
        <td><strong>${item.rawName || item.name}</strong></td>
        <td>${window.WeBakeAdmin.formatPHP(item.price)}</td>
        <td>
          <input type="number" min="1" class="edit-qty-input" data-index="${idx}" value="${item.qty}">
        </td>
        <td class="text-right">
          <strong>${window.WeBakeAdmin.formatPHP(item.price * item.qty)}</strong>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.edit-qty-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const newQty = parseInt(e.target.value, 10) || 1;
        if (activeSelectedOrder.items[idx]) {
          activeSelectedOrder.items[idx].qty = newQty;
          recalculateActiveOrderTotals();
          renderEditItemsTable();
        }
      });
    });

    recalculateActiveOrderTotals();
  }

  function recalculateActiveOrderTotals() {
    if (!activeSelectedOrder) return;
    const newTotal = (activeSelectedOrder.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);
    const hadBalance = activeSelectedOrder.balance > 0 || activeSelectedOrder.status === 'pending';
    const newDownpayment = hadBalance ? Math.round(newTotal * 0.5) : newTotal;
    const newBalance = hadBalance ? (newTotal - newDownpayment) : 0;

    activeSelectedOrder.total = newTotal;
    activeSelectedOrder.downpayment = newDownpayment;
    activeSelectedOrder.balance = newBalance;

    const totalEl = document.getElementById('edit-calculated-total');
    if (totalEl) totalEl.textContent = window.WeBakeAdmin.formatPHP(newTotal);
    const downEl = document.getElementById('edit-calculated-downpayment');
    if (downEl) downEl.textContent = window.WeBakeAdmin.formatPHP(newDownpayment);
    const balEl = document.getElementById('edit-calculated-balance');
    if (balEl) balEl.textContent = window.WeBakeAdmin.formatPHP(newBalance);
  }

  function saveEditedOrder() {
    if (!activeSelectedOrder) return;

    const newName = document.getElementById('edit-cust-name').value.trim();
    const newPhone = document.getElementById('edit-cust-phone').value.trim();
    const newEmail = document.getElementById('edit-cust-email').value.trim();
    const newAddress = document.getElementById('edit-cust-address').value.trim();
    const newStatus = document.getElementById('edit-order-status-select').value;

    const orders = window.WeBakeAdmin.getOrders();
    const target = orders.find(o => o.orderId === activeSelectedOrder.orderId);
    if (target) {
      target.customer = target.customer || {};
      target.customer.name = newName || target.customer.name;
      target.customer.contact = newPhone;
      target.customer.email = newEmail;
      target.customer.address = newAddress;
      target.status = newStatus;
      target.items = activeSelectedOrder.items;
      target.total = activeSelectedOrder.total;
      target.downpayment = activeSelectedOrder.downpayment;
      target.balance = activeSelectedOrder.balance;

      window.WeBakeAdmin.saveOrders(orders);
      syncUserOrderHistory(target);
      window.WeBakeAdmin.showToast(`Order ${target.orderId} updated successfully!`, 'success');
    }

    if (editModal) editModal.classList.remove('active');
    renderOrders();
  }

  // --- Sync with Customer Account's orderHistory in weBakeUsers ---
  function syncUserOrderHistory(updatedOrder) {
    try {
      const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      let modified = false;

      users.forEach(u => {
        if (u.orderHistory && Array.isArray(u.orderHistory)) {
          const matchIndex = u.orderHistory.findIndex(o => o.orderId === updatedOrder.orderId);
          if (matchIndex !== -1) {
            u.orderHistory[matchIndex] = { ...u.orderHistory[matchIndex], ...updatedOrder };
            modified = true;
          }
        }
      });

      if (modified) {
        localStorage.setItem('weBakeUsers', JSON.stringify(users));
      }
    } catch (e) {}
  }

  // --- Initial Setup & Listeners ---
  document.addEventListener('DOMContentLoaded', () => {
    renderOrders();

    // Search input
    searchInput?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim();
      renderOrders();
    });

    // Channel filter
    channelFilterSelect?.addEventListener('change', (e) => {
      currentFilterChannel = e.target.value;
      renderOrders();
    });

    // Status filter tabs
    document.querySelectorAll('.order-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilterStatus = btn.dataset.status;
        renderOrders();
      });
    });

    // Verification Modal Buttons
    document.getElementById('btn-approve-downpayment')?.addEventListener('click', approveDownpayment);

    document.getElementById('btn-show-reject-form')?.addEventListener('click', () => {
      const box = document.getElementById('verify-rejection-box');
      if (box) box.classList.toggle('active');
    });

    document.getElementById('btn-confirm-reject')?.addEventListener('click', rejectDownpayment);

    document.getElementById('btn-close-verify')?.addEventListener('click', () => {
      if (verifyModal) verifyModal.classList.remove('active');
    });

    // Lightbox Proof Zoom
    const proofImgEl = document.getElementById('verify-proof-image');
    if (proofImgEl && lightboxModal) {
      proofImgEl.addEventListener('click', () => {
        const fullImg = document.getElementById('lightbox-full-img');
        if (fullImg && proofImgEl.src) {
          fullImg.src = proofImgEl.src;
          lightboxModal.classList.add('active');
        }
      });
    }

    document.getElementById('btn-close-lightbox')?.addEventListener('click', () => {
      if (lightboxModal) lightboxModal.classList.remove('active');
    });

    lightboxModal?.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('active');
      }
    });

    // Balance Collection Modal Buttons
    document.getElementById('btn-confirm-balance')?.addEventListener('click', confirmBalanceCollected);
    document.getElementById('btn-close-balance')?.addEventListener('click', () => {
      if (balanceModal) balanceModal.classList.remove('active');
    });

    // Edit Modal Buttons
    document.getElementById('btn-save-edit-order')?.addEventListener('click', saveEditedOrder);
    document.getElementById('btn-close-edit')?.addEventListener('click', () => {
      if (editModal) editModal.classList.remove('active');
    });

    // Global backdrop click dismiss
    [verifyModal, balanceModal, editModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    // Realtime storage listener
    window.addEventListener('weBakeAdminUpdate', () => {
      renderOrders();
    });
  });

})(window, document);
