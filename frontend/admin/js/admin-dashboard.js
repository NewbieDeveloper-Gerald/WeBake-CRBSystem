/**
 * ====================================================================
 * WeBake Admin Portal — Dashboard Command Center & Analytics (admin-dashboard.js)
 * Fully connected to unified backend API (/api/orders/dashboard/stats,
 * /api/orders/all, and /api/auth/users/customers).
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  async function renderDashboard() {
    try {
      let stats = null;
      let orders = [];

      if (window.WeBakeAdminAPI) {
        const [statsRes, ordersRes] = await Promise.all([
          window.WeBakeAdminAPI.get('/orders/dashboard/stats').catch(() => null),
          window.WeBakeAdminAPI.get('/orders/all').catch(() => null)
        ]);

        if (statsRes && statsRes.success) stats = statsRes.stats;
        if (ordersRes && ordersRes.success && Array.isArray(ordersRes.orders)) orders = ordersRes.orders;
      }

      // Fallback calculation if backend stats endpoint is temporarily unreachable
      if (!stats) {
        orders = orders.length ? orders : (window.WeBakeAdmin?.getOrders() || []);
        const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        let totalSalesToday = 0, onlineSalesToday = 0, walkinSalesToday = 0;
        let totalCashReceived = 0, totalGCashReceived = 0, totalMayaReceived = 0;
        let downpaymentsCollected = 0, outstandingBalances = 0;
        let pendingOrders = 0, inProductionOrders = 0, pendingRefunds = 0;

        orders.forEach(o => {
          const isToday = (o.date === todayStr);
          const isWalkin = (o.channel === 'walkin' || (o.orderId && o.orderId.includes('WALK')));
          const collected = o.balance > 0 ? (o.downpayment || 0) : (o.total || 0);

          if (o.status === 'pending') pendingOrders++;
          if (['in_production', 'preparing', 'confirmed', 'downpayment_confirmed', 'baking'].includes(o.status)) inProductionOrders++;
          if (o.status === 'cancellation_requested') pendingRefunds++;

          if (o.status !== 'cancelled' && o.status !== 'refunded') {
            if (isToday) {
              totalSalesToday += (o.total || 0);
              if (isWalkin) walkinSalesToday += (o.total || 0);
              else onlineSalesToday += (o.total || 0);
            }
            if (o.paymentMethod === 'Cash' || o.paymentMethod === 'COD') totalCashReceived += collected;
            else if (o.paymentMethod === 'GCash') totalGCashReceived += collected;
            else if (o.paymentMethod === 'PayMaya') totalMayaReceived += collected;

            downpaymentsCollected += (o.downpayment || 0);
            outstandingBalances += (o.balance || 0);
          }
        });

        stats = {
          salesToday: totalSalesToday,
          onlineSalesToday,
          walkinSalesToday,
          pendingOrders,
          inProductionOrders,
          pendingRefunds,
          totalCashReceived,
          totalGCashReceived,
          totalMayaReceived,
          downpaymentsCollected,
          outstandingBalances,
          openingCash: 1000,
          expectedDrawerCash: 1000 + totalCashReceived
        };
      }

      // Update KPI DOM Elements
      const kpiSalesEl = document.getElementById('kpi-today-sales');
      const kpiSalesSubEl = document.getElementById('kpi-sales-subtext');
      if (kpiSalesEl) kpiSalesEl.textContent = window.WeBakeAdmin.formatPHP(stats.salesToday || 0);
      if (kpiSalesSubEl) {
        kpiSalesSubEl.textContent = `Online: ${window.WeBakeAdmin.formatPHP(stats.onlineSalesToday || 0)} | Walk-In: ${window.WeBakeAdmin.formatPHP(stats.walkinSalesToday || 0)}`;
      }

      const kpiPendingEl = document.getElementById('kpi-pending-count');
      if (kpiPendingEl) kpiPendingEl.textContent = stats.pendingOrders || 0;

      const kpiProductionEl = document.getElementById('kpi-production-count');
      if (kpiProductionEl) kpiProductionEl.textContent = stats.inProductionOrders || 0;

      const kpiRefundsEl = document.getElementById('kpi-refunds-count');
      if (kpiRefundsEl) kpiRefundsEl.textContent = stats.pendingRefunds || 0;

      // Cash Reconciliation Card
      const cashDrawerOpeningEl = document.getElementById('recon-opening-cash');
      const cashDrawerSalesEl = document.getElementById('recon-cash-sales');
      const cashDrawerExpectedEl = document.getElementById('recon-expected-drawer');

      if (cashDrawerOpeningEl) cashDrawerOpeningEl.textContent = window.WeBakeAdmin.formatPHP(stats.openingCash || 1000);
      if (cashDrawerSalesEl) cashDrawerSalesEl.textContent = window.WeBakeAdmin.formatPHP(stats.totalCashReceived || 0);
      if (cashDrawerExpectedEl) cashDrawerExpectedEl.textContent = window.WeBakeAdmin.formatPHP(stats.expectedDrawerCash || 1000);

      // Receivables & Balances
      const recCollectedEl = document.getElementById('recon-downpayment-collected');
      const recOutstandingEl = document.getElementById('recon-outstanding-balance');
      const recBarEl = document.getElementById('recon-receivables-bar');

      if (recCollectedEl) recCollectedEl.textContent = window.WeBakeAdmin.formatPHP(stats.downpaymentsCollected || 0);
      if (recOutstandingEl) recOutstandingEl.textContent = window.WeBakeAdmin.formatPHP(stats.outstandingBalances || 0);

      const totalReceivables = (stats.downpaymentsCollected || 0) + (stats.outstandingBalances || 0);
      const pct = totalReceivables > 0 ? Math.round(((stats.downpaymentsCollected || 0) / totalReceivables) * 100) : 100;
      if (recBarEl) recBarEl.style.width = pct + '%';

      // Payment Breakdown
      const payCashEl = document.getElementById('recon-pay-cash');
      const payGcashEl = document.getElementById('recon-pay-gcash');
      const payMayaEl = document.getElementById('recon-pay-maya');

      if (payCashEl) payCashEl.textContent = window.WeBakeAdmin.formatPHP(stats.totalCashReceived || 0);
      if (payGcashEl) payGcashEl.textContent = window.WeBakeAdmin.formatPHP(stats.totalGCashReceived || 0);
      if (payMayaEl) payMayaEl.textContent = window.WeBakeAdmin.formatPHP(stats.totalMayaReceived || 0);

      // Feeds
      renderRecentOrders(orders);
      renderActivityFeed(orders);

    } catch (err) {
      console.error('[Dashboard Render Error]:', err);
    }
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
          <td>${window.escapeHtml ? window.escapeHtml(o.customer?.name || 'Customer') : (o.customer?.name || 'Customer')}</td>
          <td>${channelBadge}</td>
          <td><strong>${window.WeBakeAdmin.formatPHP(o.total)}</strong></td>
          <td>${window.WeBakeAdmin.getStatusBadge(o.status)}</td>
          <td>
            <a href="orders.html" class="btn btn-outline btn-sm">
              <i class="fas fa-eye"></i> View
            </a>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderActivityFeed(orders) {
    const listEl = document.getElementById('dashboard-activity-list');
    if (!listEl) return;

    const events = [];

    orders.slice(0, 5).forEach(o => {
      events.push({
        title: `Order ${o.orderId} placed (${o.paymentMethod || 'Online'})`,
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

  // --- Customers Directory Modal (Real Database Customers) ---
  async function renderCustomerDirectory() {
    const tbody = document.getElementById('cust-directory-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 1.5rem; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin"></i> Loading registered customers...
        </td>
      </tr>
    `;

    try {
      let customers = [];
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/auth/users/customers');
        if (res && res.success && Array.isArray(res.customers)) {
          customers = res.customers;
        }
      }

      if (customers.length === 0) {
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

      tbody.innerHTML = customers.map(u => `
        <tr>
          <td><strong>${window.escapeHtml ? window.escapeHtml(u.name) : u.name}</strong></td>
          <td>${window.escapeHtml ? window.escapeHtml(u.email) : u.email}</td>
          <td>${window.escapeHtml ? window.escapeHtml(u.contact || 'N/A') : (u.contact || 'N/A')}</td>
          <td>${u.totalOrders} order${u.totalOrders === 1 ? '' : 's'}</td>
          <td><strong>${window.WeBakeAdmin.formatPHP(u.lifetimeValue)}</strong></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('[Customer Directory Error]:', err);
      tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Failed to load customer directory.</td></tr>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderDashboard();

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

    window.addEventListener('weBakeAdminUpdate', () => {
      renderDashboard();
    });
  });

})(window, document);
