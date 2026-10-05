/* ==========================================================================
   WeBake — Customer Dashboard Module (dashboard.js)
   Handles authentication guards, profile updates, saved shopping cart
   management, order history with cancellation & refund requests, and
   wholesale partnership review & status management.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* --------------------------------------------------------------------------
     1. Storage & State Management
     -------------------------------------------------------------------------- */
  const DashboardStore = {
    KEYS: {
      USERS: 'weBakeUsers',
      SESSION: 'weBakeSession',
      APPS: 'weBakePartnerApplications',
      ALL_ORDERS: 'weBakeAllOrders'
    },

    sameEmail(a, b) {
      return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
    },

    getSession() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.SESSION));
      } catch (e) {
        return null;
      }
    },

    saveSession(session) {
      localStorage.setItem(this.KEYS.SESSION, JSON.stringify(session));
    },

    clearSession() {
      localStorage.removeItem(this.KEYS.SESSION);
    },

    getUsers() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]');
      } catch (e) {
        return [];
      }
    },

    saveUsers(users) {
      localStorage.setItem(this.KEYS.USERS, JSON.stringify(users));
    },

    getCurrentUser() {
      const session = this.getSession();
      if (!session || !session.email) return null;
      const users = this.getUsers();
      return users.find(u => this.sameEmail(u.email, session.email)) || null;
    },

    getAllOrders() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.ALL_ORDERS) || '[]');
      } catch (e) {
        return [];
      }
    },

    saveAllOrders(orders) {
      localStorage.setItem(this.KEYS.ALL_ORDERS, JSON.stringify(orders));
    },

    getApplications() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.APPS) || '[]');
      } catch (e) {
        return [];
      }
    },

    saveApplications(apps) {
      localStorage.setItem(this.KEYS.APPS, JSON.stringify(apps));
    }
  };

  /* --------------------------------------------------------------------------
     2. Notifications Helper
     -------------------------------------------------------------------------- */
  function toast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  /* --------------------------------------------------------------------------
     3. Authentication Guard
     -------------------------------------------------------------------------- */
  const session = DashboardStore.getSession();
  if (!session || !session.email) {
    window.location.href = 'home.html';
    return;
  }

  let currentUser = DashboardStore.getCurrentUser();
  if (!currentUser) {
    currentUser = {
      name: session.name || 'Valued Customer',
      email: session.email,
      savedCart: [],
      orderHistory: [],
      partnerStatus: session.partnerStatus || 'none',
      partnerAppId: session.partnerAppId || null,
      partnerDetails: session.partnerDetails || null
    };
    const all = DashboardStore.getUsers();
    all.push(currentUser);
    DashboardStore.saveUsers(all);
  } else if (session && session.partnerStatus && (!currentUser.partnerStatus || currentUser.partnerStatus === 'none')) {
    currentUser.partnerStatus = session.partnerStatus;
    currentUser.partnerAppId = session.partnerAppId || currentUser.partnerAppId;
    currentUser.partnerDetails = session.partnerDetails || currentUser.partnerDetails;
    const all = DashboardStore.getUsers();
    const idx = all.findIndex(u => DashboardStore.sameEmail(u.email, session.email));
    if (idx !== -1) {
      all[idx] = Object.assign(all[idx], currentUser);
      DashboardStore.saveUsers(all);
    }
  }

  /* --------------------------------------------------------------------------
     4. Profile Information Management
     -------------------------------------------------------------------------- */
  const DashboardProfile = {
    init() {
      const nameInput = document.getElementById('dash-name');
      const contactInput = document.getElementById('dash-contact');
      const emailInput = document.getElementById('dash-email');
      const addressInput = document.getElementById('dash-address');
      const profileForm = document.getElementById('profile-form');

      // Populate current user values
      if (nameInput) nameInput.value = currentUser.name || '';
      if (contactInput) contactInput.value = currentUser.contact || '';
      if (emailInput) emailInput.value = currentUser.email || '';
      if (addressInput) addressInput.value = currentUser.address || '';

      // Live 11-digit phone restriction on profile contact input
      contactInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
      });

      // Handle profile form save
      profileForm?.addEventListener('submit', (e) => {
        e.preventDefault();

        const newName = (nameInput?.value || '').trim();
        const newContact = (contactInput?.value || '').trim();
        const newAddress = (addressInput?.value || '').trim();

        const allUsers = DashboardStore.getUsers();
        const userIndex = allUsers.findIndex(u => DashboardStore.sameEmail(u.email, currentUser.email));

        if (userIndex !== -1) {
          allUsers[userIndex].name = newName;
          allUsers[userIndex].contact = newContact;
          allUsers[userIndex].address = newAddress;
          DashboardStore.saveUsers(allUsers);

          // Update session name if changed
          session.name = newName;
          DashboardStore.saveSession(session);

          // Update active local currentUser reference
          currentUser.name = newName;
          currentUser.contact = newContact;
          currentUser.address = newAddress;

          toast('Profile updated successfully!');
        } else {
          toast('Error saving profile.');
        }
      });
    }
  };

  /* --------------------------------------------------------------------------
     5. Saved Shopping Cart Management
     -------------------------------------------------------------------------- */
  const DashboardCart = {
    container: document.getElementById('dash-cart-container'),

    render() {
      if (!this.container) return;
      const cart = currentUser.savedCart || [];

      if (cart.length === 0) {
        this.container.innerHTML = `
          <div style="text-align:center; padding:1.5rem 0;">
            <p class="empty-state">Your cart is empty.</p>
            <a href="products.html" class="btn btn-primary" style="margin-top:0.5rem;">
              <i class="fas fa-shopping-bag"></i> Start Shopping
            </a>
          </div>
        `;
        return;
      }

      let html = `
        <table class="cart-table">
          <thead>
            <tr>
              <th style="width:30px;"><input type="checkbox" id="cart-select-all" checked></th>
              <th style="text-align:left;">Product Name</th>
              <th style="text-align:center;">Bundle(pcs)</th>
              <th style="text-align:right;">Price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
      `;

      let total = 0;
      const esc = (typeof window.escapeHtml === 'function') ? window.escapeHtml : (str) => String(str || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));

      cart.forEach((item, index) => {
        const itemTotal = (Number(item.price) || 0) * (Number(item.qty) || 0);
        total += itemTotal;
        html += `
          <tr>
            <td><input type="checkbox" class="cart-item-check" data-index="${index}" data-price="${itemTotal}" checked></td>
            <td><strong>${esc(item.name)}</strong></td>
            <td style="text-align:center;">
              <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;">
                <div style="display:flex; align-items:center; gap:0.25rem;">
                  <button class="cart-qty-btn btn btn-outline" data-index="${index}" data-action="minus" style="padding:0 0.4rem; cursor:pointer; min-width:unset; line-height:1.2;">-</button>
                  <span style="font-weight:bold; min-width:1.5rem; text-align:center;">${Number(item.qty) || 1}</span>
                  <button class="cart-qty-btn btn btn-outline" data-index="${index}" data-action="plus" style="padding:0 0.4rem; cursor:pointer; min-width:unset; line-height:1.2;">+</button>
                </div>
                <span style="font-size:0.75rem; color:#666;">(${(Number(item.qty) || 1) * (Number(item.min) || 100)} pcs)</span>
              </div>
            </td>
            <td style="text-align:right;">\u20B1${itemTotal.toFixed(2)}</td>
            <td style="text-align:right;">
              <button class="remove-btn" data-index="${index}" title="Remove" style="color:#dc3545; background:none; border:none; cursor:pointer;">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
        <div style="display:flex; flex-direction:column; align-items:flex-end; margin-top: 1rem; gap: 0.5rem;">
          <div class="cart-total" style="margin:0;">Total: \u20B1${total.toFixed(2)}</div>
          <div style="display:flex; gap:0.5rem;">
            <a href="products.html" class="btn btn-outline" style="padding: 0.5rem 1.5rem;">
              <i class="fas fa-arrow-left"></i> Continue Browsing
            </a>
            <button id="dash-checkout-btn" class="btn btn-primary" style="padding: 0.5rem 1.5rem;">
              <i class="fas fa-shopping-cart"></i> Checkout Now
            </button>
          </div>
        </div>
      `;

      this.container.innerHTML = html;

      // Checkbox calculation & select all handling
      const itemChecks = this.container.querySelectorAll('.cart-item-check');
      const selectAll = document.getElementById('cart-select-all');
      const totalEl = this.container.querySelector('.cart-total');

      const updateSelectedTotal = () => {
        let currentTotal = 0;
        itemChecks.forEach(chk => {
          if (chk.checked) currentTotal += parseFloat(chk.getAttribute('data-price'));
        });
        if (totalEl) totalEl.textContent = 'Total: \u20B1' + currentTotal.toFixed(2);
        if (selectAll) selectAll.checked = Array.from(itemChecks).every(c => c.checked);
      };

      itemChecks.forEach(chk => chk.addEventListener('change', updateSelectedTotal));

      selectAll?.addEventListener('change', (e) => {
        itemChecks.forEach(chk => { chk.checked = e.target.checked; });
        updateSelectedTotal();
      });

      // Checkout Selected Items
      document.getElementById('dash-checkout-btn')?.addEventListener('click', () => {
        const selectedIndices = [];
        itemChecks.forEach(chk => {
          if (chk.checked) selectedIndices.push(chk.getAttribute('data-index'));
        });
        if (selectedIndices.length === 0) {
          toast('Please select at least one item to checkout.');
          return;
        }
        window.location.href = 'products.html?checkout=true&items=' + selectedIndices.join(',');
      });

      // Quantity buttons
      this.container.querySelectorAll('.cart-qty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
          const action = e.currentTarget.getAttribute('data-action');
          const currentItem = currentUser.savedCart[idx];
          if (!currentItem) return;
          const currentQty = parseInt(currentItem.qty, 10) || 1;
          let newQty = currentQty;
          if (action === 'minus') newQty = Math.max(1, currentQty - 1);
          if (action === 'plus') newQty = Math.min(99, currentQty + 1);
          this.updateItemQty(idx, newQty);
        });
      });

      // Delete buttons
      this.container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
          this.removeItem(idx);
        });
      });
    },

    updateItemQty(index, newQty) {
      const allUsers = DashboardStore.getUsers();
      const userIndex = allUsers.findIndex(u => DashboardStore.sameEmail(u.email, currentUser.email));
      if (userIndex !== -1 && allUsers[userIndex].savedCart) {
        allUsers[userIndex].savedCart[index].qty = Math.max(1, Math.min(99, parseInt(newQty, 10) || 1));
        DashboardStore.saveUsers(allUsers);
        currentUser.savedCart = allUsers[userIndex].savedCart;
        this.render();
        this.syncToCloud(currentUser.savedCart);
        toast('Cart updated.');
      }
    },

    removeItem(index) {
      const allUsers = DashboardStore.getUsers();
      const userIndex = allUsers.findIndex(u => DashboardStore.sameEmail(u.email, currentUser.email));
      if (userIndex !== -1 && allUsers[userIndex].savedCart) {
        allUsers[userIndex].savedCart.splice(index, 1);
        DashboardStore.saveUsers(allUsers);
        currentUser.savedCart = allUsers[userIndex].savedCart;
        this.render();
        this.syncToCloud(currentUser.savedCart);
        toast('Item removed from cart.');
      }
    },

    syncToCloud(cart) {
      const sess = DashboardStore.getSession();
      if (!sess || !sess.email) return;
      const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
        window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
          ? 'http://localhost:5000/api'
          : '/api'
      );
      fetch(`${apiBase}/cart/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sess.email, cart })
      }).catch(e => console.warn('[Dash Cart Sync Warning]:', e));
    }
  };

  /* --------------------------------------------------------------------------
     6. Order History & Refund Requests
     -------------------------------------------------------------------------- */
  const DashboardOrders = {
    container: document.getElementById('dash-orders-container'),

    render() {
      if (!this.container) return;
      const freshUsers = DashboardStore.getUsers();
      const freshUser = freshUsers.find(u => DashboardStore.sameEmail(u.email, session.email));
      const orders = (freshUser && freshUser.orderHistory) || [];

      if (orders.length === 0) {
        this.container.innerHTML = '<p class="empty-state">You haven\'t placed any orders yet.</p>';
        return;
      }

      let html = '';
      const esc = (typeof window.escapeHtml === 'function') ? window.escapeHtml : (str) => String(str || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));

      orders.forEach(order => {
        let statusClass = 'status-pending';
        let statusText = 'Pending Downpayment Verification';
        if (order.status === 'completed' || order.status === 'delivered') {
          statusClass = 'status-completed';
          statusText = 'Delivered / Completed';
        } else if (order.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Cancelled & Refunded';
        } else if (order.status === 'cancellation_requested') {
          statusClass = 'status-pending';
          statusText = 'Cancellation & Refund Requested';
        } else if (order.status === 'baking' || order.status === 'processing' || order.status === 'preparing') {
          statusClass = 'status-pending';
          statusText = 'In Production / Baking';
        } else if (order.status === 'out_for_delivery') {
          statusClass = 'status-pending';
          statusText = 'Out for Delivery';
        }

        const downpayment = order.downpayment !== undefined ? Number(order.downpayment) : Math.round(Number(order.total || 0) * 0.5);
        const balance = order.balance !== undefined ? Number(order.balance) : (Number(order.total || 0) - downpayment);
        const method = esc(order.paymentMethod || 'GCash');
        const refNo = order.referenceNumber ? `(Ref: ${esc(order.referenceNumber)})` : '';

        const itemsHtml = `
          <div style="font-size:0.8rem; font-weight:bold; padding: 4px 0; display:flex; justify-content:space-between; color:#666; border-bottom: 1px solid #ddd;">
            <span style="flex:1;">Product Name</span>
            <span style="flex:1; text-align:center;">Bundle(pcs)</span>
            <span style="flex:1; text-align:right;">Price</span>
          </div>
        ` + (order.items || []).map(i => `
          <div style="font-size:0.85rem; padding: 6px 0; display:flex; justify-content:space-between; border-bottom: 1px dashed #eee;">
            <span style="flex:1;">${esc(i.name)}</span>
            <span style="flex:1; text-align:center;">${Number(i.qty) || 1} Bundle(${(Number(i.qty) || 1) * (Number(i.min) || 100)} pcs)</span>
            <span style="flex:1; text-align:right;">\u20B1${((Number(i.price) || 0) * (Number(i.qty) || 1)).toLocaleString()}</span>
          </div>
        `).join('');

        let refundActionHtml = '';
        if (order.status === 'cancellation_requested') {
          refundActionHtml = `
            <div style="width:100%; background:#fff3cd; border:1px solid #ffeeba; border-radius:6px; padding:0.65rem 0.85rem; margin-top:0.5rem; font-size:0.82rem; color:#856404;">
              <div style="font-weight:700; display:flex; align-items:center; gap:0.4rem; margin-bottom:0.25rem;">
                <i class="fas fa-clock"></i> Cancellation & Downpayment Refund in Review
              </div>
              <div>
                We received your request to cancel this order and refund <strong>\u20B1${downpayment.toLocaleString()}</strong> to your ${esc(order.refundDetails?.wallet || 'E-Wallet')} (${esc(order.refundDetails?.accountNum || '')}).
              </div>
              ${order.refundDetails?.reason ? `<div style="font-size:0.75rem; margin-top:0.25rem; color:#6d5203;"><strong>Reason:</strong> ${esc(order.refundDetails.reason)}</div>` : ''}
              <div style="font-size:0.75rem; color:#856404; opacity:0.85; margin-top:0.25rem;">
                Our bakery team is reviewing your request and will credit your account within 24 hours.
              </div>
            </div>
          `;
        } else if (order.status === 'cancelled') {
          refundActionHtml = `
            <div style="width:100%; background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; padding:0.65rem 0.85rem; margin-top:0.5rem; font-size:0.82rem; color:#721c24;">
              <i class="fas fa-check-circle"></i> <strong>Order Cancelled:</strong> This order has been cancelled and the 50% downpayment refund (\u20B1${downpayment.toLocaleString()}) processed.
            </div>
          `;
        } else if (order.status === 'completed' || order.status === 'delivered' || order.status === 'out_for_delivery' || order.status === 'baking' || order.status === 'processing' || order.status === 'preparing') {
          refundActionHtml = `
            <div style="width:100%; text-align:right; margin-top:0.35rem; font-size:0.78rem; color:#888;">
              <i class="fas fa-lock"></i> Order in production / completed — cancellation closed.
            </div>
          `;
        } else if (order.orderId) {
          refundActionHtml = `
            <div style="text-align:right; width:100%; margin-top:0.4rem;">
              <button type="button" class="btn btn-danger-outline btn-sm request-order-cancel-btn" data-order-id="${esc(order.orderId)}" style="font-size:0.8rem; padding:0.35rem 0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:0.4rem; cursor:pointer;">
                <i class="fas fa-undo-alt"></i> Request Cancellation & Refund
              </button>
            </div>
          `;
        }

        html += `
          <div class="order-item" style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; padding: 1rem; border: 1px solid #eee; border-radius: 8px; margin-bottom: 1rem;">
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <strong style="display:inline-flex; align-items:center; gap:0.4rem; color:#333;">
                <i class="far fa-calendar-alt" style="color:var(--primary);"></i> <span>Order Placed: ${esc(order.date)}</span>
              </strong>
              <div class="order-status ${statusClass}">${statusText}</div>
            </div>
            <div style="width:100%; border-top: 1px solid #eee; padding-top: 0.5rem; margin-top: 0.5rem;">
              ${itemsHtml}
            </div>

            <!-- 50% Downpayment & Delivery Balance Breakdown -->
            <div style="width:100%; background: #faf6f3; border: 1px dashed #ebd9c8; border-radius: 6px; padding: 0.65rem 0.85rem; margin-top: 0.5rem; font-size: 0.85rem;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 3px;">
                <span style="color:#666;">Total Order Value:</span>
                <strong>\u20B1${(Number(order.total) || 0).toLocaleString()}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom: 3px; color:#28a745;">
                <span><i class="fas fa-check-circle"></i> 50% Downpayment Paid (${method} ${refNo}):</span>
                <strong>\u20B1${downpayment.toLocaleString()}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; color:var(--primary); font-weight:700; border-top:1px dashed #ebd9c8; padding-top:4px; margin-top:4px;">
                <span><i class="fas fa-truck"></i> Balance Due on Delivery:</span>
                <span>\u20B1${balance.toLocaleString()}</span>
              </div>
            </div>
            ${refundActionHtml}
          </div>
        `;
      });

      this.container.innerHTML = html;
    },

    openCancelOrderModal(orderId) {
      const freshUsers = DashboardStore.getUsers();
      const freshUser = freshUsers.find(u => DashboardStore.sameEmail(u.email, session.email));
      const order = (freshUser && freshUser.orderHistory || []).find(o => o.orderId === orderId);
      if (!order) return;

      const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(order.total * 0.5);
      const defaultWallet = order.paymentMethod === 'PayMaya' ? 'PayMaya' : 'GCash';
      const defaultContact = (order.customer?.contact || currentUser.contact || '').replace(/\D/g, '').slice(0, 11);
      const defaultName = order.customer?.name || currentUser.name || '';

      document.getElementById('cancel-order-modal-wrap')?.remove();

      const modalHtml = `
        <div id="cancel-order-modal-wrap" class="overlay active" style="z-index:9999;">
          <div class="modal active" style="max-width:480px; width:92%; padding: 1.75rem; border-radius:var(--radius); background:var(--white);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid #eee; padding-bottom:0.75rem;">
              <h3 style="color:var(--primary); font-size:1.15rem; margin:0; display:flex; align-items:center; gap:0.5rem;">
                <i class="fas fa-undo-alt" style="color:#dc3545;"></i> Cancel Order & Request Refund
              </h3>
              <button id="cancel-modal-x-btn" style="background:none; border:none; font-size:1.4rem; color:var(--gray); cursor:pointer; line-height:1;" aria-label="Close">&times;</button>
            </div>

            <!-- Order Summary Details -->
            <div style="background:#faf6f3; border:1px dashed #ebd9c8; border-radius:8px; padding:0.75rem 0.9rem; margin-bottom:1rem; font-size:0.85rem;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:#666;">Order Placed:</span>
                <strong style="color:var(--primary);">${order.date}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:#666;">Total Order Value:</span>
                <strong>\u20B1${order.total.toLocaleString()}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; color:#28a745; font-weight:700;">
                <span><i class="fas fa-check-circle"></i> 50% Downpayment to Refund:</span>
                <span>\u20B1${downpayment.toLocaleString()}</span>
              </div>
              <div style="font-size:0.75rem; color:#888; border-top:1px dashed #ebd9c8; padding-top:4px; margin-top:4px;">
                <i class="fas fa-info-circle"></i> Bakery policy: 50% downpayment will be refunded to your designated e-wallet within 24 hours.
              </div>
            </div>

            <form id="cancel-order-modal-form">
              <div class="form-group" style="margin-bottom:0.75rem; text-align:left;">
                <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.3rem;">Reason for Cancellation *</label>
                <select class="form-select" id="cr-reason" required style="font-size:0.85rem; padding:0.5rem 0.75rem;">
                  <option value="" disabled selected>Select reason for cancellation...</option>
                  <option value="Change of plans / Event cancelled">Change of plans / Event cancelled</option>
                  <option value="Accidental or duplicate order">Accidental or duplicate order</option>
                  <option value="Ordered wrong items or quantity">Ordered wrong items or quantity</option>
                  <option value="Delivery date / schedule conflict">Delivery date / schedule conflict</option>
                  <option value="Found another supplier">Found another supplier</option>
                  <option value="Other reason">Other reason</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom:0.75rem; text-align:left;">
                <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.3rem;">Refund To (E-Wallet) *</label>
                <select class="form-select" id="cr-wallet" required style="font-size:0.85rem; padding:0.5rem 0.75rem;">
                  <option value="GCash" ${defaultWallet === 'GCash' ? 'selected' : ''}>GCash</option>
                  <option value="PayMaya" ${defaultWallet === 'PayMaya' ? 'selected' : ''}>Maya / PayMaya</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom:0.75rem; text-align:left;">
                <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.3rem;">E-Wallet Account / Mobile Number *</label>
                <input type="tel" class="form-input" id="cr-accnum" placeholder="09XXXXXXXXX" maxlength="11" value="${defaultContact}" required style="font-size:0.85rem; padding:0.5rem 0.75rem;">
                <div style="font-size:0.75rem; color:#888; margin-top:2px;">11-digit mobile number registered with your e-wallet (e.g. 09123456789).</div>
              </div>

              <div class="form-group" style="margin-bottom:1rem; text-align:left;">
                <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.3rem;">Account Holder Full Name *</label>
                <input type="text" class="form-input" id="cr-accname" placeholder="Name as shown on GCash / Maya" value="${defaultName}" required style="font-size:0.85rem; padding:0.5rem 0.75rem;">
              </div>

              <div id="cr-error-box" style="display:none; color:#dc3545; background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; padding:0.5rem 0.75rem; font-size:0.8rem; margin-bottom:0.75rem; text-align:center;"></div>

              <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1rem;">
                <button type="button" id="cr-close-btn" class="btn btn-outline" style="padding:0.5rem 1rem; font-size:0.85rem;">Keep Order</button>
                <button type="submit" class="btn btn-primary" style="padding:0.5rem 1.25rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">
                  <i class="fas fa-undo-alt"></i> Confirm & Request Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const modalWrap = document.getElementById('cancel-order-modal-wrap');
      const closeBtn = document.getElementById('cr-close-btn');
      const xBtn = document.getElementById('cancel-modal-x-btn');
      const form = document.getElementById('cancel-order-modal-form');
      const accNumInput = document.getElementById('cr-accnum');
      const errorBox = document.getElementById('cr-error-box');

      const closeModal = () => modalWrap?.remove();
      closeBtn?.addEventListener('click', closeModal);
      xBtn?.addEventListener('click', closeModal);
      modalWrap?.addEventListener('click', (e) => {
        if (e.target === modalWrap) closeModal();
      });

      // Enforce 11 digits numeric only for e-wallet phone number
      accNumInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
      });

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const reason = document.getElementById('cr-reason')?.value;
        const wallet = document.getElementById('cr-wallet')?.value;
        const accNum = accNumInput?.value.trim();
        const accName = document.getElementById('cr-accname')?.value.trim();

        if (!reason) {
          if (errorBox) {
            errorBox.textContent = 'Please select a reason for cancellation.';
            errorBox.style.display = 'block';
          }
          return;
        }
        if (!accNum || accNum.length !== 11 || !accNum.startsWith('09')) {
          if (errorBox) {
            errorBox.textContent = 'Please enter a valid 11-digit mobile number starting with 09 for your ' + wallet + ' refund.';
            errorBox.style.display = 'block';
          }
          return;
        }
        if (!accName) {
          if (errorBox) {
            errorBox.textContent = 'Please enter the account holder name for your ' + wallet + ' refund.';
            errorBox.style.display = 'block';
          }
          return;
        }

        const doRefundRequest = () => {
          const refundData = {
            reason: reason,
            wallet: wallet,
            accountNum: accNum,
            accountName: accName,
            amount: downpayment,
            requestedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          };

          // 1. Update global tracking registry
          const allOrders = DashboardStore.getAllOrders();
          const targetO = allOrders.find(o => o.orderId === order.orderId);
          if (targetO) {
            targetO.status = 'cancellation_requested';
            targetO.refundDetails = refundData;
            DashboardStore.saveAllOrders(allOrders);
          }

          // 2. Update user order history
          const allUsers = DashboardStore.getUsers();
          let updated = false;
          for (const u of allUsers) {
            if (u.orderHistory) {
              const match = u.orderHistory.find(o => o.orderId === order.orderId);
              if (match) {
                match.status = 'cancellation_requested';
                match.refundDetails = refundData;
                updated = true;
              }
            }
          }
          if (updated) {
            DashboardStore.saveUsers(allUsers);
            currentUser.orderHistory = (allUsers.find(u => DashboardStore.sameEmail(u.email, session.email)) || {}).orderHistory || [];
          }

          // Asynchronously persist cancellation request to Supabase cloud database
          const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
            window.location.protocol === 'file:' ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
              ? 'http://localhost:5000/api'
              : '/api'
          );
          fetch(`${apiBase}/orders/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              orderId: order.orderId,
              email: session.email,
              refundDetails: refundData
            })
          }).catch(e => console.warn('[Cloud Order Cancel Notice]:', e));

          closeModal();
          DashboardOrders.render();
          toast('Cancellation & downpayment refund request submitted successfully.');
        };

        if (window.WeBakeModals && typeof window.WeBakeModals.confirmRefund === 'function') {
          window.WeBakeModals.confirmRefund({
            orderDate: order.date,
            downpayment: downpayment,
            wallet: wallet,
            accNum: accNum,
            onConfirm: doRefundRequest
          });
        }
      });
    },

    initDelegation() {
      this.container?.addEventListener('click', (e) => {
        const btn = e.target.closest('.request-order-cancel-btn');
        if (btn) {
          const orderId = btn.getAttribute('data-order-id');
          if (orderId) this.openCancelOrderModal(orderId);
        }
      });
    }
  };

  /* --------------------------------------------------------------------------
     7. Wholesale Partnership Status & Cancellation
     -------------------------------------------------------------------------- */
  const DashboardPartnership = {
    render() {
      const partnerBadge = document.getElementById('dash-partner-badge');
      const partnerCta = document.getElementById('dash-partner-cta');
      const partnerActions = document.getElementById('dash-partner-actions');
      if (!partnerBadge || !partnerCta || !partnerActions) return;

      const allUsers = DashboardStore.getUsers();
      let freshUser = allUsers.find(u => DashboardStore.sameEmail(u.email, session.email));
      if (!freshUser) {
        freshUser = currentUser || { email: session.email, name: session.name, partnerStatus: session.partnerStatus || 'none' };
      }

      // Fallback check against cached partner applications
      const allApps = DashboardStore.getApplications();
      const myApp = allApps.find(a => 
        DashboardStore.sameEmail(a.email, session.email) || 
        (a.details && DashboardStore.sameEmail(a.details.email, session.email))
      );

      // Determine effective partner status: user/session status always takes precedence over cached applications
      let status = 'none';
      if (freshUser.partnerStatus && freshUser.partnerStatus !== 'none') {
        status = freshUser.partnerStatus.toLowerCase();
      } else if (session.partnerStatus && session.partnerStatus !== 'none') {
        status = session.partnerStatus.toLowerCase();
      } else if (myApp && myApp.status) {
        status = myApp.status.toLowerCase();
      }

      const partnerDetails = freshUser.partnerDetails || session.partnerDetails || myApp?.details || {};
      const staffNotes = partnerDetails.adminNotes || partnerDetails.staffNotes || '';
      const businessName = partnerDetails['business-name'] || partnerDetails['bakery-name'] || partnerDetails.businessName || partnerDetails.bakeryName || '';
      const appId = freshUser.partnerAppId || session.partnerAppId || myApp?.appId || '';

      partnerActions.innerHTML = '';

      if (status === 'active' || status === 'approved' || status === 'accepted') {
        partnerBadge.className = 'partner-badge badge-active';
        partnerBadge.removeAttribute('style');
        partnerBadge.innerHTML = '<i class="fas fa-check-circle"></i> Active Wholesale Partner';
        partnerCta.innerHTML = `
          <div style="background:#d4edda; border-left:4px solid #28a745; padding:12px 14px; border-radius:6px; margin-bottom:10px; color:#155724; font-size:0.875rem; line-height:1.5;">
            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">
              <i class="fas fa-certificate"></i> Congratulations! Your Wholesale Partnership is Approved
            </div>
            <div>You are officially registered as a wholesale partner${businessName ? ` for <strong>${businessName}</strong>` : ''}. You now have access to wholesale bulk discounts and priority batch deliveries.</div>
            ${appId ? `<div style="margin-top:6px; font-size:0.8rem; color:#1e7e34;"><strong>Partner ID:</strong> <code>${appId}</code></div>` : ''}
            ${staffNotes ? `<div style="margin-top:8px; font-style:italic; font-size:0.8rem; color:#155724; background:rgba(255,255,255,0.7); padding:6px 10px; border-radius:4px; border:1px solid #c3e6cb;"><strong>Bakery Note:</strong> "${staffNotes}"</div>` : ''}
          </div>
        `;
        partnerCta.style.display = 'block';
        partnerActions.innerHTML = `
          <a href="partner.html" class="btn btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem;"><i class="fas fa-eye"></i> View Partnership Details</a>
          <button id="cancel-partner-btn" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">Cancel Partnership</button>
        `;
      } else if (status === 'rejected' || status === 'declined') {
        partnerBadge.className = 'partner-badge badge-rejected';
        partnerBadge.removeAttribute('style');
        partnerBadge.innerHTML = '<i class="fas fa-times-circle"></i> Application Not Approved';
        partnerCta.innerHTML = `
          <div style="background:#f8d7da; border-left:4px solid #dc3545; padding:10px 14px; border-radius:6px; margin-bottom:10px; color:#721c24; font-size:0.875rem; line-height:1.5;">
            <strong>Application Notice:</strong> Your wholesale partnership application was <strong>DECLINED</strong> at this time.
            ${staffNotes ? `<div style="margin-top:6px; font-style:italic; font-size:0.8rem; color:#721c24; background:rgba(255,255,255,0.6); padding:4px 8px; border-radius:4px;"><strong>Reason / Notes:</strong> "${staffNotes}"</div>` : ''}
            <div style="margin-top:6px; font-size:0.8rem; color:#721c24;">You may review your business profile and submit a revised application.</div>
          </div>
        `;
        partnerCta.style.display = 'block';
        partnerActions.innerHTML = `
          <a href="partner.html" class="btn btn-primary" style="padding:0.4rem 1.25rem; font-size:0.85rem;"><i class="fas fa-redo"></i> Re-apply for Partnership</a>
        `;
      } else if (status === 'under_review' || status === 'reviewing' || status === 'contacted') {
        partnerBadge.className = 'partner-badge badge-reviewing';
        partnerBadge.removeAttribute('style');
        partnerBadge.innerHTML = '<i class="fas fa-user-clock"></i> Under Review / Contacted';
        partnerCta.innerHTML = `
          <div style="background:#f0f9ff; border-left:4px solid #0284c7; padding:12px 14px; border-radius:6px; margin-bottom:10px; color:#0369a1; font-size:0.875rem; line-height:1.5;">
            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">
              <i class="fas fa-user-clock"></i> Application Under Review / Store Contacted
            </div>
            <div>Bakery management is actively reviewing your store details and evaluating delivery logistics. Our team may reach out to you directly to confirm requirements.</div>
            ${appId ? `<div style="margin-top:6px; font-size:0.8rem; color:#0284c7;"><strong>Reference ID:</strong> <code>${appId}</code></div>` : ''}
            ${staffNotes ? `<div style="margin-top:8px; font-style:italic; font-size:0.8rem; color:#0369a1; background:rgba(255,255,255,0.85); padding:6px 10px; border-radius:4px; border:1px solid #bae6fd;"><strong>Bakery Note:</strong> "${staffNotes}"</div>` : ''}
          </div>
        `;
        partnerCta.style.display = 'block';
        partnerActions.innerHTML = `
          <a href="partner.html" class="btn btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem;"><i class="fas fa-edit"></i> Edit Application</a>
          <button id="cancel-partner-btn" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">Cancel Request</button>
        `;
      } else if (status === 'pending') {
        partnerBadge.className = 'partner-badge badge-pending';
        partnerBadge.removeAttribute('style');
        partnerBadge.innerHTML = '<i class="fas fa-clock"></i> Application Pending for Review';
        partnerCta.innerHTML = `
          <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:12px 14px; border-radius:6px; margin-bottom:10px; color:#856404; font-size:0.875rem; line-height:1.5;">
            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">
              <i class="fas fa-clock"></i> Application Pending for Review
            </div>
            <div>Your wholesale partnership application has been submitted and is currently pending review by bakery management. Our team usually reviews applications within 24–48 hours.</div>
            ${appId ? `<div style="margin-top:6px; font-size:0.8rem; color:#856404;"><strong>Reference ID:</strong> <code>${appId}</code></div>` : ''}
          </div>
        `;
        partnerCta.style.display = 'block';
        partnerActions.innerHTML = `
          <a href="partner.html" class="btn btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem;"><i class="fas fa-edit"></i> Edit Application</a>
          <button id="cancel-partner-btn" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">Cancel Request</button>
        `;
      } else if (status === 'cancelled') {
        partnerBadge.className = 'partner-badge badge-cancelled';
        partnerBadge.removeAttribute('style');
        partnerBadge.innerHTML = '<i class="fas fa-ban"></i> Partnership Cancelled';
        partnerCta.innerHTML = `
          <div style="background:#f8f9fa; border-left:4px solid #6c757d; padding:10px 14px; border-radius:6px; margin-bottom:10px; color:#495057; font-size:0.875rem; line-height:1.5;">
            <strong>Partnership Notice:</strong> Your wholesale partnership has been <strong>cancelled</strong>.
            <div style="margin-top:6px; font-size:0.8rem; color:#6c757d;">You can submit a new application anytime if you wish to partner with WeBake again in the future.</div>
          </div>
        `;
        partnerCta.style.display = 'block';
        partnerActions.innerHTML = `
          <a href="partner.html" class="btn btn-outline" style="padding:0.4rem 1.25rem; font-size:0.85rem;"><i class="fas fa-handshake"></i> Apply Again</a>
        `;
      } else {
        partnerBadge.className = 'partner-badge badge-none';
        partnerBadge.removeAttribute('style');
        partnerBadge.innerHTML = '<i class="fas fa-minus-circle"></i> No Partnership';
        partnerCta.innerHTML = 'Interested in wholesale? <a href="partner.html">Apply to be a partner today!</a>';
        partnerCta.style.display = 'block';

        if (!window._partnerDirectSyncTriggered) {
          window._partnerDirectSyncTriggered = true;
          setTimeout(() => syncFromCloud(), 10);
        }
      }

      const cancelBtn = document.getElementById('cancel-partner-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          const doCancel = async () => {
            const freshAll = DashboardStore.getUsers();
            const target = freshAll.find(u => DashboardStore.sameEmail(u.email, session.email));
            const savedAppId = target?.partnerAppId || session.partnerAppId || myApp?.appId;

            if (target) {
              target.partnerStatus = 'cancelled';
              target.role = 'customer';
              target.roleId = 1;
              target.partnerDetails = null;
              DashboardStore.saveUsers(freshAll);
            }

            // Also update persistent session
            session.partnerStatus = 'cancelled';
            session.role = 'customer';
            session.roleId = 1;
            session.partnerDetails = null;
            DashboardStore.saveSession(session);

            const allApps = DashboardStore.getApplications();
            let appChanged = false;
            allApps.forEach(a => {
              if ((savedAppId && a.appId && a.appId.toUpperCase() === savedAppId.toUpperCase()) ||
                  (a.details?.email && DashboardStore.sameEmail(a.details.email, session.email)) ||
                  (a.email && DashboardStore.sameEmail(a.email, session.email))) {
                a.status = 'cancelled';
                a.cancelledAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                appChanged = true;
              }
            });
            if (appChanged) {
              DashboardStore.saveApplications(allApps);
            }

            // Immediately re-render cancelled UI
            this.render();
            toast('Partnership request cancelled.');
            window.dispatchEvent(new CustomEvent('weBakePartnerChange'));

            // Persist to Supabase cloud database
            const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
              window.location.protocol === 'file:' ||
              window.location.hostname === 'localhost' ||
              window.location.hostname === '127.0.0.1'
                ? 'http://localhost:5000/api'
                : '/api'
            );
            try {
              await fetch(`${apiBase}/partner/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: session.email, appId: savedAppId })
              });
              // Perform cloud sync so all state is verified and remains cancelled
              await syncFromCloud();
            } catch (e) {
              console.warn('[Cloud Partner Cancel Notice]:', e);
            }
          };

          if (window.WeBakeModals && typeof window.WeBakeModals.confirmCancelPartner === 'function') {
            window.WeBakeModals.confirmCancelPartner({ onConfirm: doCancel });
          }
        });
      }
    }
  };

  /* --------------------------------------------------------------------------
     8. Initialization & Real-Time Sync
     -------------------------------------------------------------------------- */
  DashboardProfile.init();
  DashboardCart.render();
  DashboardOrders.render();
  DashboardOrders.initDelegation();
  DashboardPartnership.render();

  // Multi-tab storage sync
  window.addEventListener('storage', (e) => {
    if (e.key === DashboardStore.KEYS.USERS || e.key === DashboardStore.KEYS.APPS) {
      DashboardCart.render();
      DashboardOrders.render();
      DashboardPartnership.render();
    }
  });

  // Background cloud database sync
  async function syncFromCloud() {
    try {
      const sess = DashboardStore.getSession();
      if (!sess || !sess.email) return;
      const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
        window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
          ? 'http://localhost:5000/api'
          : '/api'
      );
      const res = await fetch(`${apiBase}/auth/sync?email=${encodeURIComponent(sess.email)}`);
      const data = await res.json();
      if (data && data.success && data.user) {
        const allUsers = DashboardStore.getUsers();
        let idx = allUsers.findIndex(u => DashboardStore.sameEmail(u.email, sess.email));
        if (idx !== -1) {
          allUsers[idx] = Object.assign(allUsers[idx], data.user);
        } else {
          allUsers.push(data.user);
          idx = allUsers.length - 1;
        }
        DashboardStore.saveUsers(allUsers);
        currentUser = allUsers[idx];

        // Also update session partner status
        if (sess) {
          sess.partnerStatus = data.user.partnerStatus;
          sess.role = data.user.role;
          sess.roleId = data.user.roleId;
          sess.roleTitle = data.user.roleTitle;
          DashboardStore.saveSession(sess);
        }

        // Also sync to weBakePartnerApplications so edit & tracking modals find it
        const appId = currentUser.partnerAppId || data.user.partnerAppId;
        if (appId) {
          const allApps = DashboardStore.getApplications();
          let app = allApps.find(a => a.appId && a.appId.toUpperCase() === appId.toUpperCase());
          if (!app) {
            app = {
              appId: appId,
              email: currentUser.email,
              phone: currentUser.contact || '',
              date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
              status: currentUser.partnerStatus || 'pending',
              details: currentUser.partnerDetails || {}
            };
            allApps.unshift(app);
          } else {
            app.status = currentUser.partnerStatus || app.status;
            if (currentUser.partnerDetails) {
              app.details = { ...(app.details || {}), ...currentUser.partnerDetails };
            }
          }
          DashboardStore.saveApplications(allApps);
        }

        DashboardProfile.init();
        DashboardCart.render();
        DashboardOrders.render();
        DashboardPartnership.render();
      }
    } catch (e) {
      console.warn('[Dashboard Cloud Sync Error]:', e);
    }
  }
  syncFromCloud();
});
