/**
 * ====================================================================
 * WeBake Admin Portal — Dashboard Command Center & Analytics (admin-dashboard.js)
 * Real-time KPIs, Cash Drawer Reconciliation, and Channel Breakdowns.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  function renderDashboard() {
    const orders = window.WeBakeAdmin.getOrders();
    const partners = window.WeBakeAdmin.getPartners();
    const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // 1. KPI Metrics
    let totalSalesToday = 0;
    let onlineSalesToday = 0;
    let walkinSalesToday = 0;
    let totalCashReceived = 0;
    let totalGCashReceived = 0;
    let totalMayaReceived = 0;
    let downpaymentsCollected = 0;
    let outstandingBalances = 0;

    let pendingOrders = 0;
    let inProductionOrders = 0;
    let pendingRefunds = 0;

    orders.forEach(o => {
      const isToday = (o.date === todayStr || !o.date);
      const isWalkin = (o.channel === 'walkin' || (o.orderId && o.orderId.includes('WALK')));
      const isDownpayment = o.balance > 0;
      const collectedAmount = isDownpayment ? (o.downpayment || 0) : (o.total || 0);

      // Status counters
      if (o.status === 'pending') pendingOrders += 1;
      if (o.status === 'in_production' || o.status === 'preparing' || o.status === 'confirmed') inProductionOrders += 1;
      if (o.status === 'cancellation_requested') pendingRefunds += 1;

      // Completed / Active revenues
      if (o.status !== 'cancelled' && o.status !== 'refunded') {
        if (isToday) {
          totalSalesToday += (o.total || 0);
          if (isWalkin) {
            walkinSalesToday += (o.total || 0);
          } else {
            onlineSalesToday += (o.total || 0);
          }
        }

        // Method breakdowns
        if (o.paymentMethod === 'Cash') {
          totalCashReceived += collectedAmount;
        } else if (o.paymentMethod === 'GCash') {
          totalGCashReceived += collectedAmount;
        } else if (o.paymentMethod === 'PayMaya') {
          totalMayaReceived += collectedAmount;
        }

        // Receivables
        downpaymentsCollected += (o.downpayment || 0);
        outstandingBalances += (o.balance || 0);
      }
    });

    const pendingPartners = partners.filter(p => !p.status || p.status === 'pending').length;

    // Update KPI Card DOM
    const kpiSalesEl = document.getElementById('kpi-today-sales');
    const kpiSalesSubEl = document.getElementById('kpi-sales-subtext');
    if (kpiSalesEl) kpiSalesEl.textContent = window.WeBakeAdmin.formatPHP(totalSalesToday);
    if (kpiSalesSubEl) kpiSalesSubEl.textContent = `Online: ${window.WeBakeAdmin.formatPHP(onlineSalesToday)} | Walk-In: ${window.WeBakeAdmin.formatPHP(walkinSalesToday)}`;

    const kpiPendingEl = document.getElementById('kpi-pending-count');
    if (kpiPendingEl) kpiPendingEl.textContent = pendingOrders;

    const kpiProductionEl = document.getElementById('kpi-production-count');
    if (kpiProductionEl) kpiProductionEl.textContent = inProductionOrders;

    const kpiRefundsEl = document.getElementById('kpi-refunds-count');
    if (kpiRefundsEl) kpiRefundsEl.textContent = pendingRefunds;

    const kpiPartnersEl = document.getElementById('kpi-partners-count');
    if (kpiPartnersEl) kpiPartnersEl.textContent = pendingPartners;

    // 2. Cash Reconciliation Card
    const cashRecon = window.WeBakeAdmin.getCashRecon();
    const openingCash = cashRecon.openingCash || 1000;
    const expectedDrawerCash = openingCash + totalCashReceived;

    const cashDrawerOpeningEl = document.getElementById('recon-opening-cash');
    const cashDrawerSalesEl = document.getElementById('recon-cash-sales');
    const cashDrawerExpectedEl = document.getElementById('recon-expected-drawer');

    if (cashDrawerOpeningEl) cashDrawerOpeningEl.textContent = window.WeBakeAdmin.formatPHP(openingCash);
    if (cashDrawerSalesEl) cashDrawerSalesEl.textContent = window.WeBakeAdmin.formatPHP(totalCashReceived);
    if (cashDrawerExpectedEl) cashDrawerExpectedEl.textContent = window.WeBakeAdmin.formatPHP(expectedDrawerCash);

    // 3. Receivables & Balances
    const recCollectedEl = document.getElementById('recon-downpayment-collected');
    const recOutstandingEl = document.getElementById('recon-outstanding-balance');
    const recBarEl = document.getElementById('recon-receivables-bar');

    if (recCollectedEl) recCollectedEl.textContent = window.WeBakeAdmin.formatPHP(downpaymentsCollected);
    if (recOutstandingEl) recOutstandingEl.textContent = window.WeBakeAdmin.formatPHP(outstandingBalances);

    const totalReceivables = downpaymentsCollected + outstandingBalances;
    const pct = totalReceivables > 0 ? Math.round((downpaymentsCollected / totalReceivables) * 100) : 100;
    if (recBarEl) recBarEl.style.width = pct + '%';

    // 4. Payment Method Breakdown
    const payCashEl = document.getElementById('recon-pay-cash');
    const payGcashEl = document.getElementById('recon-pay-gcash');
    const payMayaEl = document.getElementById('recon-pay-maya');

    if (payCashEl) payCashEl.textContent = window.WeBakeAdmin.formatPHP(totalCashReceived);
    if (payGcashEl) payGcashEl.textContent = window.WeBakeAdmin.formatPHP(totalGCashReceived);
    if (payMayaEl) payMayaEl.textContent = window.WeBakeAdmin.formatPHP(totalMayaReceived);

    // 5. Recent Orders Feed
    renderRecentOrders(orders);

    // 6. Recent Activity List
    renderActivityFeed(orders, partners);
  }

  function renderRecentOrders(orders) {
    const tbody = document.getElementById('dashboard-recent-orders-tbody');
    if (!tbody) return;

    const recent = orders.slice(0, 5);

    if (recent.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <div class="empty-icon-wrap"><i class="fas fa-shopping-bag"></i></div>
              <h4 class="empty-title">No Orders Yet</h4>
              <p class="empty-desc">When customers place orders online or at the POS counter, they will appear here in real-time.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = recent.map(o => {
      const isWalkin = (o.channel === 'walkin' || (o.orderId && o.orderId.includes('WALK')));
      const channelBadge = isWalkin
        ? `<span class="badge badge-channel-walkin">Walk-In</span>`
        : `<span class="badge badge-channel-online">Online</span>`;

      return `
        <tr>
          <td><strong>${o.orderId}</strong></td>
          <td>${o.customer?.name || 'Customer'}</td>
          <td>${channelBadge}</td>
          <td><strong>${window.WeBakeAdmin.formatPHP(o.total)}</strong></td>
          <td>${window.WeBakeAdmin.getStatusBadge(o.status)}</td>
          <td>
            <a href="orders.html?id=${o.orderId}" class="btn btn-outline btn-sm">
              <i class="fas fa-eye"></i> View
            </a>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderActivityFeed(orders, partners) {
    const listEl = document.getElementById('dashboard-activity-list');
    if (!listEl) return;

    const events = [];

    orders.slice(0, 4).forEach(o => {
      events.push({
        title: `Order ${o.orderId} placed (${o.paymentMethod})`,
        time: `${o.date || 'Recent'} ${o.time || ''}`,
        icon: 'fas fa-shopping-bag',
        bg: 'var(--accent-soft)',
        color: 'var(--primary)'
      });
      if (o.status === 'cancellation_requested') {
        events.push({
          title: `Refund requested for ${o.orderId}`,
          time: 'Pending review',
          icon: 'fas fa-undo',
          bg: 'var(--danger-bg)',
          color: 'var(--danger)'
        });
      }
    });

    partners.slice(0, 2).forEach(p => {
      events.push({
        title: `New Reseller application: ${p.details?.businessName || p.businessName || 'Store'}`,
        time: p.date || 'Recently submitted',
        icon: 'fas fa-handshake',
        bg: 'var(--info-bg)',
        color: 'var(--info)'
      });
    });

    if (events.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p class="empty-desc">No recent activity logged yet.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = events.map(e => `
      <div class="activity-item">
        <div class="activity-icon-badge" style="background:${e.bg}; color:${e.color};">
          <i class="${e.icon}"></i>
        </div>
        <div class="activity-details">
          <div class="activity-title">${e.title}</div>
          <div class="activity-time">${e.time}</div>
        </div>
      </div>
    `).join('');
  }

  // --- Customers Directory Modal ---
  function renderCustomerDirectory() {
    const tbody = document.getElementById('cust-directory-tbody');
    if (!tbody) return;

    const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
    const orders = window.WeBakeAdmin.getOrders();

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              <p class="empty-desc">No customer accounts registered yet.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const userOrders = orders.filter(o => o.customer?.email === u.email);
      const totalSpend = userOrders.reduce((s, o) => s + (o.total || 0), 0);

      return `
        <tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td>${u.contact || 'N/A'}</td>
          <td>${userOrders.length} orders</td>
          <td><strong>${window.WeBakeAdmin.formatPHP(totalSpend)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderDashboard();

    // Customer Directory Modal
    const custModal = document.getElementById('modal-customer-directory');
    document.getElementById('btn-open-customers')?.addEventListener('click', () => {
      renderCustomerDirectory();
      if (custModal) custModal.classList.add('active');
    });

    document.getElementById('btn-close-customers')?.addEventListener('click', () => {
      if (custModal) custModal.classList.remove('active');
    });

    custModal?.addEventListener('click', (e) => {
      if (e.target === custModal) custModal.classList.remove('active');
    });

    // Realtime storage listener
    window.addEventListener('weBakeAdminUpdate', () => {
      renderDashboard();
    });
  });

})(window, document);
