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
  let adminPollTimer = null;
  let isSavingReview = false;

  const tableBody = document.getElementById('partners-table-body');
  const reviewModal = document.getElementById('modal-review-partner');

  async function renderPartners(silent = false) {
    if (!tableBody) return;

    if (!silent) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
            <i class="fas fa-spinner fa-spin fa-2x"></i>
            <p style="margin-top:0.5rem;">Loading reseller applications from database...</p>
          </td>
        </tr>
      `;
    }

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
        if (currentTab === 'reviewing' || currentTab === 'under_review') return status === 'under_review' || status === 'reviewing' || status === 'contacted';
        if (currentTab === 'approved') return status === 'approved' || status === 'active';
        if (currentTab === 'rejected') return status === 'rejected' || status === 'declined';
        if (currentTab === 'cancelled') return status === 'cancelled';
        return true;
      });

      // Update Tab Counts
      const pendingCount = partners.filter(p => !p.status || p.status === 'pending').length;
      const countPendingEl = document.getElementById('count-partner-pending');
      if (countPendingEl) countPendingEl.textContent = pendingCount;

      const cancelledCount = partners.filter(p => (p.status || '').toLowerCase() === 'cancelled').length;
      const countCancelledEl = document.getElementById('count-partner-cancelled');
      if (countCancelledEl) {
        countCancelledEl.textContent = cancelledCount;
        countCancelledEl.style.display = cancelledCount > 0 ? 'inline-block' : 'none';
      }

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7">
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
          statusBadge = '<span class="badge badge-completed"><i class="fas fa-crown"></i> Priority Partner</span>';
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
      if (!silent) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7">
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

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('review-app-id', appId);
    setText('review-b-name', app.businessName || d['business-name'] || 'Store');
    setText('review-b-type', formatBusinessType(app.businessType || d['business-type'] || 'sari_sari'));
    setText('review-b-owner', app.fullName || d['owner-name'] || 'Owner');
    setText('review-b-phone', app.phone || d.phone || 'N/A');
    setText('review-b-email', app.email || d.email || 'N/A');
    setText('review-b-address', app.address || d.address || 'N/A');
    setText('review-b-volume', app.weeklyVolume || d.volume || '50-100 bundles');

    let statusVal = 'under_review';
    const rawStatus = (app.status || '').toLowerCase();
    if (rawStatus === 'approved' || rawStatus === 'active') {
      statusVal = 'approved';
    } else if (rawStatus === 'rejected' || rawStatus === 'declined') {
      statusVal = 'rejected';
    } else if (rawStatus === 'cancelled') {
      statusVal = 'cancelled';
    } else {
      statusVal = 'under_review';
    }

    const statusSelect = document.getElementById('review-status-select');
    if (statusSelect) statusSelect.value = statusVal;

    const staffNotesEl = document.getElementById('review-staff-notes');
    if (staffNotesEl) staffNotesEl.value = app.staffNotes || '';

    reviewModal.classList.add('active');
  }

  async function saveReviewStatus(e) {
    e.preventDefault();
    if (!activeAppId || isSavingReview) return;

    const rawStatus = document.getElementById('review-status-select')?.value || 'under_review';
    const targetStatus = rawStatus === 'reviewing' ? 'under_review' : rawStatus;
    const staffNotes = document.getElementById('review-staff-notes')?.value.trim() || '';

    const submitBtn = document.getElementById('form-review-partner')?.querySelector('button[type="submit"]');
    const origHtml = submitBtn ? submitBtn.innerHTML : '';

    try {
      isSavingReview = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Decision...';
      }

      if (window.WeBakeAdminAPI) {
        await window.WeBakeAdminAPI.patch(`/partner/${activeAppId}/status`, {
          status: targetStatus,
          staffNotes: staffNotes
        });
      }

      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast(`Application ${activeAppId} updated to: ${targetStatus}`, 'success');
      }

      if (reviewModal) reviewModal.classList.remove('active');
      await renderPartners(true);
    } catch (err) {
      console.error('[Save Review Status Error]:', err);
      if (window.WeBakeAdmin) {
        window.WeBakeAdmin.showToast('Failed to update application: ' + err.message, 'danger');
      }
    } finally {
      isSavingReview = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    }
  }

  // --- Near-Real-Time Polling for Admin Pipeline (every 12 seconds) ---
  function startAdminPolling() {
    if (adminPollTimer) clearInterval(adminPollTimer);
    adminPollTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        renderPartners(true);
      }
    }, 12000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderPartners(true);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    renderPartners(false);
    startAdminPolling();

    document.querySelectorAll('.order-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderPartners(false);
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
      renderPartners(true);
    });
  });

})(window, document);
