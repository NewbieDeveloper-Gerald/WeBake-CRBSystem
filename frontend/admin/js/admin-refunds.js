/**
 * ====================================================================
 * WeBake Admin Portal — Cancellations & Refund Management (admin-refunds.js)
 * Dedicated queue for reviewing and processing customer downpayment refund requests.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let currentTab = 'pending';
  let activeRefundOrder = null;

  const tableBody = document.getElementById('refunds-table-body');
  const processModal = document.getElementById('modal-process-refund');
  const declineModal = document.getElementById('modal-decline-refund');

  function renderRefunds() {
    if (!tableBody) return;

    const orders = window.WeBakeAdmin.getOrders();
    const refundOrders = orders.filter(o => {
      const hasRefund = (o.status === 'cancellation_requested' || o.refundDetails || o.status === 'refunded');
      if (!hasRefund) return false;

      if (currentTab === 'pending') return o.status === 'cancellation_requested';
      if (currentTab === 'approved') return o.status === 'refunded';
      if (currentTab === 'declined') return o.status !== 'cancellation_requested' && o.status !== 'refunded' && o.refundDeclinedReason;
      return true;
    });

    // Update Counts
    const pendingCount = orders.filter(o => o.status === 'cancellation_requested').length;
    const approvedCount = orders.filter(o => o.status === 'refunded').length;
    const declinedCount = orders.filter(o => o.refundDeclinedReason).length;

    const countPendingEl = document.getElementById('count-refund-pending');
    const countApprovedEl = document.getElementById('count-refund-approved');
    const countDeclinedEl = document.getElementById('count-refund-declined');

    if (countPendingEl) countPendingEl.textContent = pendingCount;
    if (countApprovedEl) countApprovedEl.textContent = approvedCount;
    if (countDeclinedEl) countDeclinedEl.textContent = declinedCount;

    if (refundOrders.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-icon-wrap"><i class="fas fa-check-circle"></i></div>
              <h4 class="empty-title">No ${currentTab} Refund Requests</h4>
              <p class="empty-desc">When customers request downpayment refunds via their dashboard or tracking page, requests will appear here for audit and payout approval.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = refundOrders.map(o => {
      const details = o.refundDetails || {};
      const refundAmt = details.amount || o.downpayment || 0;
      const wallet = details.wallet || o.paymentMethod || 'GCash';
      const accNum = details.accountNum || o.customer?.contact || 'N/A';
      const accName = details.accountName || o.customer?.name || 'Customer';
      const reason = details.reason || o.cancellationReason || 'Customer requested cancellation';

      return `
        <tr>
          <td>
            <strong>${o.orderId}</strong>
            <div class="text-muted font-sm">${o.date || 'Recent'}</div>
          </td>
          <td>
            <strong>${o.customer?.name || 'Customer'}</strong>
            <div class="text-muted font-sm">${o.customer?.contact || o.customer?.email || ''}</div>
          </td>
          <td>
            <strong class="text-danger">${window.WeBakeAdmin.formatPHP(refundAmt)}</strong>
            <div class="text-muted font-sm">Downpayment</div>
          </td>
          <td>
            <div class="order-items-snippet" title="${reason}">${reason}</div>
          </td>
          <td>
            <div><strong>${wallet}</strong>: ${accNum}</div>
            <div class="text-muted font-sm">Name: ${accName}</div>
          </td>
          <td>${window.WeBakeAdmin.getStatusBadge(o.status)}</td>
          <td>
            <div class="order-actions-cell">
              ${o.status === 'cancellation_requested' ? `
                <button type="button" class="btn btn-primary btn-sm btn-approve-refund" data-id="${o.orderId}">
                  <i class="fas fa-check"></i> Payout Refund
                </button>
                <button type="button" class="btn btn-outline btn-sm btn-decline-refund" data-id="${o.orderId}">
                  <i class="fas fa-times"></i> Decline
                </button>
              ` : `
                <span class="text-muted font-sm">${o.refundPayoutRef ? `Ref: ${o.refundPayoutRef}` : 'Processed'}</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('.btn-approve-refund').forEach(btn => {
      btn.addEventListener('click', () => openProcessModal(btn.dataset.id));
    });

    tableBody.querySelectorAll('.btn-decline-refund').forEach(btn => {
      btn.addEventListener('click', () => openDeclineModal(btn.dataset.id));
    });
  }

  function openProcessModal(orderId) {
    const orders = window.WeBakeAdmin.getOrders();
    activeRefundOrder = orders.find(o => o.orderId === orderId);
    if (!activeRefundOrder || !processModal) return;

    const details = activeRefundOrder.refundDetails || {};
    document.getElementById('refund-modal-order-id').textContent = activeRefundOrder.orderId;
    document.getElementById('refund-modal-amount').textContent = window.WeBakeAdmin.formatPHP(details.amount || activeRefundOrder.downpayment || 0);
    document.getElementById('refund-modal-wallet').textContent = details.wallet || activeRefundOrder.paymentMethod || 'GCash';
    document.getElementById('refund-modal-acc-num').textContent = details.accountNum || activeRefundOrder.customer?.contact || 'N/A';
    document.getElementById('refund-modal-acc-name').textContent = details.accountName || activeRefundOrder.customer?.name || 'Customer';

    processModal.classList.add('active');
  }

  function confirmPayoutRefund() {
    if (!activeRefundOrder) return;
    const refNum = document.getElementById('refund-payout-ref')?.value.trim();
    if (!refNum) {
      window.WeBakeAdmin.showToast('Please enter the bakery refund transfer reference number.', 'danger');
      document.getElementById('refund-payout-ref')?.focus();
      return;
    }

    const orders = window.WeBakeAdmin.getOrders();
    const target = orders.find(o => o.orderId === activeRefundOrder.orderId);
    if (target) {
      target.status = 'refunded';
      target.refundPayoutRef = refNum;
      target.refundApprovedAt = new Date().toLocaleString();
      window.WeBakeAdmin.saveOrders(orders);
      syncUserRefundStatus(target);
      window.WeBakeAdmin.showToast(`Refund processed for ${target.orderId}! Order marked as Refunded.`, 'success');
    }

    if (processModal) processModal.classList.remove('active');
    renderRefunds();
  }

  function openDeclineModal(orderId) {
    const orders = window.WeBakeAdmin.getOrders();
    activeRefundOrder = orders.find(o => o.orderId === orderId);
    if (!activeRefundOrder || !declineModal) return;

    document.getElementById('decline-modal-order-id').textContent = activeRefundOrder.orderId;
    declineModal.classList.add('active');
  }

  function confirmDeclineRefund() {
    if (!activeRefundOrder) return;
    const reason = document.getElementById('decline-reason-text')?.value.trim() || 'Order already prepared or in oven.';

    const orders = window.WeBakeAdmin.getOrders();
    const target = orders.find(o => o.orderId === activeRefundOrder.orderId);
    if (target) {
      target.status = 'in_production'; // restores to in production
      target.refundDeclinedReason = reason;
      target.refundDeclinedAt = new Date().toLocaleString();
      window.WeBakeAdmin.saveOrders(orders);
      syncUserRefundStatus(target);
      window.WeBakeAdmin.showToast(`Refund request declined for ${target.orderId}. Restored to In-Production.`, 'info');
    }

    if (declineModal) declineModal.classList.remove('active');
    renderRefunds();
  }

  function syncUserRefundStatus(updatedOrder) {
    try {
      const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      let modified = false;

      users.forEach(u => {
        if (u.orderHistory) {
          const match = u.orderHistory.find(o => o.orderId === updatedOrder.orderId);
          if (match) {
            match.status = updatedOrder.status;
            match.refundPayoutRef = updatedOrder.refundPayoutRef;
            match.refundDeclinedReason = updatedOrder.refundDeclinedReason;
            modified = true;
          }
        }
      });

      if (modified) localStorage.setItem('weBakeUsers', JSON.stringify(users));
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderRefunds();

    document.querySelectorAll('.order-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderRefunds();
      });
    });

    document.getElementById('btn-confirm-payout')?.addEventListener('click', confirmPayoutRefund);
    document.getElementById('btn-close-process')?.addEventListener('click', () => {
      if (processModal) processModal.classList.remove('active');
    });

    document.getElementById('btn-confirm-decline')?.addEventListener('click', confirmDeclineRefund);
    document.getElementById('btn-close-decline')?.addEventListener('click', () => {
      if (declineModal) declineModal.classList.remove('active');
    });

    window.addEventListener('weBakeAdminUpdate', () => {
      renderRefunds();
    });
  });

})(window, document);
