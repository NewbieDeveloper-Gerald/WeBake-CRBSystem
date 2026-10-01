/* ==============================================
   WeBake - Dashboard JavaScript (dashboard.js)
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  // --- Check Authentication (Guard) ---
  const sessionString = localStorage.getItem('weBakeSession');
  if (!sessionString) {
    // If not logged in, redirect to home
    window.location.href = 'home.html';
    return;
  }
  
  const session = JSON.parse(sessionString);
  const USERS_KEY = 'weBakeUsers';
  const getUsers = () => JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  const users = getUsers();
  const currentUser = users.find(u => u.email === session.email);

  if (!currentUser) {
    localStorage.removeItem('weBakeSession');
    window.location.href = 'home.html';
    return;
  }

  // --- Populate Profile Form ---
  const nameInput = document.getElementById('dash-name');
  const contactInput = document.getElementById('dash-contact');
  const emailInput = document.getElementById('dash-email');
  const addressInput = document.getElementById('dash-address');

  if (nameInput) nameInput.value = currentUser.name || '';
  if (contactInput) contactInput.value = currentUser.contact || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (addressInput) addressInput.value = currentUser.address || '';

  // --- Handle Profile Save ---
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const newName = nameInput.value.trim();
      const newContact = contactInput.value.trim();
      const newAddress = addressInput.value.trim();
      
      // Update in local storage
      const allUsers = getUsers();
      const userIndex = allUsers.findIndex(u => u.email === currentUser.email);
      if (userIndex !== -1) {
        allUsers[userIndex].name = newName;
        allUsers[userIndex].contact = newContact;
        allUsers[userIndex].address = newAddress;
        localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
        
        // Update session name if changed
        session.name = newName;
        localStorage.setItem('weBakeSession', JSON.stringify(session));
        
        // Also update the local currentUser object so other functions see it
        currentUser.name = newName;
        currentUser.contact = newContact;
        currentUser.address = newAddress;
        
        showToast('Profile updated successfully!');
      } else {
        showToast('Error saving profile.');
      }
    });
  }

  // --- Render Saved Cart ---
  const cartContainer = document.getElementById('dash-cart-container');
  function renderCart() {
    if (!cartContainer) return;
    const cart = currentUser.savedCart || [];
    
    if (cart.length === 0) {
      cartContainer.innerHTML = '<div style="text-align:center; padding:1.5rem 0;"><p class="empty-state">Your cart is empty.</p><a href="products.html" class="btn btn-primary" style="margin-top:0.5rem;"><i class="fas fa-shopping-bag"></i> Start Shopping</a></div>';
      return;
    }

    let html = '<table class="cart-table"><thead><tr><th style="width:30px;"><input type="checkbox" id="cart-select-all" checked></th><th style="text-align:left;">Product Name</th><th style="text-align:center;">Bundle(pcs)</th><th style="text-align:right;">Price</th><th></th></tr></thead><tbody>';
    let total = 0;

    cart.forEach((item, index) => {
      const itemTotal = item.price * item.qty;
      total += itemTotal;
      html += `
        <tr>
          <td><input type="checkbox" class="cart-item-check" data-index="${index}" data-price="${itemTotal}" checked></td>
          <td><strong>${item.name}</strong></td>
          <td style="text-align:center;">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;">
              <div style="display:flex; align-items:center; gap:0.25rem;">
                <button class="cart-qty-btn btn btn-outline" data-index="${index}" data-action="minus" style="padding:0 0.4rem; cursor:pointer; min-width:unset; line-height:1.2;">-</button>
                <span style="font-weight:bold; min-width:1.5rem; text-align:center;">${item.qty}</span>
                <button class="cart-qty-btn btn btn-outline" data-index="${index}" data-action="plus" style="padding:0 0.4rem; cursor:pointer; min-width:unset; line-height:1.2;">+</button>
              </div>
              <span style="font-size:0.75rem; color:#666;">(${item.qty * (item.min || 100)} pcs)</span>
            </div>
          </td>
          <td style="text-align:right;">\u20B1${itemTotal.toFixed(2)}</td>
          <td style="text-align:right;">
            <button class="remove-btn" data-index="${index}" title="Remove" style="color:#dc3545; background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });
    
    html += `</tbody></table>
      <div style="display:flex; flex-direction:column; align-items:flex-end; margin-top: 1rem; gap: 0.5rem;">
        <div class="cart-total" style="margin:0;">Total: \u20B1${total.toFixed(2)}</div>
        <div style="display:flex; gap:0.5rem;">
          <a href="products.html" class="btn btn-outline" style="padding: 0.5rem 1.5rem;"><i class="fas fa-arrow-left"></i> Continue Browsing</a>
          <button id="dash-checkout-btn" class="btn btn-primary" style="padding: 0.5rem 1.5rem;"><i class="fas fa-shopping-cart"></i> Checkout Now</button>
        </div>
      </div>`;
    cartContainer.innerHTML = html;

    const itemChecks = cartContainer.querySelectorAll('.cart-item-check');
    const selectAll = document.getElementById('cart-select-all');
    const totalEl = cartContainer.querySelector('.cart-total');

    function updateSelectedTotal() {
      let currentTotal = 0;
      itemChecks.forEach(chk => {
        if (chk.checked) currentTotal += parseFloat(chk.getAttribute('data-price'));
      });
      if (totalEl) totalEl.textContent = 'Total: \u20B1' + currentTotal.toFixed(2);
      if (selectAll) selectAll.checked = Array.from(itemChecks).every(c => c.checked);
    }

    itemChecks.forEach(chk => chk.addEventListener('change', updateSelectedTotal));
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        itemChecks.forEach(chk => chk.checked = e.target.checked);
        updateSelectedTotal();
      });
    }

    const dashCheckoutBtn = document.getElementById('dash-checkout-btn');
    if (dashCheckoutBtn) {
      dashCheckoutBtn.addEventListener('click', () => {
        const selectedIndices = [];
        itemChecks.forEach(chk => {
          if (chk.checked) selectedIndices.push(chk.getAttribute('data-index'));
        });
        if (selectedIndices.length === 0) {
          showToast('Please select at least one item to checkout.');
          return;
        }
        window.location.href = 'products.html?checkout=true&items=' + selectedIndices.join(',');
      });
    }

    const qtyBtns = cartContainer.querySelectorAll('.cart-qty-btn');
    qtyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        const action = e.currentTarget.getAttribute('data-action');
        const currentItem = currentUser.savedCart[idx];
        let newQty = currentItem.qty;
        if (action === 'minus') newQty = Math.max(1, newQty - 1);
        if (action === 'plus') newQty += 1;
        updateCartItem(idx, newQty);
      });
    });

    const removeBtns = cartContainer.querySelectorAll('.remove-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        removeCartItem(idx);
      });
    });
  }

  function updateCartItem(index, newQty) {
    const allUsers = getUsers();
    const userIndex = allUsers.findIndex(u => u.email === currentUser.email);
    if (userIndex !== -1 && allUsers[userIndex].savedCart) {
      allUsers[userIndex].savedCart[index].qty = newQty;
      localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
      currentUser.savedCart = allUsers[userIndex].savedCart;
      renderCart();
      showToast('Cart updated.');
    }
  }

  function removeCartItem(index) {
    const allUsers = getUsers();
    const userIndex = allUsers.findIndex(u => u.email === currentUser.email);
    if (userIndex !== -1 && allUsers[userIndex].savedCart) {
      allUsers[userIndex].savedCart.splice(index, 1);
      localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
      currentUser.savedCart = allUsers[userIndex].savedCart;
      renderCart();
      showToast('Item removed from cart.');
    }
  }

  renderCart();

  // --- Render Order History ---
  const ordersContainer = document.getElementById('dash-orders-container');
  function renderOrders() {
    if (!ordersContainer) return;
    const freshUsers = getUsers();
    const freshUser = freshUsers.find(u => u.email === session.email);
    const orders = (freshUser && freshUser.orderHistory) || [];
    if (orders.length === 0) {
      ordersContainer.innerHTML = '<p class="empty-state">You haven\'t placed any orders yet.</p>';
    } else {
      let html = '';
      orders.forEach(order => {
        // order status: completed, pending, cancelled
        let statusClass = 'status-pending';
        let statusText = 'Pending Downpayment Verification';
        if (order.status === 'completed') { 
          statusClass = 'status-completed'; 
          statusText = 'Completed'; 
        } else if (order.status === 'cancelled') { 
          statusClass = 'status-cancelled'; 
          statusText = 'Cancelled & Refunded'; 
        } else if (order.status === 'cancellation_requested') {
          statusClass = 'status-pending';
          statusText = 'Cancellation & Refund Requested';
        } else if (order.status === 'processing' || order.status === 'preparing') {
          statusClass = 'status-pending';
          statusText = 'In Production / Preparing';
        }

        const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(order.total * 0.5);
        const balance = order.balance !== undefined ? order.balance : (order.total - downpayment);
        const method = order.paymentMethod || 'GCash';
        const refNo = order.referenceNumber ? `(Ref: ${order.referenceNumber})` : '';
        const orderIdDisplay = order.orderId ? `<span style="font-weight:700; color:var(--primary);">${order.orderId}</span> · ` : '';
        
        let itemsHtml = `
          <div style="font-size:0.8rem; font-weight:bold; padding: 4px 0; display:flex; justify-content:space-between; color:#666; border-bottom: 1px solid #ddd;">
            <span style="flex:1;">Product Name</span>
            <span style="flex:1; text-align:center;">Bundle(pcs)</span>
            <span style="flex:1; text-align:right;">Price</span>
          </div>
        ` + (order.items || []).map(i => {
          return `<div style="font-size:0.85rem; padding: 6px 0; display:flex; justify-content:space-between; border-bottom: 1px dashed #eee;">
                    <span style="flex:1;">${i.name}</span>
                    <span style="flex:1; text-align:center;">${i.qty} Bundle(${i.qty * (i.min || 100)} pcs)</span>
                    <span style="flex:1; text-align:right;">\u20B1${(i.price * i.qty).toLocaleString()}</span>
                  </div>`;
        }).join('');

        let refundActionHtml = '';
        if (order.status === 'cancellation_requested') {
          refundActionHtml = `
            <div style="width:100%; background:#fff3cd; border:1px solid #ffeeba; border-radius:6px; padding:0.65rem 0.85rem; margin-top:0.5rem; font-size:0.82rem; color:#856404;">
              <div style="font-weight:700; display:flex; align-items:center; gap:0.4rem; margin-bottom:0.25rem;">
                <i class="fas fa-clock"></i> Cancellation & Downpayment Refund in Review
              </div>
              <div>
                We received your request to cancel this order and refund <strong>\u20B1${downpayment.toLocaleString()}</strong> to your ${order.refundDetails?.wallet || 'E-Wallet'} (${order.refundDetails?.accountNum || ''}).
              </div>
              ${order.refundDetails?.reason ? `<div style="font-size:0.75rem; margin-top:0.25rem; color:#6d5203;"><strong>Reason:</strong> ${order.refundDetails.reason}</div>` : ''}
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
        } else if (order.status === 'completed' || order.status === 'processing' || order.status === 'preparing') {
          refundActionHtml = `
            <div style="width:100%; text-align:right; margin-top:0.35rem; font-size:0.78rem; color:#888;">
              <i class="fas fa-lock"></i> Order in production / completed — cancellation closed.
            </div>
          `;
        } else if (order.orderId) {
          refundActionHtml = `
            <div style="text-align:right; width:100%; margin-top:0.4rem;">
              <button type="button" class="btn btn-danger-outline btn-sm request-order-cancel-btn" data-order-id="${order.orderId}" style="font-size:0.8rem; padding:0.35rem 0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:0.4rem; cursor:pointer;">
                <i class="fas fa-undo-alt"></i> Request Cancellation & Refund
              </button>
            </div>
          `;
        }

        html += `
          <div class="order-item" style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; padding: 1rem; border: 1px solid #eee; border-radius: 8px; margin-bottom: 1rem;">
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <strong><i class="fas fa-receipt"></i> ${orderIdDisplay}<span style="color:#777; font-weight:500;"><i class="far fa-calendar-alt"></i> ${order.date}</span></strong>
              <div class="order-status ${statusClass}">${statusText}</div>
            </div>
            <div style="width:100%; border-top: 1px solid #eee; padding-top: 0.5rem; margin-top: 0.5rem;">
              ${itemsHtml}
            </div>
            
            <!-- 50% Downpayment & Delivery Balance Breakdown -->
            <div style="width:100%; background: #faf6f3; border: 1px dashed #ebd9c8; border-radius: 6px; padding: 0.65rem 0.85rem; margin-top: 0.5rem; font-size: 0.85rem;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 3px;">
                <span style="color:#666;">Total Order Value:</span>
                <strong>\u20B1${order.total.toLocaleString()}</strong>
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
      ordersContainer.innerHTML = html;
    }
  }

  // --- Modal for Requesting Order Cancellation & Downpayment Refund ---
  function openCancelOrderModal(orderId) {
    const freshUsers = getUsers();
    const freshUser = freshUsers.find(u => u.email === session.email);
    const order = (freshUser && freshUser.orderHistory || []).find(o => o.orderId === orderId);
    if (!order) return;

    const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(order.total * 0.5);
    const defaultWallet = order.paymentMethod === 'PayMaya' ? 'PayMaya' : 'GCash';
    const defaultContact = (order.customer?.contact || currentUser.contact || '').replace(/\D/g, '').slice(0, 11);
    const defaultName = order.customer?.name || currentUser.name || '';

    // Remove any existing modal
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
              <span style="color:#666;">Order ID:</span>
              <strong style="color:var(--primary);">${order.orderId}</strong>
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
        if (errorBox) { errorBox.textContent = 'Please select a reason for cancellation.'; errorBox.style.display = 'block'; }
        return;
      }
      if (!accNum || accNum.length !== 11 || !accNum.startsWith('09')) {
        if (errorBox) { errorBox.textContent = 'Please enter a valid 11-digit mobile number starting with 09 for your ' + wallet + ' refund.'; errorBox.style.display = 'block'; }
        return;
      }
      if (!accName) {
        if (errorBox) { errorBox.textContent = 'Please enter the account holder name for your ' + wallet + ' refund.'; errorBox.style.display = 'block'; }
        return;
      }

      if (!confirm(`Are you sure you want to request cancellation for order ${order.orderId}?\n\nDownpayment of \u20B1${downpayment.toLocaleString()} will be refunded to your ${wallet} account (${accNum}).`)) {
        return;
      }

      const refundData = {
        reason: reason,
        wallet: wallet,
        accountNum: accNum,
        accountName: accName,
        amount: downpayment,
        requestedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      };

      // 1. Update weBakeAllOrders
      const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
      const targetO = allOrders.find(o => o.orderId === order.orderId);
      if (targetO) {
        targetO.status = 'cancellation_requested';
        targetO.refundDetails = refundData;
        localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders));
      }

      // 2. Update weBakeUsers
      const allUsers = getUsers();
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
        localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
        currentUser.orderHistory = (allUsers.find(u => u.email === session.email) || {}).orderHistory || [];
      }

      closeModal();
      renderOrders();
      showToast('Cancellation & downpayment refund request submitted successfully.');
    });
  }

  if (ordersContainer) {
    ordersContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.request-order-cancel-btn');
      if (btn) {
        const orderId = btn.getAttribute('data-order-id');
        if (orderId) openCancelOrderModal(orderId);
      }
    });
  }

  renderOrders();
  window.addEventListener('storage', (e) => {
    if (e.key === USERS_KEY) renderOrders();
  });

  // --- Render Partnership Status ---
  function renderPartnership() {
    const partnerBadge = document.getElementById('dash-partner-badge');
    const partnerCta = document.getElementById('dash-partner-cta');
    const partnerActions = document.getElementById('dash-partner-actions');
    if (!partnerBadge || !partnerCta || !partnerActions) return;

    const allUsers = getUsers();
    const freshUser = allUsers.find(u => u.email === session.email);
    const status = freshUser ? (freshUser.partnerStatus || 'none') : 'none';

    partnerActions.innerHTML = '';

    if (status === 'active') {
      partnerBadge.className = 'partner-badge badge-active';
      partnerBadge.innerHTML = '<i class="fas fa-check-circle"></i> Active Partner';
      partnerCta.style.display = 'none';
      partnerActions.innerHTML = `
        <a href="partner.html" class="btn btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem;">Update Details</a>
        <button id="cancel-partner-btn" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">Cancel Partnership</button>
      `;
    } else if (status === 'pending') {
      partnerBadge.className = 'partner-badge badge-pending';
      partnerBadge.innerHTML = '<i class="fas fa-clock"></i> Application Pending';
      partnerCta.innerHTML = 'Your partnership application is currently being reviewed.';
      partnerCta.style.display = 'block';
      partnerActions.innerHTML = `
        <a href="partner.html" class="btn btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem;">Edit Application</a>
        <button id="cancel-partner-btn" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">Cancel Request</button>
      `;
    } else {
      partnerBadge.className = 'partner-badge badge-none';
      partnerBadge.innerHTML = '<i class="fas fa-minus-circle"></i> No Partnership';
      partnerCta.innerHTML = 'Interested in wholesale? <a href="partner.html">Apply to be a partner today!</a>';
      partnerCta.style.display = 'block';
    }

    const cancelBtn = document.getElementById('cancel-partner-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const modalHtml = `
          <div id="cancel-partner-modal" class="overlay active" style="z-index:9999;">
            <div class="modal active" style="max-width:400px; text-align:center; padding: 2rem;">
              <h3 style="color:#dc3545; margin-bottom:1rem;"><i class="fas fa-exclamation-triangle"></i> Cancel Application</h3>
              <p style="margin-bottom:1.5rem; color:#555;">Are you sure you want to cancel your partnership request? This action cannot be undone.</p>
              <div style="display:flex; justify-content:center; gap:1rem;">
                <button id="cancel-modal-no" class="btn btn-outline">No, Keep It</button>
                <button id="cancel-modal-yes" class="btn btn-primary" style="background:#dc3545; border-color:#dc3545;">Yes, Cancel Request</button>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('cancel-modal-no').addEventListener('click', () => {
          document.getElementById('cancel-partner-modal').remove();
        });

        document.getElementById('cancel-modal-yes').addEventListener('click', () => {
          document.getElementById('cancel-partner-modal').remove();
          const freshAll = getUsers();
          const target = freshAll.find(u => u.email === session.email);
          if (target) {
            target.partnerStatus = 'none';
            target.partnerDetails = null; // Clear their saved info when they cancel
            localStorage.setItem(USERS_KEY, JSON.stringify(freshAll));
            renderPartnership();
            showToast('Partnership cancelled.');
          }
        });
      });
    }
  }

  renderPartnership();
});

