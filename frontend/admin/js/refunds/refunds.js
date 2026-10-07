/**
 * ====================================================================
 * WeBake Admin Portal — Cancellations & Refund Management (admin-refunds.js)
 * Fully connected to unified backend API (/api/orders/cancellations/all,
 * /process, and /decline) backed by Supabase PostgreSQL cancellation_requests,
 * refund_transactions, and orders tables.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let currentTab = 'pending';
  let activeRefundOrder = null;
  let cachedRefunds = [];

  const tableBody = document.getElementById('refunds-table-body');
  const processModal = document.getElementById('modal-process-refund');
  const declineModal = document.getElementById('modal-decline-refund');

  async function renderRefunds() {
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top:0.5rem;">Loading refund requests from database...</p>
        </td>
      </tr>
    `;

    try {
      let refunds = [];
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/orders/cancellations/all');
        if (res && res.success && Array.isArray(res.refunds)) {
          refunds = res.refunds;
          cachedRefunds = refunds;
        }
      }

      if (!refunds.length) {
        const localOrders = window.WeBakeAdmin?.getOrders() || [];
        refunds = localOrders
          .filter(o => o.status === 'cancellation_requested' || o.status === 'refunded' || o.refundDetails)
          .map(o => ({
            id: o.orderId,
            orderId: o.orderId,
            customer: o.customer,
            amount: o.refundDetails?.amount || o.downpayment || 0,
            reason: o.refundDetails?.reason || o.cancellationReason || 'Cancellation requested',
            refundChannel: o.refundDetails?.wallet || o.paymentMethod || 'GCash',
            refundAccountNumber: o.refundDetails?.accountNum || o.customer?.contact || 'N/A',
            refundAccountName: o.refundDetails?.accountName || o.customer?.name || 'Customer',
            status: o.status === 'cancellation_requested' ? 'pending_review' : (o.status === 'refunded' ? 'processed' : o.status),
            payoutRef: o.refundPayoutRef || null,
            date: o.date || 'Recent'
          }));
        cachedRefunds = refunds;
      }

      const filtered = refunds.filter(r => {
        if (currentTab === 'pending') return r.status === 'pending_review' || r.status === 'pending';
        if (currentTab === 'approved') return r.status === 'processed' || r.status === 'refunded';
        if (currentTab === 'declined') return r.status === 'rejected' || r.rejectionReason;
        return true;
      });

      // Update Counts
      const pendingCount = refunds.filter(r => r.status === 'pending_review' || r.status === 'pending').length;
      const approvedCount = refunds.filter(r => r.status === 'processed' || r.status === 'refunded').length;
      const declinedCount = refunds.filter(r => r.status === 'rejected' || r.rejectionReason).length;

      const countPendingEl = document.getElementById('count-refund-pending');
      const countApprovedEl = document.getElementById('count-refund-approved');
      const countDeclinedEl = document.getElementById('count-refund-declined');

      if (countPendingEl) countPendingEl.textContent = pendingCount;
      if (countApprovedEl) countApprovedEl.textContent = approvedCount;
      if (countDeclinedEl) countDeclinedEl.textContent = declinedCount;

      if (filtered.length === 0) {
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

      tableBody.innerHTML = filtered.map(r => {
        const isPending = r.status === 'pending_review' || r.status === 'pending';
        const isProcessed = r.status === 'processed' || r.status === 'refunded';

        let badge = '<span class="badge badge-cancelled"><i class="fas fa-clock"></i> Pending Review</span>';
        if (isProcessed) badge = '<span class="badge badge-refunded"><i class="fas fa-check-double"></i> Refunded</span>';
        if (r.status === 'rejected') badge = '<span class="badge badge-cancelled"><i class="fas fa-ban"></i> Declined</span>';

        return `
          <tr data-id="${r.id}">
            <td>
              <strong>${r.orderId}</strong>
              <div class="text-muted font-sm">${r.date || 'Recent'}</div>
            </td>
            <td>
              <strong>${window.escapeHtml ? window.escapeHtml(r.customer?.name || 'Customer') : (r.customer?.name || 'Customer')}</strong>
              <div class="text-muted font-sm">${window.escapeHtml ? window.escapeHtml(r.customer?.contact || r.customer?.email || '') : (r.customer?.contact || r.customer?.email || '')}</div>
            </td>
            <td>
              <strong class="text-danger">${window.WeBakeAdmin.formatPHP(r.amount)}</strong>
              <div class="text-muted font-sm">50% Downpayment</div>
            </td>
            <td>
              <div class="order-items-snippet" title="${window.escapeHtml ? window.escapeHtml(r.reason) : r.reason}">
                ${window.escapeHtml ? window.escapeHtml(r.reason) : r.reason}
              </div>
            </td>
            <td>
              <div><strong>${r.refundChannel}</strong>: ${r.refundAccountNumber}</div>
              <div class="text-muted font-sm">Name: ${window.escapeHtml ? window.escapeHtml(r.refundAccountName) : r.refundAccountName}</div>
            </td>
            <td>${badge}</td>
            <td>
              <div class="order-actions-cell">
                ${isPending ? `
                  <button type="button" class="btn btn-primary btn-sm btn-approve-refund" data-id="${r.id}">
                    <i class="fas fa-check"></i> Payout Refund
                  </button>
                  <button type="button" class="btn btn-outline btn-sm btn-decline-refund" data-id="${r.id}">
                    <i class="fas fa-times"></i> Decline
                  </button>
                ` : `
                  <span class="text-muted font-sm">${r.payoutRef ? `Ref: ${r.payoutRef}` : (r.rejectionReason ? 'Declined' : 'Processed')}</span>
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

    } catch (err) {
      console.error('[Admin Refunds Render Error]:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state" style="color:var(--danger);">
              <i class="fas fa-exclamation-triangle fa-2x"></i>
              <h4 class="empty-title">Error Loading Refunds</h4>
              <p class="empty-desc">${err.message || 'Cannot reach database server.'}</p>
              <button class="btn btn-outline btn-sm mt-1" onclick="location.reload()">Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
  }

  function openProcessModal(id) {
    activeRefundOrder = cachedRefunds.find(r => String(r.id) === String(id) || r.orderId === id);
    if (!activeRefundOrder || !processModal) return;

    document.getElementById('refund-modal-order-id').textContent = activeRefundOrder.orderId;
    document.getElementById('refund-modal-amount').textContent = window.WeBakeAdmin.formatPHP(activeRefundOrder.amount);
    document.getElementById('refund-modal-wallet').textContent = activeRefundOrder.refundChannel;
    document.getElementById('refund-modal-acc-num').textContent = activeRefundOrder.refundAccountNumber;
    document.getElementById('refund-modal-acc-name').textContent = activeRefundOrder.refundAccountName;

    const refInput = document.getElementById('refund-payout-ref');
    if (refInput) refInput.value = '';

    processModal.classList.add('active');
  }

  async function confirmPayoutRefund() {
    if (!activeRefundOrder) return;
    const refNum = document.getElementById('refund-payout-ref')?.value.trim();
    if (!refNum) {
      window.WeBakeAdmin.showToast('Please enter the bakery refund transfer reference number.', 'danger');
      document.getElementById('refund-payout-ref')?.focus();
      return;
    }

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.post(`/orders/cancellations/${activeRefundOrder.id}/process`, {
          transactionReference: refNum
        });
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Refund processed for ${activeRefundOrder.orderId}! Order marked as Refunded.`, 'success');
      }
      if (processModal) processModal.classList.remove('active');
      renderRefunds();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to process payout: ' + err.message, 'danger');
    }
  }

  function openDeclineModal(id) {
    activeRefundOrder = cachedRefunds.find(r => String(r.id) === String(id) || r.orderId === id);
    if (!activeRefundOrder || !declineModal) return;

    document.getElementById('decline-modal-order-id').textContent = activeRefundOrder.orderId;
    const reasonInput = document.getElementById('refund-decline-reason');
    if (reasonInput) reasonInput.value = '';

    declineModal.classList.add('active');
  }

  async function confirmDeclineRefund() {
    if (!activeRefundOrder) return;
    const reason = document.getElementById('refund-decline-reason')?.value.trim() || 'Bakery production has already started.';

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.post(`/orders/cancellations/${activeRefundOrder.id}/decline`, {
          rejectionReason: reason
        });
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Refund declined for ${activeRefundOrder.orderId}.`, 'info');
      }
      if (declineModal) declineModal.classList.remove('active');
      renderRefunds();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to decline refund: ' + err.message, 'danger');
    }
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

    [processModal, declineModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    window.addEventListener('weBakeAdminUpdate', () => {
      renderRefunds();
    });
  });

})(window, document);
