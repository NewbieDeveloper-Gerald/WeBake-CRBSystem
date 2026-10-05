/**
 * ====================================================================
 * WeBake Admin Portal — Orders & Verification Management (admin-orders.js)
 * Fully connected to unified backend API (/api/orders/all, /verify, /balance, /status)
 * backed by Supabase PostgreSQL orders, order_items, payments, and history.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let currentFilterStatus = 'all';
  let currentFilterChannel = 'all';
  let currentSearchQuery = '';
  let activeSelectedOrder = null;
  let cachedOrders = [];

  // --- DOM Elements ---
  const ordersTableBody = document.getElementById('orders-table-body');
  const searchInput = document.getElementById('orders-search');
  const channelFilterSelect = document.getElementById('orders-channel-filter');
  const verifyModal = document.getElementById('modal-verify-payment');
  const balanceModal = document.getElementById('modal-collect-balance');
  const editModal = document.getElementById('modal-edit-order');
  const lightboxModal = document.getElementById('modal-proof-lightbox');

  // --- 1. Render Orders Table ---
  async function renderOrders() {
    if (!ordersTableBody) return;

    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top:0.5rem;">Loading orders from database...</p>
        </td>
      </tr>
    `;

    try {
      let allOrders = [];
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/orders/all');
        if (res && res.success && Array.isArray(res.orders)) {
          allOrders = res.orders;
          cachedOrders = allOrders;
          try { localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders)); } catch (e) {}
        }
      }

      if (!allOrders.length) {
        allOrders = window.WeBakeAdmin?.getOrders() || [];
        cachedOrders = allOrders;
      }

      const filtered = allOrders.filter(order => {
        // Status Filter
        if (currentFilterStatus !== 'all') {
          if (currentFilterStatus === 'pending' && order.status !== 'pending') return false;
          if (currentFilterStatus === 'in_production' && order.status !== 'in_production' && order.status !== 'preparing' && order.status !== 'confirmed' && order.status !== 'downpayment_confirmed' && order.status !== 'baking') return false;
          if (currentFilterStatus === 'ready' && order.status !== 'ready_for_pickup' && order.status !== 'out_for_delivery') return false;
          if (currentFilterStatus === 'completed' && order.status !== 'completed' && order.status !== 'delivered') return false;
          if (currentFilterStatus === 'cancelled' && order.status !== 'cancelled' && order.status !== 'refunded' && order.status !== 'cancellation_requested') return false;
        }

        // Channel Filter
        if (currentFilterChannel !== 'all') {
          const orderChannel = order.channel || (order.orderId?.includes('WALK') ? 'walkin' : 'online');
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

        const itemsSummary = (o.items || []).map(i => `${i.qty}x ${i.rawName || i.name}`).join(', ') || 'Bakery items';
        const isDownpayment = o.balance > 0;

        return `
          <tr data-id="${o.orderId}">
            <td>
              <div class="order-id-cell"><strong>${o.orderId}</strong></div>
              <div class="customer-contact">${o.date || 'Recent'} ${o.time || ''}</div>
            </td>
            <td>
              <div class="order-customer-info">
                <span class="customer-name">
                  ${window.escapeHtml ? window.escapeHtml(o.customer?.name || 'Customer') : (o.customer?.name || 'Customer')}
                </span>
                <span class="customer-contact">${window.escapeHtml ? window.escapeHtml(o.customer?.contact || o.customer?.email || 'No contact') : (o.customer?.contact || o.customer?.email || 'No contact')}</span>
              </div>
            </td>
            <td>${channelBadge}</td>
            <td>
              <div class="order-items-snippet" title="${window.escapeHtml ? window.escapeHtml(itemsSummary) : itemsSummary}">
                ${window.escapeHtml ? window.escapeHtml(itemsSummary) : itemsSummary}
              </div>
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
                <span><strong>${o.paymentMethod || 'GCash'}</strong></span>
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

                ${(o.status === 'ready_for_pickup' || o.status === 'out_for_delivery' || o.status === 'downpayment_confirmed' || o.status === 'baking') && o.balance > 0 ? `
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

    } catch (err) {
      console.error('[Admin Orders Load Error]:', err);
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state" style="color:var(--danger);">
              <i class="fas fa-exclamation-triangle fa-2x"></i>
              <h4 class="empty-title">Error Loading Orders</h4>
              <p class="empty-desc">${err.message || 'Cannot reach database server.'}</p>
              <button class="btn btn-outline btn-sm mt-1" onclick="location.reload()">Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // --- Update Tab Counters ---
  function updateTabCounts(orders) {
    const counts = {
      all: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      in_production: orders.filter(o => ['in_production', 'preparing', 'confirmed', 'downpayment_confirmed', 'baking'].includes(o.status)).length,
      ready: orders.filter(o => ['ready_for_pickup', 'out_for_delivery'].includes(o.status)).length,
      completed: orders.filter(o => ['completed', 'delivered'].includes(o.status)).length,
      cancelled: orders.filter(o => ['cancelled', 'refunded', 'cancellation_requested'].includes(o.status)).length
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
    activeSelectedOrder = cachedOrders.find(o => o.orderId === orderId);
    if (!activeSelectedOrder || !verifyModal) return;

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

  async function approveDownpayment() {
    if (!activeSelectedOrder) return;
    const btn = document.getElementById('btn-approve-downpayment');
    if (btn) btn.disabled = true;

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.patch(`/orders/${activeSelectedOrder.orderId}/verify`);
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Downpayment verified for ${activeSelectedOrder.orderId}! Order moved to In-Production.`, 'success');
      }
      if (verifyModal) verifyModal.classList.remove('active');
      renderOrders();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Verification failed: ' + err.message, 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function rejectDownpayment() {
    if (!activeSelectedOrder) return;
    const rejectReasonInput = document.getElementById('verify-rejection-reason');
    const reason = rejectReasonInput ? rejectReasonInput.value.trim() : 'Invalid reference number or receipt';

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.patch(`/orders/${activeSelectedOrder.orderId}/status`, {
          status: 'cancelled',
          notes: `Downpayment Rejected: ${reason}`
        });
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Order ${activeSelectedOrder.orderId} marked as Cancelled/Rejected.`, 'danger');
      }
      if (verifyModal) verifyModal.classList.remove('active');
      renderOrders();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to reject: ' + err.message, 'danger');
    }
  }

  // --- 3. Delivery & Balance Collection Modal ---
  function openBalanceModal(orderId) {
    activeSelectedOrder = cachedOrders.find(o => o.orderId === orderId);
    if (!activeSelectedOrder || !balanceModal) return;

    document.getElementById('balance-order-id').textContent = activeSelectedOrder.orderId;
    document.getElementById('balance-cust-name').textContent = activeSelectedOrder.customer?.name || 'Customer';
    document.getElementById('balance-due-amount').textContent = window.WeBakeAdmin.formatPHP(activeSelectedOrder.balance);

    balanceModal.classList.add('active');
  }

  async function confirmBalanceCollected() {
    if (!activeSelectedOrder) return;

    const selectedPayOption = document.querySelector('input[name="balance-payment-mode"]:checked');
    const method = selectedPayOption ? selectedPayOption.value : 'Cash';
    const btn = document.getElementById('btn-confirm-balance');
    if (btn) btn.disabled = true;

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.patch(`/orders/${activeSelectedOrder.orderId}/balance`, {
          paymentMethod: method,
          refNumber: 'COLLECTED_' + method.toUpperCase()
        });
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Order ${activeSelectedOrder.orderId} completed! 50% Balance collected via ${method}.`, 'success');
      }
      if (balanceModal) balanceModal.classList.remove('active');
      renderOrders();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to collect balance: ' + err.message, 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // --- 4. Edit Order Modal ---
  function openEditOrderModal(orderId) {
    activeSelectedOrder = cachedOrders.find(o => o.orderId === orderId);
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

    tbody.innerHTML = (activeSelectedOrder.items || []).map((item) => `
      <tr>
        <td><strong>${window.escapeHtml ? window.escapeHtml(item.rawName || item.name) : (item.rawName || item.name)}</strong></td>
        <td>${window.WeBakeAdmin.formatPHP(item.price)}</td>
        <td>${item.qty}</td>
        <td class="text-right">
          <strong>${window.WeBakeAdmin.formatPHP(item.price * item.qty)}</strong>
        </td>
      </tr>
    `).join('');
  }

  async function saveEditedOrder() {
    if (!activeSelectedOrder) return;

    const payload = {
      customerName: document.getElementById('edit-cust-name').value.trim(),
      customerContact: document.getElementById('edit-cust-phone').value.trim(),
      customerAddress: document.getElementById('edit-cust-address').value.trim(),
      status: document.getElementById('edit-order-status-select').value
    };

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.patch(`/orders/${activeSelectedOrder.orderId}/status`, payload);
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Order ${activeSelectedOrder.orderId} updated successfully!`, 'success');
      }
      if (editModal) editModal.classList.remove('active');
      renderOrders();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to save order: ' + err.message, 'danger');
    }
  }

  // --- Initial Setup & Listeners ---
  document.addEventListener('DOMContentLoaded', () => {
    renderOrders();

    searchInput?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim();
      renderOrders();
    });

    channelFilterSelect?.addEventListener('change', (e) => {
      currentFilterChannel = e.target.value;
      renderOrders();
    });

    document.querySelectorAll('.order-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilterStatus = btn.dataset.status;
        renderOrders();
      });
    });

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
      if (e.target === lightboxModal) lightboxModal.classList.remove('active');
    });

    document.getElementById('btn-confirm-balance')?.addEventListener('click', confirmBalanceCollected);
    document.getElementById('btn-close-balance')?.addEventListener('click', () => {
      if (balanceModal) balanceModal.classList.remove('active');
    });

    document.getElementById('btn-save-edit-order')?.addEventListener('click', saveEditedOrder);
    document.getElementById('btn-close-edit')?.addEventListener('click', () => {
      if (editModal) editModal.classList.remove('active');
    });

    [verifyModal, balanceModal, editModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    window.addEventListener('weBakeAdminUpdate', () => {
      renderOrders();
    });
  });

})(window, document);
