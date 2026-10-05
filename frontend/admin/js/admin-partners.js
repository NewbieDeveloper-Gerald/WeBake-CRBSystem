/**
 * ====================================================================
 * WeBake Admin Portal — Wholesale Reseller Partnerships (admin-partners.js)
 * Pipeline review, status controls, and partner discount tier assignment.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  let currentTab = 'all';
  let activeAppId = null;

  const tableBody = document.getElementById('partners-table-body');
  const reviewModal = document.getElementById('modal-review-partner');

  function renderPartners() {
    if (!tableBody) return;
    const partners = window.WeBakeAdmin.getPartners();

    const filtered = partners.filter(p => {
      const status = p.status || 'pending';
      if (currentTab === 'pending') return status === 'pending';
      if (currentTab === 'reviewing') return status === 'reviewing' || status === 'contacted';
      if (currentTab === 'approved') return status === 'approved';
      if (currentTab === 'rejected') return status === 'rejected';
      return true;
    });

    // Update Counts
    const pendingCount = partners.filter(p => !p.status || p.status === 'pending').length;
    const countEl = document.getElementById('count-partner-pending');
    if (countEl) countEl.textContent = pendingCount;

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-icon-wrap"><i class="fas fa-handshake"></i></div>
              <h4 class="empty-title">No ${currentTab === 'all' ? '' : currentTab} Reseller Applications</h4>
              <p class="empty-desc">When prospective partner stores submit wholesale reseller applications from partner.html, they will appear here for vetting.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(p => {
      const d = p.details || {};
      const appId = p.appId || ('WB-PRT-' + (p.id || '1001'));
      const bName = d['business-name'] || p.businessName || 'Store';
      const bType = d['business-type'] || p.businessType || 'sari_sari';
      const contactPerson = d['owner-name'] || p.fullName || p.name || 'Owner';
      const phone = d.phone || p.phone || p.contact || 'N/A';
      const volume = d.volume || p.weeklyVolume || '50-100 bundles';
      const status = p.status || 'pending';

      let statusBadge = '<span class="badge badge-pending">Pending Review</span>';
      if (status === 'reviewing' || status === 'contacted') statusBadge = '<span class="badge badge-confirmed">Under Review</span>';
      if (status === 'approved') statusBadge = '<span class="badge badge-completed">Approved Partner</span>';
      if (status === 'rejected') statusBadge = '<span class="badge badge-cancelled">Declined</span>';

      return `
        <tr>
          <td><strong>${appId}</strong></td>
          <td>
            <strong>${bName}</strong>
            <div class="text-muted font-sm">${formatBusinessType(bType)}</div>
          </td>
          <td>${contactPerson}</td>
          <td>${phone}</td>
          <td>${volume}</td>
          <td><strong>${p.discountRate ? p.discountRate + '%' : 'Standard'}</strong></td>
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
  }

  function formatBusinessType(type) {
    const map = {
      'sari_sari': 'Sari-Sari Store',
      'bakery': 'Bakery / Pastry Shop',
      'canteen': 'School / Office Canteen',
      'distributor': 'Sub-Distributor'
    };
    return map[type] || type;
  }

  function openReviewModal(appId) {
    const partners = window.WeBakeAdmin.getPartners();
    const app = partners.find(p => (p.appId === appId || ('WB-PRT-' + (p.id || '1001')) === appId));
    if (!app || !reviewModal) return;

    activeAppId = appId;
    const d = app.details || {};

    document.getElementById('review-app-id').textContent = appId;
    document.getElementById('review-b-name').textContent = d['business-name'] || app.businessName || 'Store';
    document.getElementById('review-b-type').textContent = formatBusinessType(d['business-type'] || app.businessType || 'sari_sari');
    document.getElementById('review-b-owner').textContent = d['owner-name'] || app.fullName || 'Owner';
    document.getElementById('review-b-phone').textContent = d.phone || app.phone || 'N/A';
    document.getElementById('review-b-email').textContent = d.email || app.email || 'N/A';
    document.getElementById('review-b-address').textContent = d.address || app.address || 'N/A';
    document.getElementById('review-b-volume').textContent = d.volume || app.weeklyVolume || '50-100 bundles';

    document.getElementById('review-status-select').value = app.status || 'pending';
    document.getElementById('review-discount-input').value = app.discountRate || 10;
    document.getElementById('review-staff-notes').value = app.staffNotes || '';

    reviewModal.classList.add('active');
  }

  function saveReviewStatus(e) {
    e.preventDefault();
    if (!activeAppId) return;

    const partners = window.WeBakeAdmin.getPartners();
    const app = partners.find(p => (p.appId === activeAppId || ('WB-PRT-' + (p.id || '1001')) === activeAppId));
    if (app) {
      app.status = document.getElementById('review-status-select').value;
      app.discountRate = parseInt(document.getElementById('review-discount-input').value, 10) || 10;
      app.staffNotes = document.getElementById('review-staff-notes').value.trim();

      window.WeBakeAdmin.savePartners(partners);
      syncUserPartnerStatus(app);
      window.WeBakeAdmin.showToast(`Application ${activeAppId} updated to: ${app.status}`, 'success');
    }

    if (reviewModal) reviewModal.classList.remove('active');
    renderPartners();
  }

  function syncUserPartnerStatus(app) {
    try {
      const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const d = app.details || {};
      const email = (d.email || app.email || '').toLowerCase();

      const user = users.find(u => (u.email || '').toLowerCase() === email);
      if (user) {
        user.partnerStatus = app.status;
        user.partnerDiscount = app.discountRate;
        localStorage.setItem('weBakeUsers', JSON.stringify(users));
      }
    } catch (e) {}
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

    document.getElementById('btn-close-review')?.addEventListener('click', () => {
      if (reviewModal) reviewModal.classList.remove('active');
    });

    document.getElementById('form-review-partner')?.addEventListener('submit', saveReviewStatus);

    window.addEventListener('weBakeAdminUpdate', () => {
      renderPartners();
    });
  });

})(window, document);
