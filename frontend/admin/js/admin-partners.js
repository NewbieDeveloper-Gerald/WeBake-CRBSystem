/**
 * ====================================================================
 * WeBake Admin Portal — Wholesale Reseller Partnerships (admin-partners.js)
 * Fully connected to unified backend API (/api/partner/all and /api/partner/:code/status)
 * backed by Supabase PostgreSQL partner_applications and users tables.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let currentTab = 'all';
  let activeAppId = null;
  let cachedPartners = [];

  const tableBody = document.getElementById('partners-table-body');
  const reviewModal = document.getElementById('modal-review-partner');

  async function renderPartners() {
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top:0.5rem;">Loading reseller applications from database...</p>
        </td>
      </tr>
    `;

    try {
      let partners = [];
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/partner/all');
        if (res && res.success && Array.isArray(res.partners)) {
          partners = res.partners;
          cachedPartners = partners;
          try { localStorage.setItem('weBakePartnerApplications', JSON.stringify(partners)); } catch (e) {}
        }
      }

      if (!partners.length) {
        partners = window.WeBakeAdmin?.getPartners() || [];
        cachedPartners = partners;
      }

      const filtered = partners.filter(p => {
        const status = (p.status || 'pending').toLowerCase();
        if (currentTab === 'pending') return status === 'pending';
        if (currentTab === 'reviewing') return status === 'under_review' || status === 'reviewing' || status === 'contacted';
        if (currentTab === 'approved') return status === 'approved' || status === 'active';
        if (currentTab === 'rejected') return status === 'rejected' || status === 'declined';
        if (currentTab === 'cancelled') return status === 'cancelled';
        return true;
      });

      // Update Counts
      const pendingCount = partners.filter(p => !p.status || p.status === 'pending').length;
      const countEl = document.getElementById('count-partner-pending');
      if (countEl) countEl.textContent = pendingCount;

      const cancelledCount = partners.filter(p => (p.status || '').toLowerCase() === 'cancelled').length;
      const countCancelledEl = document.getElementById('count-partner-cancelled');
      if (countCancelledEl) {
        countCancelledEl.textContent = cancelledCount;
        countCancelledEl.style.display = cancelledCount > 0 ? 'inline-block' : 'none';
      }

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8">
              <div class="empty-state">
                <div class="empty-icon-wrap"><i class="fas fa-handshake"></i></div>
                <h4 class="empty-title">No ${currentTab === 'all' ? '' : currentTab} Reseller Applications</h4>
                <p class="empty-desc">When prospective partner stores submit wholesale reseller applications, they will appear here for vetting.</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = filtered.map(p => {
        const d = p.details || {};
        const appId = p.appId || ('WB-PRT-' + (p.id || '1001'));
        const bName = p.businessName || d['business-name'] || 'Store';
        const bType = p.businessType || d['business-type'] || 'sari_sari';
        const contactPerson = p.fullName || d['owner-name'] || 'Owner';
        const phone = p.phone || d.phone || 'N/A';
        const volume = p.weeklyVolume || d.volume || '50-100 bundles';
        const status = (p.status || 'pending').toLowerCase();

        let statusBadge = '<span class="badge badge-pending">Pending Review</span>';
        if (status === 'under_review' || status === 'reviewing' || status === 'contacted') {
          statusBadge = '<span class="badge badge-confirmed">Under Review</span>';
        } else if (status === 'approved' || status === 'active') {
          statusBadge = '<span class="badge badge-completed">Approved Partner</span>';
        } else if (status === 'rejected' || status === 'declined') {
          statusBadge = '<span class="badge badge-cancelled">Declined</span>';
        } else if (status === 'cancelled') {
          statusBadge = '<span class="badge badge-cancelled" style="background:#fee2e2; color:#991b1b; border:1px solid #f87171;"><i class="fas fa-ban"></i> Cancelled</span>';
        }

        return `
          <tr data-id="${appId}">
            <td><strong>${appId}</strong></td>
            <td>
              <strong>${window.escapeHtml ? window.escapeHtml(bName) : bName}</strong>
              <div class="text-muted font-sm">${formatBusinessType(bType)}</div>
            </td>
            <td>${window.escapeHtml ? window.escapeHtml(contactPerson) : contactPerson}</td>
            <td>${window.escapeHtml ? window.escapeHtml(phone) : phone}</td>
            <td>${window.escapeHtml ? window.escapeHtml(volume) : volume}</td>
            <td><strong>${p.discountRate ? p.discountRate + '%' : (status === 'approved' ? '15%' : 'Standard')}</strong></td>
            <td>${statusBadge}</td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-review-app" data-id="${appId}">
                <i class="fas fa-search"></i> Review
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tableBody.querySelectorAll('.btn-review-app').forEach(btn => {
        btn.addEventListener('click', () => openReviewModal(btn.dataset.id));
      });

    } catch (err) {
      console.error('[Admin Partners Render Error]:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state" style="color:var(--danger);">
              <i class="fas fa-exclamation-triangle fa-2x"></i>
              <h4 class="empty-title">Error Loading Applications</h4>
              <p class="empty-desc">${err.message || 'Cannot reach database server.'}</p>
              <button class="btn btn-outline btn-sm mt-1" onclick="location.reload()">Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
  }

  function formatBusinessType(type) {
    const map = {
      'sari_sari': 'Sari-Sari Store',
      'bakery': 'Bakery / Pastry Shop',
      'canteen': 'School / Office Canteen',
      'cafe': 'Cafe / Coffee Shop',
      'direct_selling': 'Direct Reseller',
      'online_shop': 'Online Bakery Shop',
      'distributor': 'Sub-Distributor'
    };
    return map[type] || type;
  }

  function openReviewModal(appId) {
    const app = cachedPartners.find(p => (p.appId === appId || ('WB-PRT-' + (p.id || '1001')) === appId));
    if (!app || !reviewModal) return;

    activeAppId = appId;
    const d = app.details || {};

    document.getElementById('review-app-id').textContent = appId;
    document.getElementById('review-b-name').textContent = app.businessName || d['business-name'] || 'Store';
    document.getElementById('review-b-type').textContent = formatBusinessType(app.businessType || d['business-type'] || 'sari_sari');
    document.getElementById('review-b-owner').textContent = app.fullName || d['owner-name'] || 'Owner';
    document.getElementById('review-b-phone').textContent = app.phone || d.phone || 'N/A';
    document.getElementById('review-b-email').textContent = app.email || d.email || 'N/A';
    document.getElementById('review-b-address').textContent = app.address || d.address || 'N/A';
    document.getElementById('review-b-volume').textContent = app.weeklyVolume || d.volume || '50-100 bundles';

    let statusVal = 'reviewing';
    if (app.status === 'approved' || app.status === 'active') {
      statusVal = 'approved';
    } else if (app.status === 'rejected' || app.status === 'declined') {
      statusVal = 'rejected';
    } else if (app.status === 'cancelled') {
      statusVal = 'cancelled';
    } else {
      statusVal = 'reviewing';
    }
    document.getElementById('review-status-select').value = statusVal;
    document.getElementById('review-discount-input').value = app.discountRate || (app.status === 'approved' ? 15 : 10);
    document.getElementById('review-staff-notes').value = app.staffNotes || '';

    reviewModal.classList.add('active');
  }

  async function saveReviewStatus(e) {
    e.preventDefault();
    if (!activeAppId) return;

    const rawStatus = document.getElementById('review-status-select').value;
    const targetStatus = rawStatus === 'reviewing' ? 'under_review' : rawStatus;
    const staffNotes = document.getElementById('review-staff-notes').value.trim();

    try {
      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.patch(`/partner/${activeAppId}/status`, {
          status: targetStatus,
          staffNotes: staffNotes
        });
      }
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Application ${activeAppId} updated in database to: ${targetStatus}`, 'success');
      }
      if (reviewModal) reviewModal.classList.remove('active');
      renderPartners();
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Failed to update application: ' + err.message, 'danger');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderPartners();

    document.querySelectorAll('.order-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderPartners();
      });
    });

    document.getElementById('form-review-partner')?.addEventListener('submit', saveReviewStatus);

    document.getElementById('btn-close-review')?.addEventListener('click', () => {
      if (reviewModal) reviewModal.classList.remove('active');
    });

    reviewModal?.addEventListener('click', (e) => {
      if (e.target === reviewModal) reviewModal.classList.remove('active');
    });

    window.addEventListener('weBakeAdminUpdate', () => {
      renderPartners();
    });
  });

})(window, document);
