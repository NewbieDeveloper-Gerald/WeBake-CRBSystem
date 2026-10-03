/**
 * ====================================================================
 * WeBake - Transaction Tracking Module (tracking.js)
 * Handles lookup and tracking for:
 *   1. Customer Bread Orders & Downpayment Verification
 *   2. Wholesale Partnership / Reseller Applications
 *   3. Digital Receipt Resend & Downpayment Refund Requests
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  // --- 1. Templates & Modal Markup ---
  function ensureTrackingModal() {
    if (window.WeBakeModals && typeof window.WeBakeModals.injectTemplates === 'function') {
      window.WeBakeModals.injectTemplates();
    }
  }


  // --- 2. Tab Controller ---
  function setTrackTab(mode) {
    const modeInput = document.getElementById('track-type-mode');
    const tabOrders = document.getElementById('tab-btn-orders');
    const tabPartner = document.getElementById('tab-btn-partner');
    const labelId = document.getElementById('track-label-id');
    const inputId = document.getElementById('track-input-id');
    const labelContact = document.getElementById('track-label-contact');
    const inputContact = document.getElementById('track-input-contact');
    const submitBtn = document.getElementById('track-submit-btn');
    const errBox = document.getElementById('track-error-msg');
    const resBox = document.getElementById('track-result-container');

    if (errBox) errBox.style.display = 'none';
    if (resBox) { resBox.style.display = 'none'; resBox.innerHTML = ''; }

    if (mode === 'partner') {
      if (modeInput) modeInput.value = 'partner';
      if (tabOrders) { tabOrders.classList.remove('active'); tabOrders.style.background = 'transparent'; tabOrders.style.color = '#666'; }
      if (tabPartner) { tabPartner.classList.add('active'); tabPartner.style.background = 'var(--primary)'; tabPartner.style.color = '#fff'; }
      if (labelId) labelId.innerHTML = '<i class="fas fa-id-badge" style="color:var(--primary);font-size:0.95rem;"></i> Partner Reference ID *';
      if (inputId) { inputId.placeholder = 'e.g. WB-PRT-58291'; }
      if (labelContact) labelContact.innerHTML = '<i class="fas fa-address-card" style="color:var(--primary);font-size:0.95rem;"></i> Business Email or Contact Number *';
      if (inputContact) { inputContact.placeholder = 'Email or phone used in application'; }
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-search"></i> Check Application Status';
    } else {
      if (modeInput) modeInput.value = 'order';
      if (tabOrders) { tabOrders.classList.add('active'); tabOrders.style.background = 'var(--primary)'; tabOrders.style.color = '#fff'; }
      if (tabPartner) { tabPartner.classList.remove('active'); tabPartner.style.background = 'transparent'; tabPartner.style.color = '#666'; }
      if (labelId) labelId.innerHTML = '<i class="fas fa-receipt" style="color:var(--primary);font-size:0.95rem;"></i> Order ID *';
      if (inputId) { inputId.placeholder = 'e.g. WB-84920'; }
      if (labelContact) labelContact.innerHTML = '<i class="fas fa-address-card" style="color:var(--primary);font-size:0.95rem;"></i> Email or Contact Number *';
      if (inputContact) { inputContact.placeholder = 'Email or phone used at checkout'; }
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-search"></i> Check Order Status';
    }
  }

  // --- 3. Data Lookup Helpers ---
  function findOrderRecord(enteredId, enteredContact) {
    const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
    let found = allOrders.find(o => o.orderId && o.orderId.toUpperCase() === enteredId);

    if (!found) {
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      for (const u of allUsers) {
        if (u.orderHistory) {
          const match = u.orderHistory.find(o => o.orderId && o.orderId.toUpperCase() === enteredId);
          if (match) {
            found = match;
            if (!found.customer) {
              found.customer = { name: u.name, email: u.email, contact: u.contact, address: u.address };
            }
            break;
          }
        }
      }
    }

    if (found) {
      const cleanEnteredContact = enteredContact.replace(/\D/g, '');
      const cleanCustomerContact = (found?.customer?.contact || '').replace(/\D/g, '');
      const emailMatch = found?.customer?.email && found.customer.email.toLowerCase() === enteredContact;
      const phoneMatch = cleanEnteredContact.length >= 7 && cleanCustomerContact.includes(cleanEnteredContact);
      if (emailMatch || phoneMatch || found.orderId.toUpperCase() === enteredId) {
        return found;
      }
    }
    return null;
  }

  function findPartnerRecord(enteredId, enteredContact) {
    const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
    let foundApp = allApps.find(a => a.appId && a.appId.toUpperCase() === enteredId);

    if (!foundApp) {
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      for (const u of allUsers) {
        if (u.partnerDetails && u.partnerStatus && u.partnerStatus !== 'none') {
          const matchesId = u.partnerAppId && u.partnerAppId.toUpperCase() === enteredId;
          const matchesEmail = u.email && u.email.toLowerCase() === enteredContact;
          const matchesPhone = u.contact && u.contact.replace(/\D/g, '') === enteredContact.replace(/\D/g, '');
          if (matchesId || matchesEmail || matchesPhone) {
            foundApp = {
              appId: u.partnerAppId || ('WB-PRT-' + Math.floor(10000 + Math.random() * 90000)),
              date: 'Recently Submitted',
              status: u.partnerStatus,
              details: u.partnerDetails
            };
            break;
          }
        }
      }
    }

    if (foundApp) {
      const appEmail = (foundApp.details?.email || foundApp.email || '').toLowerCase();
      const appPhone = (foundApp.details?.phone || foundApp.phone || '').replace(/\D/g, '');
      const cleanEnteredContact = enteredContact.replace(/\D/g, '');
      const emailMatch = appEmail && (appEmail === enteredContact);
      const phoneMatch = cleanEnteredContact.length >= 7 && appPhone.includes(cleanEnteredContact);
      if (emailMatch || phoneMatch || (foundApp.appId && foundApp.appId.toUpperCase() === enteredId)) {
        return foundApp;
      }
    }
    return null;
  }

  // --- 4. Render Order Search Result ---
  function renderTrackOrderResult(order, resBox) {
    if (!resBox) return;

    let statusText = 'Pending Downpayment Verification';
    let statusBg = '#fff3cd';
    let statusColor = '#856404';

    if (order.status === 'completed') {
      statusText = 'Completed';
      statusBg = '#d4edda';
      statusColor = '#155724';
    } else if (order.status === 'cancelled') {
      statusText = 'Cancelled & Refunded';
      statusBg = '#f8d7da';
      statusColor = '#721c24';
    } else if (order.status === 'cancellation_requested') {
      statusText = 'Cancellation & Refund Requested';
      statusBg = '#ffe8d6';
      statusColor = '#a73a00';
    } else if (order.status === 'preparing' || order.status === 'in_production') {
      statusText = 'In Production / Baking';
      statusBg = '#cce5ff';
      statusColor = '#004085';
    } else if (order.status === 'delivery') {
      statusText = 'Out for Delivery';
      statusBg = '#e2d9f3';
      statusColor = '#4a154b';
    }

    const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(order.total * 0.5);
    const balance = order.balance !== undefined ? order.balance : (order.total - downpayment);
    const method = order.paymentMethod || 'GCash';
    const refNo = order.referenceNumber ? `(Ref: ${order.referenceNumber})` : '';

    const itemsHtml = `
      <div style="font-size:0.75rem; font-weight:bold; padding: 4px 0; display:flex; justify-content:space-between; color:#666; border-bottom: 1px solid #ddd;">
        <span style="flex:1;">Product Name</span>
        <span style="flex:1; text-align:center;">Bundle(pcs)</span>
        <span style="flex:1; text-align:right;">Price</span>
      </div>
    ` + (order.items || []).map(i => `
      <div style="font-size:0.8rem; padding: 4px 0; display:flex; justify-content:space-between; border-bottom: 1px dashed #eee;">
        <span style="flex:1;">${i.name}</span>
        <span style="flex:1; text-align:center;">${i.qty} Bundle(${i.qty * (i.min || 100)} pcs)</span>
        <span style="flex:1; text-align:right;">₱${(i.price * i.qty).toLocaleString()}</span>
      </div>
    `).join('');

    let refundSectionHtml = '';
    if (order.status === 'pending') {
      refundSectionHtml = `
        <div style="background:#e8f5e9; border:1px solid #c8e6c9; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#2e7d32;">
          <i class="fas fa-check-circle"></i> <strong>Eligible for 100% Downpayment Refund:</strong> Baking has not started yet. You may cancel this order and receive a full ₱${downpayment.toLocaleString()} refund.
        </div>
        <button type="button" class="btn btn-outline btn-sm btn-block" id="btn-toggle-refund-form" style="margin-top:0.5rem; color:#dc3545; border-color:#dc3545;">
          <i class="fas fa-undo"></i> Request Cancellation & Downpayment Refund
        </button>
        <div id="refund-form-card" style="display:none; background:#fff; border:1px solid #ebd9c8; border-radius:6px; padding:0.85rem; margin-top:0.65rem;">
          <h5 style="margin-bottom:0.5rem; color:var(--primary); font-size:0.88rem;"><i class="fas fa-money-bill-wave"></i> Downpayment Refund Request</h5>
          <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-question-circle" style="color:var(--primary);"></i> Reason for Cancellation *</label>
            <select class="form-select" id="refund-select-reason" style="font-size:0.82rem; padding:0.4rem;">
              <option>Change of plans / Event cancelled</option>
              <option>Accidental or duplicate order</option>
              <option>Ordered wrong items or quantity</option>
              <option>Found another supplier</option>
              <option>Other</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-wallet" style="color:var(--primary);"></i> Refund To (E-Wallet) *</label>
            <select class="form-select" id="refund-select-wallet" style="font-size:0.82rem; padding:0.4rem;">
              <option value="GCash" ${method === 'GCash' ? 'selected' : ''}>GCash</option>
              <option value="PayMaya" ${method === 'PayMaya' ? 'selected' : ''}>PayMaya / Maya</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-mobile-alt" style="color:var(--primary);"></i> Account Number to Receive Refund *</label>
            <input type="tel" class="form-input" id="refund-input-number" value="${order.customer?.contact || ''}" placeholder="09XXXXXXXXX" style="font-size:0.82rem; padding:0.4rem;">
          </div>
          <div class="form-group" style="margin-bottom:0.75rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-user" style="color:var(--primary);"></i> Account Name *</label>
            <input type="text" class="form-input" id="refund-input-name" value="${order.customer?.name || ''}" placeholder="Name on GCash / Maya" style="font-size:0.82rem; padding:0.4rem;">
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-block" id="btn-submit-refund-action" style="background:#dc3545; border-color:#dc3545;">
            Confirm & Request ₱${downpayment.toLocaleString()} Refund
          </button>
        </div>
      `;
    } else if (order.status === 'cancellation_requested') {
      refundSectionHtml = `
        <div style="background:#fff3cd; border:1px solid #ffeeba; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#856404;">
          <i class="fas fa-clock"></i> <strong>Cancellation & Refund in Progress:</strong> We received your request to cancel this order and refund <strong>₱${downpayment.toLocaleString()}</strong> to your ${order.refundDetails?.wallet || 'E-Wallet'} (${order.refundDetails?.accountNum || ''}). Our bakery team is reviewing and will credit your refund within 24 hours.
        </div>
      `;
    } else if (order.status === 'cancelled') {
      refundSectionHtml = `
        <div style="background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#721c24;">
          <i class="fas fa-check-circle"></i> <strong>Order Cancelled:</strong> This order has been cancelled and the downpayment refund processed.
        </div>
      `;
    } else {
      refundSectionHtml = `
        <div style="background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#721c24;">
          <i class="fas fa-ban"></i> <strong>Cancellation Closed:</strong> This order is already in production/delivery. Per bakery policy for perishable goods, downpayments cannot be refunded once ingredients and dough preparation have commenced.
        </div>
      `;
    }

    resBox.innerHTML = `
      <div style="border:1px solid var(--border); border-radius:8px; padding:1rem; background:#fff; margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span style="font-size:0.75rem; color:var(--gray); text-transform:uppercase; font-weight:700;">Order ID</span>
            <div style="font-size:1.15rem; font-weight:800; color:var(--primary);">${order.orderId}</div>
            <div style="font-size:0.78rem; color:#888;"><i class="far fa-calendar-alt"></i> ${order.date}</div>
          </div>
          <span style="padding:0.25rem 0.65rem; border-radius:20px; font-size:0.78rem; font-weight:700; background:${statusBg}; color:${statusColor};">
            ${statusText}
          </span>
        </div>

        <div style="font-size:0.82rem; color:#555; margin-bottom:0.75rem; padding-bottom:0.5rem; border-bottom:1px solid #eee;">
          <div><strong>Customer:</strong> ${order.customer?.name || 'Customer'} (${order.customer?.contact || ''})</div>
          <div><strong>Delivery Address:</strong> ${order.customer?.address || 'N/A'}</div>
        </div>

        <div style="margin-bottom:0.75rem;">
          ${itemsHtml}
        </div>

        <div style="background:#faf6f3; border:1px dashed #ebd9c8; border-radius:6px; padding:0.65rem 0.85rem; font-size:0.85rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
            <span style="color:#666;">Total Order Value:</span>
            <strong>₱${order.total.toLocaleString()}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:3px; color:#28a745;">
            <span><i class="fas fa-check-circle"></i> 50% Downpayment (${method} ${refNo}):</span>
            <strong>₱${downpayment.toLocaleString()}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--primary); font-weight:700; border-top:1px dashed #ebd9c8; padding-top:4px; margin-top:4px;">
            <span><i class="fas fa-truck"></i> Remaining Balance Upon Delivery:</span>
            <span>₱${balance.toLocaleString()}</span>
          </div>
        </div>

        ${order.customer?.email ? `
          <div style="margin-top:0.75rem; display:flex; justify-content:space-between; align-items:center; background:#e8f4fd; border:1px solid #bee5eb; border-radius:6px; padding:0.6rem 0.85rem; font-size:0.8rem; color:#0c5460; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <i class="fas fa-envelope" style="color:#17a2b8;"></i> Receipt: <strong>${order.customer.email}</strong>
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="btn-track-resend-receipt" style="padding:0.25rem 0.65rem; font-size:0.75rem; border-color:#bee5eb; background:#fff; color:#0c5460;">
              <i class="fas fa-redo"></i> Resend Receipt
            </button>
          </div>
        ` : ''}

        ${refundSectionHtml}
      </div>
    `;

    resBox.style.display = 'block';

    // Resend receipt handler
    document.getElementById('btn-track-resend-receipt')?.addEventListener('click', function() {
      const btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      const apiBase = window.WEBAKE_API_BASE || (
        window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
          ? 'http://localhost:5000/api'
          : 'https://webake-crbsystem-backend.onrender.com/api'
      );
      fetch(`${apiBase}/orders/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, hasAccount: false })
      })
      .then(r => r.json())
      .then(res => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Sent!';
        showToast(res.success ? `Receipt sent to ${order.customer.email} 📧` : res.message);
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-redo"></i> Resend Receipt'; }, 3000);
      })
      .catch(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-redo"></i> Resend Receipt';
        showToast('Failed to connect to email server.');
      });
    });

    // Toggle refund form
    document.getElementById('btn-toggle-refund-form')?.addEventListener('click', () => {
      const card = document.getElementById('refund-form-card');
      if (card) card.style.display = card.style.display === 'none' ? 'block' : 'none';
    });

    // Submit refund request
    document.getElementById('btn-submit-refund-action')?.addEventListener('click', () => {
      const reason = document.getElementById('refund-select-reason')?.value;
      const wallet = document.getElementById('refund-select-wallet')?.value;
      const accountNum = document.getElementById('refund-input-number')?.value.trim();
      const accountName = document.getElementById('refund-input-name')?.value.trim();

      if (!accountNum) {
        showToast('Please enter your ' + wallet + ' account number for refund.');
        return;
      }

      const onConfirmAction = () => {
        const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
        const targetO = allOrders.find(o => o.orderId === order.orderId);
        const refundData = {
          reason: reason,
          wallet: wallet,
          accountNum: accountNum,
          accountName: accountName,
          amount: downpayment,
          requestedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        };

        if (targetO) {
          targetO.status = 'cancellation_requested';
          targetO.refundDetails = refundData;
          localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders));
        }

        const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
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
          localStorage.setItem('weBakeUsers', JSON.stringify(allUsers));
        }

        closeRefundForm();
        renderOrderResult(targetO || order);
        showToast('Cancellation & downpayment refund request submitted successfully.');
      };

      if (window.WeBakeModals && typeof window.WeBakeModals.confirmRefund === 'function') {
        window.WeBakeModals.confirmRefund({
          orderDate: `order ${order.orderId}`,
          downpayment: downpayment,
          wallet: wallet,
          accNum: accountNum,
          onConfirm: () => {
            onConfirmAction();
            order.status = 'cancellation_requested';
            order.refundDetails = {
              reason: reason,
              wallet: wallet,
              accountNum: accountNum,
              accountName: accountName,
              amount: downpayment,
              requestedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            };
            renderTrackOrderResult(order, resBox);
          }
        });
      }
    });
  }


  // --- 5. Render Partner Application Search Result ---
  function renderTrackPartnerResult(app, resBox) {
    if (!resBox) return;

    let statusText = 'Under Review (Pending)';
    let statusBg = '#fff3cd';
    let statusColor = '#856404';
    let statusIcon = 'fa-clock';

    if (app.status === 'approved' || app.status === 'active') {
      statusText = 'Approved — Wholesale Partner Active';
      statusBg = '#d4edda';
      statusColor = '#155724';
      statusIcon = 'fa-check-circle';
    } else if (app.status === 'rejected' || app.status === 'declined') {
      statusText = 'Application Declined';
      statusBg = '#f8d7da';
      statusColor = '#721c24';
      statusIcon = 'fa-times-circle';
    } else if (app.status === 'cancelled') {
      statusText = 'Application Cancelled';
      statusBg = '#f8d7da';
      statusColor = '#721c24';
      statusIcon = 'fa-ban';
    }

    const details = app.details || {};
    const productsList = (details.products && details.products.length) ? details.products.join(', ') : 'All Products';
    const isApproved = (app.status === 'approved' || app.status === 'active');
    const canModify = (app.status !== 'cancelled' && app.status !== 'rejected' && app.status !== 'declined');

    let nextStepsText = 'Our bakery management team is reviewing your business profile and location. We will contact you directly within 24–48 hours to finalize supply terms.';
    if (isApproved) {
      nextStepsText = 'Congratulations! Your wholesale partnership is active. You may now place orders with your partner privileges and bulk terms.';
    } else if (app.status === 'cancelled') {
      nextStepsText = 'This partnership application has been cancelled. If you wish to apply again, you may submit a new application through the Partner page.';
    } else if (app.status === 'rejected' || app.status === 'declined') {
      nextStepsText = 'Thank you for your interest. Unfortunately, this application could not be approved at this time.';
    }

    const actionsHtml = canModify ? `
      <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1rem; flex-wrap:wrap; border-top:1px solid #f0e7dc; padding-top:0.85rem;">
        <button type="button" id="track-edit-partner-btn" class="btn btn-outline" style="padding:0.45rem 1rem; font-size:0.85rem; display:inline-flex; align-items:center; gap:0.4rem;">
          <i class="fas fa-edit"></i> ${isApproved ? 'Update Details' : 'Edit Application'}
        </button>
        <button type="button" id="track-cancel-partner-btn" class="btn btn-primary" style="padding:0.45rem 1rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545; display:inline-flex; align-items:center; gap:0.4rem;">
          <i class="fas fa-ban"></i> ${isApproved ? 'Cancel Partnership' : 'Cancel Request'}
        </button>
      </div>
    ` : '';

    resBox.innerHTML = `
      <div style="border:1px solid var(--border); border-radius:8px; padding:1.25rem; background:#fff; margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span style="font-size:0.75rem; color:var(--gray); text-transform:uppercase; font-weight:700;">Partnership Application ID</span>
            <div style="font-size:1.15rem; font-weight:800; color:var(--primary);">${app.appId}</div>
            <div style="font-size:0.78rem; color:#888;"><i class="far fa-calendar-alt"></i> Submitted: ${app.date || 'Recent'}</div>
          </div>
          <span style="padding:0.25rem 0.65rem; border-radius:20px; font-size:0.78rem; font-weight:700; background:${statusBg}; color:${statusColor}; display:inline-flex; align-items:center; gap:0.35rem;">
            <i class="fas ${statusIcon}"></i> ${statusText}
          </span>
        </div>

        <div style="background:#faf6f0; border:1px solid #ebd9c8; border-radius:6px; padding:0.85rem; font-size:0.83rem; margin-bottom:0.85rem; line-height:1.6;">
          <div><strong>Bakery / Business Name:</strong> ${details['bakery-name'] || 'N/A'}</div>
          <div><strong>Representative:</strong> ${details['owner-name'] || 'N/A'}</div>
          <div><strong>Business Type:</strong> ${details.type || 'Bakery'} (${details.years ? (String(details.years).toLowerCase().includes('year') ? `${details.years} in operation` : `${details.years} years in operation`) : '1+ years in operation'})</div>
          <div><strong>Business Address:</strong> ${details.address || 'N/A'}</div>
          <div><strong>Contact Info:</strong> ${details.phone || app.phone || 'N/A'} · ${details.email || app.email || 'N/A'}</div>
          <div><strong>Products of Interest:</strong> ${productsList}</div>
          ${details.permit ? `<div><strong>Business Permit:</strong> ${details.permit}</div>` : ''}
          ${details.tin ? `<div><strong>TIN:</strong> ${details.tin}</div>` : ''}
          ${details.notes ? `<div><strong>Notes:</strong> ${details.notes}</div>` : ''}
        </div>

        <div style="font-size:0.82rem; color:#555; background:#f9f9f9; border-left:3px solid var(--primary); padding:0.65rem 0.85rem; border-radius:0 4px 4px 0; line-height:1.5;">
          <strong><i class="fas fa-info-circle" style="color:var(--primary);"></i> Next Steps:</strong><br>
          ${nextStepsText}
        </div>

        ${actionsHtml}
      </div>
    `;

    resBox.style.display = 'block';

    // Edit application button
    resBox.querySelector('#track-edit-partner-btn')?.addEventListener('click', () => {
      sessionStorage.setItem('weBakeEditPartnerId', app.appId);
      const trackModal = document.getElementById('track-order-modal');
      if (trackModal) trackModal.classList.remove('active');
      if (window.location.pathname.includes('partner.html')) {
        if (typeof window.syncPartnerFormState === 'function') {
          window.syncPartnerFormState();
        }
        const formSec = document.querySelector('.partner-form-section');
        if (formSec) {
          window.scrollTo({ top: formSec.offsetTop - 50, behavior: 'smooth' });
        }
      } else {
        window.location.href = 'partner.html';
      }
    });

    // Cancel application button
    resBox.querySelector('#track-cancel-partner-btn')?.addEventListener('click', () => {
      const doCancelPartner = () => {
        const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
        const targetIndex = allApps.findIndex(a => a.appId && a.appId.toUpperCase() === app.appId.toUpperCase());
        if (targetIndex !== -1) {
          allApps[targetIndex].status = 'cancelled';
          allApps[targetIndex].cancelledAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          localStorage.setItem('weBakePartnerApplications', JSON.stringify(allApps));
        }

        const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
        let usersChanged = false;
        allUsers.forEach(u => {
          if ((u.partnerAppId && u.partnerAppId.toUpperCase() === app.appId.toUpperCase()) ||
              (u.email && app.details?.email && u.email.trim().toLowerCase() === (app.details.email || '').trim().toLowerCase())) {
            u.partnerStatus = 'none';
            u.partnerDetails = null;
            usersChanged = true;
          }
        });
        if (usersChanged) {
          localStorage.setItem('weBakeUsers', JSON.stringify(allUsers));
        }

        app.status = 'cancelled';
        showToast('Partnership request cancelled.');
        renderTrackPartnerResult(app, resBox);

        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('weBakePartnerChange'));
      };

      if (window.WeBakeModals && typeof window.WeBakeModals.confirmCancelPartner === 'function') {
        window.WeBakeModals.confirmCancelPartner({ onConfirm: doCancelPartner });
      }
    });
  }

  // --- 6. Form Submission & Smart Routing ---
  function handleTrackSubmit(e) {
    e.preventDefault();
    const idInput = document.getElementById('track-input-id');
    const contactInput = document.getElementById('track-input-contact');
    const errBox = document.getElementById('track-error-msg');
    const resBox = document.getElementById('track-result-container');
    const currentMode = document.getElementById('track-type-mode')?.value || 'order';

    const enteredId = idInput?.value.trim().toUpperCase();
    const enteredContact = contactInput?.value.trim().toLowerCase();

    if (!enteredId || !enteredContact) return;

    // Smart Lookup: Auto-detect if user entered a Partner ID or Order ID
    const isPartnerQuery = (currentMode === 'partner') || enteredId.startsWith('WB-PRT') || enteredId.includes('PRT');

    if (isPartnerQuery) {
      const app = findPartnerRecord(enteredId, enteredContact);
      if (app) {
        if (errBox) errBox.style.display = 'none';
        setTrackTab('partner');
        renderTrackPartnerResult(app, resBox);
        return;
      }
      // Fallback: check if it's an order
      const order = findOrderRecord(enteredId, enteredContact);
      if (order) {
        if (errBox) errBox.style.display = 'none';
        setTrackTab('order');
        renderTrackOrderResult(order, resBox);
        return;
      }

      if (errBox) {
        errBox.textContent = 'No matching partnership application found. Please verify your Reference ID (e.g. WB-PRT-XXXXX) and registered email or phone.';
        errBox.style.display = 'block';
      }
      if (resBox) resBox.style.display = 'none';
      return;
    }

    // Default: Bread Orders lookup
    const order = findOrderRecord(enteredId, enteredContact);
    if (order) {
      if (errBox) errBox.style.display = 'none';
      setTrackTab('order');
      renderTrackOrderResult(order, resBox);
      return;
    }

    // Fallback: check if user entered a partner application on the order tab
    const app = findPartnerRecord(enteredId, enteredContact);
    if (app) {
      if (errBox) errBox.style.display = 'none';
      setTrackTab('partner');
      renderTrackPartnerResult(app, resBox);
      return;
    }

    if (errBox) {
      errBox.textContent = 'No matching order found. Please verify your Order ID and the email or phone number used at checkout.';
      errBox.style.display = 'block';
    }
    if (resBox) resBox.style.display = 'none';
  }

  // --- 7. Public Open Function ---
  function openTrackOrderModal(id = '', contact = '', mode = 'order') {
    ensureTrackingModal();
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('track-order-modal');
    } else {
      const modal = document.getElementById('track-order-modal');
      const overlay = document.getElementById('auth-overlay');
      if (modal) modal.classList.add('active');
      if (overlay) overlay.classList.add('active');
    }

    setTrackTab(mode);
    const idInput = document.getElementById('track-input-id');
    const contactInput = document.getElementById('track-input-contact');
    const errBox = document.getElementById('track-error-msg');
    const resBox = document.getElementById('track-result-container');
    if (errBox) errBox.style.display = 'none';
    if (resBox) { resBox.style.display = 'none'; resBox.innerHTML = ''; }
    if (idInput && id) idInput.value = id;
    if (contactInput && contact) contactInput.value = contact;
    if (id && contact) {
      setTimeout(() => {
        document.getElementById('track-order-form')?.dispatchEvent(new Event('submit'));
      }, 150);
    }
  }

  // --- 8. Event Wiring on DOMContentLoaded ---
  document.addEventListener('DOMContentLoaded', () => {
    ensureTrackingModal();

    const form = document.getElementById('track-order-form');
    if (form) form.addEventListener('submit', handleTrackSubmit);

    document.body.addEventListener('click', e => {
      // Tab switching
      if (e.target.closest('#tab-btn-orders')) {
        e.preventDefault();
        setTrackTab('order');
      }
      if (e.target.closest('#tab-btn-partner')) {
        e.preventDefault();
        setTrackTab('partner');
      }
      // Open track modal triggers
      if (e.target.closest('[data-track-order-open]')) {
        e.preventDefault();
        openTrackOrderModal();
      }
    });
  });

  // Expose to window for global access
  window.openTrackOrderModal = openTrackOrderModal;
  window.WeBakeTracking = {
    openModal: openTrackOrderModal,
    setTab: setTrackTab,
    findOrder: findOrderRecord,
    findPartner: findPartnerRecord
  };

})(window, document);
