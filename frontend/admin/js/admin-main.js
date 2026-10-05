/**
 * ====================================================================
 * WeBake Admin Portal — Core Shared Utilities (admin-main.js)
 * Clean, modular state management & cross-tab live synchronization.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  // --- Storage Keys (Direct Alignment with Customer Portal) ---
  const STORAGE_KEYS = {
    ORDERS: 'weBakeAllOrders',
    PRODUCTS: 'weBakeProducts',
    INVENTORY: 'weBakeInventory',
    PARTNERS: 'weBakePartnerApplications',
    USERS: 'weBakeUsers',
    SETTINGS: 'weBakeSettings',
    CASH_RECON: 'weBakeCashReconciliation',
    ADMIN_SESSION: 'weBakeAdminSession'
  };

  // --- Default Fallback Products (Only if not already created) ---
  const DEFAULT_PRODUCTS = [
    { id: 1, name: 'Mamon', desc: 'Soft and fluffy Filipino sponge cake, perfect for merienda or pasalubong.', price: 105, min: 25, loosePrice: 5, status: 'in_stock', img: '' },
    { id: 2, name: 'Otap', desc: 'Crispy, flaky oval-shaped puff pastry with a caramelized sugar coating.', price: 105, min: 25, loosePrice: 5, status: 'in_stock', img: '' },
    { id: 3, name: 'Eggnog', desc: 'Sweet and crumbly meringue-based cookie, delicately baked to perfection.', price: 105, min: 25, loosePrice: 5, status: 'in_stock', img: '' },
    { id: 4, name: 'Buttertoast', desc: 'Golden, crunchy butter-toasted bread slices. Perfectly toasted with rich butter flavor.', price: 105, min: 25, loosePrice: 5, status: 'in_stock', img: '' }
  ];

  // --- Default Fallback Settings ---
  const DEFAULT_SETTINGS = {
    gcashNumber: '0917-123-4567',
    paymayaNumber: '0918-987-6543',
    accountName: 'Gerald V.',
    gcashQr: '../img/gcash-qr.svg',
    paymayaQr: '../img/paymaya-qr.svg',
    storeHours: '6:00 AM - 8:00 PM',
    cutoffTime: '2:00 PM',
    deliveryAreas: 'Marilao, Meycauayan, Bocaue, Caloocan, Valenzuela, QC'
  };

  // --- Data Accessors ---
  function getOrders() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveOrders(orders) {
    try {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
      dispatchLocalUpdate('orders');
    } catch (e) {
      console.error('Failed to save orders to localStorage:', e);
    }
  }

  function getProducts() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRODUCTS));
      if (stored && Array.isArray(stored) && stored.length > 0) {
        return stored;
      }
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(DEFAULT_PRODUCTS));
      return DEFAULT_PRODUCTS;
    } catch (e) {
      return DEFAULT_PRODUCTS;
    }
  }

  function saveProducts(products) {
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      dispatchLocalUpdate('products');
    } catch (e) {
      console.error('Failed to save products:', e);
    }
  }

  function getInventory() {
    try {
      const inv = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY));
      if (inv && typeof inv === 'object') return inv;
      const initial = {
        batches: [],     // Daily baking batch records
        spoilage: [],    // Spoilage / leftover records
        stock: {         // Live current stock by product ID
          1: { morning: 0, carried: 0, spoilage: 0 },
          2: { morning: 0, carried: 0, spoilage: 0 },
          3: { morning: 0, carried: 0, spoilage: 0 },
          4: { morning: 0, carried: 0, spoilage: 0 }
        }
      };
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(initial));
      return initial;
    } catch (e) {
      return { batches: [], spoilage: [], stock: {} };
    }
  }

  function saveInventory(inv) {
    try {
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inv));
      dispatchLocalUpdate('inventory');
    } catch (e) {
      console.error('Failed to save inventory:', e);
    }
  }

  function getPartners() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTNERS) || '[]');
    } catch (e) {
      return [];
    }
  }

  function savePartners(partners) {
    try {
      localStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(partners));
      dispatchLocalUpdate('partners');
    } catch (e) {
      console.error('Failed to save partner applications:', e);
    }
  }

  function getSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
      if (s) return { ...DEFAULT_SETTINGS, ...s };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      dispatchLocalUpdate('settings');
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  function getCashRecon() {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.CASH_RECON));
      return d || { openingCash: 1000, logs: [] };
    } catch (e) {
      return { openingCash: 1000, logs: [] };
    }
  }

  function saveCashRecon(recon) {
    try {
      localStorage.setItem(STORAGE_KEYS.CASH_RECON, JSON.stringify(recon));
    } catch (e) {}
  }

  // --- Real-time Notification Dispatcher ---
  function dispatchLocalUpdate(type) {
    window.dispatchEvent(new CustomEvent('weBakeAdminUpdate', { detail: { type } }));
  }

  // --- Currency & Number Formatting ---
  function formatPHP(amount) {
    const num = Number(amount) || 0;
    return '\u20B1' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // --- Toast Notification ---
  function showAdminToast(msg, type = 'normal') {
    let toast = document.getElementById('admin-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'admin-toast';
      document.body.appendChild(toast);
    }

    toast.className = '';
    if (type === 'success') toast.classList.add('toast-success');
    if (type === 'danger') toast.classList.add('toast-danger');

    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'danger') icon = 'fas fa-exclamation-circle';

    toast.innerHTML = `<i class="${icon}"></i><span>${msg}</span>`;
    toast.classList.add('active');

    setTimeout(() => {
      toast.classList.remove('active');
    }, 2800);
  }

  // --- Status Badge Helper ---
  function getStatusBadge(status) {
    const map = {
      'pending': { label: 'Pending Downpayment', class: 'badge-pending', icon: 'fas fa-clock' },
      'downpayment_confirmed': { label: 'Payment Verified', class: 'badge-confirmed', icon: 'fas fa-check' },
      'confirmed': { label: 'Payment Verified', class: 'badge-confirmed', icon: 'fas fa-check' },
      'baking': { label: 'In Production', class: 'badge-preparing', icon: 'fas fa-fire' },
      'preparing': { label: 'In Production', class: 'badge-preparing', icon: 'fas fa-fire' },
      'in_production': { label: 'In Production', class: 'badge-preparing', icon: 'fas fa-fire' },
      'ready_for_pickup': { label: 'Ready for Pickup', class: 'badge-ready', icon: 'fas fa-box-open' },
      'out_for_delivery': { label: 'Out for Delivery', class: 'badge-ready', icon: 'fas fa-truck' },
      'delivered': { label: 'Completed & Paid', class: 'badge-completed', icon: 'fas fa-check-double' },
      'completed': { label: 'Completed & Paid', class: 'badge-completed', icon: 'fas fa-check-double' },
      'cancellation_requested': { label: 'Refund Requested', class: 'badge-cancelled', icon: 'fas fa-undo' },
      'cancelled': { label: 'Cancelled', class: 'badge-cancelled', icon: 'fas fa-ban' },
      'refunded': { label: 'Refunded', class: 'badge-refunded', icon: 'fas fa-hand-holding-usd' }
    };

    const s = map[status] || { label: (status || 'Pending').replace(/_/g, ' '), class: 'badge-pending', icon: 'fas fa-circle' };
    return `<span class="badge ${s.class}"><i class="${s.icon}"></i> ${s.label}</span>`;
  }

  // --- Auto-Sync Badges on Sidebar (Real Backend DB Aware) ---
  async function updateSidebarBadges() {
    try {
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/orders/dashboard/stats');
        if (res && res.success && res.stats) {
          const s = res.stats;
          const ordersBadge = document.getElementById('sidebar-orders-badge');
          if (ordersBadge) {
            ordersBadge.textContent = s.pendingOrders || 0;
            ordersBadge.style.display = (s.pendingOrders > 0) ? 'inline-block' : 'none';
          }
          const refundsBadge = document.getElementById('sidebar-refunds-badge');
          if (refundsBadge) {
            refundsBadge.textContent = s.pendingRefunds || 0;
            refundsBadge.style.display = (s.pendingRefunds > 0) ? 'inline-block' : 'none';
          }
          const partnersBadge = document.getElementById('sidebar-partners-badge');
          if (partnersBadge) {
            partnersBadge.textContent = s.pendingPartners || 0;
            partnersBadge.style.display = (s.pendingPartners > 0) ? 'inline-block' : 'none';
          }
          return;
        }
      }
    } catch (e) {
      // API fallback
    }

    const orders = getOrders();
    const pendingDownpayments = orders.filter(o => o.status === 'pending').length;
    const pendingRefunds = orders.filter(o => o.status === 'cancellation_requested').length;
    const partners = getPartners();
    const pendingPartners = partners.filter(p => !p.status || p.status === 'pending').length;

    const ordersBadge = document.getElementById('sidebar-orders-badge');
    if (ordersBadge) {
      ordersBadge.textContent = pendingDownpayments;
      ordersBadge.style.display = pendingDownpayments > 0 ? 'inline-block' : 'none';
    }

    const refundsBadge = document.getElementById('sidebar-refunds-badge');
    if (refundsBadge) {
      refundsBadge.textContent = pendingRefunds;
      refundsBadge.style.display = pendingRefunds > 0 ? 'inline-block' : 'none';
    }

    const partnersBadge = document.getElementById('sidebar-partners-badge');
    if (partnersBadge) {
      partnersBadge.textContent = pendingPartners;
      partnersBadge.style.display = pendingPartners > 0 ? 'inline-block' : 'none';
    }
  }

  // --- Document Ready Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle
    const toggleBtn = document.querySelector('.mobile-menu-toggle');
    const sidebar = document.querySelector('.admin-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('sidebar-open');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.admin-sidebar') && !e.target.closest('.mobile-menu-toggle')) {
          sidebar.classList.remove('sidebar-open');
        }
      });
    }

    // 2. Mark active navigation item
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
    document.querySelectorAll('.nav-item-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.includes(currentPage)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // 3. Update badges
    updateSidebarBadges();

    // 4. Cross-Tab Realtime Sync (Customer orders immediately trigger admin updates!)
    window.addEventListener('storage', (e) => {
      if (Object.values(STORAGE_KEYS).includes(e.key)) {
        updateSidebarBadges();
        window.dispatchEvent(new CustomEvent('weBakeAdminUpdate', { detail: { key: e.key } }));
      }
    });
  });

  // --- Export to Global WeBakeAdmin Namespace ---
  window.WeBakeAdmin = {
    KEYS: STORAGE_KEYS,
    getOrders,
    saveOrders,
    getProducts,
    saveProducts,
    getInventory,
    saveInventory,
    getPartners,
    savePartners,
    getSettings,
    saveSettings,
    getCashRecon,
    saveCashRecon,
    formatPHP,
    showToast: showAdminToast,
    getStatusBadge,
    updateSidebarBadges
  };

})(window, document);
