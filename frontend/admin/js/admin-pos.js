/**
 * ====================================================================
 * WeBake Admin Portal — Walk-In / In-Store POS Logic (admin-pos.js)
 * High-speed counter sales, cash calculator, and thermal receipt print.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  // --- Active POS State ---
  let cart = [];
  let orderType = 'takeout'; // 'takeout' or 'advance'
  let paymentMode = 'full';  // 'full' or 'downpayment'
  let paymentMethod = 'Cash'; // 'Cash', 'GCash', 'PayMaya'
  let cashTendered = 0;

  // --- DOM Elements ---
  const productGridEl = document.getElementById('pos-product-grid');
  const cartItemsListEl = document.getElementById('pos-cart-items-list');
  const cartSubtotalEl = document.getElementById('pos-cart-subtotal');
  const cartDownpaymentRowEl = document.getElementById('pos-downpayment-row');
  const cartDownpaymentValEl = document.getElementById('pos-downpayment-val');
  const cartBalanceRowEl = document.getElementById('pos-balance-row');
  const cartBalanceValEl = document.getElementById('pos-balance-val');
  const cartTotalDueEl = document.getElementById('pos-total-due');
  const cashCalculatorEl = document.getElementById('pos-cash-calculator');
  const cashInputEl = document.getElementById('pos-cash-tendered');
  const changeAmountEl = document.getElementById('pos-change-amount');
  const ewalletBoxEl = document.getElementById('pos-ewallet-box');
  const ewalletQrImgEl = document.getElementById('pos-ewallet-qr-img');
  const ewalletNumberEl = document.getElementById('pos-ewallet-number');
  const ewalletNameEl = document.getElementById('pos-ewallet-name');
  const ewalletRefInputEl = document.getElementById('pos-ewallet-ref');
  const downpaymentCheckboxEl = document.getElementById('pos-downpayment-checkbox');
  const advanceDetailsEl = document.getElementById('pos-advance-details');
  const custNameInput = document.getElementById('pos-cust-name');
  const custPhoneInput = document.getElementById('pos-cust-phone');
  const advanceDateInput = document.getElementById('pos-advance-date');
  const advanceTimeInput = document.getElementById('pos-advance-time');
  const btnCompleteOrder = document.getElementById('btn-pos-complete');
  const receiptModal = document.getElementById('pos-receipt-modal');

  let posProducts = [];

  // --- 1. Product Rendering ---
  async function renderProducts(filterCategory = 'all', searchQuery = '') {
    if (!productGridEl) return;

    try {
      if (window.WeBakeAdminAPI) {
        const res = await window.WeBakeAdminAPI.get('/products/all');
        if (res && res.success && Array.isArray(res.products)) {
          posProducts = res.products;
          try { localStorage.setItem('weBakeProducts', JSON.stringify(posProducts)); } catch (e) {}
        }
      }
    } catch (e) {}

    if (!posProducts.length) {
      posProducts = window.WeBakeAdmin?.getProducts() || [];
    }

    const inventory = window.WeBakeAdmin.getInventory();

    const filtered = posProducts.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (filterCategory === 'in_stock') return matchSearch && p.status === 'in_stock';
      return matchSearch;
    });

    if (filtered.length === 0) {
      productGridEl.innerHTML = `
        <div class="pos-cart-empty" style="grid-column: 1 / -1;">
          <i class="fas fa-bread-slice"></i>
          <p>No products found matching your search.</p>
        </div>
      `;
      return;
    }

    productGridEl.innerHTML = filtered.map(p => {
      // Stock calculation from inventory if logged
      const pStock = inventory.stock && inventory.stock[p.id] ? inventory.stock[p.id].morning : 100;
      const isAvailable = p.status !== 'out_of_stock';
      const loosePrice = p.loosePrice || 5;

      return `
        <div class="pos-item-card">
          <div class="pos-card-media">
            <i class="fas fa-bread-slice pos-card-icon"></i>
            <span class="pos-card-badge">
              <span class="badge ${p.status === 'in_stock' ? 'badge-instock' : 'badge-outofstock'}">
                ${p.status === 'in_stock' ? 'Available' : 'Out of Stock'}
              </span>
            </span>
          </div>
          <div class="pos-card-body">
            <h4 class="pos-item-name">${p.name}</h4>
            <p class="pos-item-spec">1 Bundle = ${p.min || 25} pcs</p>
            <div class="pos-item-pricing">
              <span class="pos-bundle-price">${window.WeBakeAdmin.formatPHP(p.price)}</span>
              <span class="pos-loose-price">${window.WeBakeAdmin.formatPHP(loosePrice)}/pc</span>
            </div>
            <div class="pos-card-actions">
              <button type="button" class="btn-add-bundle" data-id="${p.id}" data-type="bundle">
                <i class="fas fa-box"></i> + Bundle
              </button>
              <button type="button" class="btn-add-loose" data-id="${p.id}" data-type="loose">
                <i class="fas fa-cookie"></i> + Piece
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events
    productGridEl.querySelectorAll('.btn-add-bundle').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = parseInt(btn.dataset.id, 10);
        addToCart(pid, 'bundle');
      });
    });

    productGridEl.querySelectorAll('.btn-add-loose').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = parseInt(btn.dataset.id, 10);
        addToCart(pid, 'loose');
      });
    });
  }

  // --- 2. Cart Operations ---
  function addToCart(productId, unitType = 'bundle') {
    const products = posProducts.length ? posProducts : (window.WeBakeAdmin?.getProducts() || []);
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const cartKey = `${productId}_${unitType}`;
    const existing = cart.find(item => item.key === cartKey);
    const unitPrice = unitType === 'bundle' ? product.price : (product.loosePrice || 5);
    const labelSuffix = unitType === 'bundle' ? `(Bundle of ${product.min || 25})` : '(Loose Piece)';

    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        key: cartKey,
        id: product.id,
        name: `${product.name} ${labelSuffix}`,
        rawName: product.name,
        unitType: unitType,
        price: unitPrice,
        qty: 1
      });
    }

    renderCart();
  }

  function updateItemQty(cartKey, change) {
    const item = cart.find(i => i.key === cartKey);
    if (!item) return;

    item.qty += change;
    if (item.qty <= 0) {
      cart = cart.filter(i => i.key !== cartKey);
    }
    renderCart();
  }

  function removeItem(cartKey) {
    cart = cart.filter(i => i.key !== cartKey);
    renderCart();
  }

  function clearCart() {
    cart = [];
    cashTendered = 0;
    if (cashInputEl) cashInputEl.value = '';
    renderCart();
  }

  // --- 3. Render Cart & Calculations ---
  function renderCart() {
    if (!cartItemsListEl) return;

    if (cart.length === 0) {
      cartItemsListEl.innerHTML = `
        <div class="pos-cart-empty">
          <i class="fas fa-shopping-basket"></i>
          <p>No items added yet. Click products to add to cart.</p>
        </div>
      `;
      updateTotals(0);
      return;
    }

    cartItemsListEl.innerHTML = cart.map(item => `
      <div class="pos-cart-line-item">
        <div class="pos-line-info">
          <div class="pos-line-name">${item.name}</div>
          <div class="pos-line-unit">${window.WeBakeAdmin.formatPHP(item.price)} each</div>
        </div>
        <div class="pos-qty-stepper">
          <button type="button" class="pos-stepper-btn" data-key="${item.key}" data-action="dec">-</button>
          <span class="pos-stepper-qty">${item.qty}</span>
          <button type="button" class="pos-stepper-btn" data-key="${item.key}" data-action="inc">+</button>
        </div>
        <div class="pos-line-total">${window.WeBakeAdmin.formatPHP(item.price * item.qty)}</div>
        <button type="button" class="pos-line-delete" data-key="${item.key}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

    // Attach stepper events
    cartItemsListEl.querySelectorAll('.pos-stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const change = btn.dataset.action === 'inc' ? 1 : -1;
        updateItemQty(key, change);
      });
    });

    cartItemsListEl.querySelectorAll('.pos-line-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        removeItem(key);
      });
    });

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    updateTotals(subtotal);
  }

  function updateTotals(subtotal) {
    const isDownpayment = paymentMode === 'downpayment';
    const downpaymentDue = isDownpayment ? Math.round(subtotal * 0.5) : subtotal;
    const balanceDue = isDownpayment ? (subtotal - downpaymentDue) : 0;
    const currentDue = isDownpayment ? downpaymentDue : subtotal;

    if (cartSubtotalEl) cartSubtotalEl.textContent = window.WeBakeAdmin.formatPHP(subtotal);

    if (cartDownpaymentRowEl) cartDownpaymentRowEl.style.display = isDownpayment ? 'flex' : 'none';
    if (cartDownpaymentValEl) cartDownpaymentValEl.textContent = window.WeBakeAdmin.formatPHP(downpaymentDue);

    if (cartBalanceRowEl) cartBalanceRowEl.style.display = isDownpayment ? 'flex' : 'none';
    if (cartBalanceValEl) cartBalanceValEl.textContent = window.WeBakeAdmin.formatPHP(balanceDue);

    if (cartTotalDueEl) cartTotalDueEl.textContent = window.WeBakeAdmin.formatPHP(currentDue);

    // Update Change Calculator
    updateChange(currentDue);
  }

  function updateChange(dueAmount) {
    if (!changeAmountEl) return;
    const tender = parseFloat(cashInputEl ? cashInputEl.value : 0) || 0;
    const change = Math.max(0, tender - dueAmount);
    changeAmountEl.textContent = window.WeBakeAdmin.formatPHP(change);
  }

  // --- 4. Payment Method & E-Wallet Sync ---
  function setPaymentMethod(method) {
    paymentMethod = method;
    document.querySelectorAll('.pos-pay-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === method);
    });

    const settings = window.WeBakeAdmin.getSettings();

    if (method === 'Cash') {
      if (cashCalculatorEl) cashCalculatorEl.style.display = 'flex';
      if (ewalletBoxEl) ewalletBoxEl.classList.remove('active');
    } else {
      if (cashCalculatorEl) cashCalculatorEl.style.display = 'none';
      if (ewalletBoxEl) ewalletBoxEl.classList.add('active');

      const isGcash = method === 'GCash';
      if (ewalletQrImgEl) ewalletQrImgEl.src = isGcash ? settings.gcashQr : settings.paymayaQr;
      if (ewalletNumberEl) ewalletNumberEl.textContent = isGcash ? settings.gcashNumber : settings.paymayaNumber;
      if (ewalletNameEl) ewalletNameEl.textContent = settings.accountName;
    }
  }

  // --- 5. Complete Sale & Thermal Receipt ---
  function completeWalkInSale() {
    if (cart.length === 0) {
      window.WeBakeAdmin.showToast('Please add items to cart before completing sale.', 'danger');
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const isDownpayment = paymentMode === 'downpayment';
    const downpaymentDue = isDownpayment ? Math.round(subtotal * 0.5) : subtotal;
    const balanceDue = isDownpayment ? (subtotal - downpaymentDue) : 0;
    const currentDue = isDownpayment ? downpaymentDue : subtotal;

    const custName = custNameInput ? custNameInput.value.trim() : '';
    const custPhone = custPhoneInput ? custPhoneInput.value.trim() : '';

    if (orderType === 'advance') {
      if (!custName || !custPhone) {
        window.WeBakeAdmin.showToast('Customer Name and Contact Number are required for Advance Reservations.', 'danger');
        custNameInput?.focus();
        return;
      }
      if (!advanceDateInput?.value) {
        window.WeBakeAdmin.showToast('Please select a pickup date for Advance Reservation.', 'danger');
        advanceDateInput?.focus();
        return;
      }
    }

    // Cash validation
    const tendered = parseFloat(cashInputEl ? cashInputEl.value : 0) || 0;
    if (paymentMethod === 'Cash' && tendered < currentDue) {
      window.WeBakeAdmin.showToast(`Insufficient cash tendered. Total due is ${window.WeBakeAdmin.formatPHP(currentDue)}`, 'danger');
      cashInputEl?.focus();
      return;
    }

    const ewalletRef = ewalletRefInputEl ? ewalletRefInputEl.value.trim() : '';
    if (paymentMethod !== 'Cash' && !ewalletRef) {
      window.WeBakeAdmin.showToast(`Please enter the ${paymentMethod} reference number.`, 'danger');
      ewalletRefInputEl?.focus();
      return;
    }

    const orderId = 'WB-WALK-' + Math.floor(1000 + Math.random() * 9000);
    const dateFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const orderRecord = {
      orderId: orderId,
      date: dateFormatted,
      time: timeFormatted,
      orderType: orderType === 'takeout' ? 'walkin_instant' : 'walkin_advance',
      channel: 'walkin',
      customer: {
        name: custName || 'Walk-In Customer',
        contact: custPhone || '',
        address: 'Walk-In Store Pickup (Marilao)'
      },
      items: [...cart],
      total: subtotal,
      downpayment: downpaymentDue,
      balance: balanceDue,
      paymentMethod: paymentMethod,
      referenceNumber: ewalletRef,
      cashTendered: tendered,
      changeGiven: Math.max(0, tendered - currentDue),
      status: isDownpayment ? 'in_production' : 'completed',
      advancePickupDate: advanceDateInput?.value || '',
      advancePickupTime: advanceTimeInput?.value || ''
    };

    // 1. Post transaction directly to unified backend /api/orders
    if (window.WeBakeAdminAPI) {
      window.WeBakeAdminAPI.post('/orders', {
        order: {
          orderId: orderId,
          channel: 'walkin',
          orderType: orderType === 'takeout' ? 'walkin_instant' : 'walkin_advance',
          customer: {
            name: custName || 'Walk-In Customer',
            contact: custPhone || '',
            address: 'Walk-In Store Counter (Marilao, Bulacan)'
          },
          items: cart.map(i => ({
            id: i.id,
            name: i.name,
            rawName: i.rawName,
            price: i.price,
            qty: i.qty
          })),
          total: subtotal,
          downpayment: downpaymentDue,
          balance: balanceDue,
          paymentMethod: paymentMethod,
          referenceNumber: ewalletRef || 'COUNTER_CASH',
          status: isDownpayment ? 'baking' : 'delivered'
        }
      }).catch(err => console.warn('[POS API Sync Notice]:', err.message));
    }

    // 2. Save local backup for instant thermal receipt rendering
    const allOrders = window.WeBakeAdmin.getOrders();
    allOrders.unshift(orderRecord);
    window.WeBakeAdmin.saveOrders(allOrders);

    // 3. Realtime Inventory Stock Deduction
    deductInventoryStock(cart);

    // 4. Render and Show Thermal Receipt Modal
    renderThermalReceipt(orderRecord);
    if (receiptModal) receiptModal.classList.add('active');

    // 5. Reset Cart
    clearCart();
    if (custNameInput) custNameInput.value = '';
    if (custPhoneInput) custPhoneInput.value = '';
    if (ewalletRefInputEl) ewalletRefInputEl.value = '';

    window.WeBakeAdmin.showToast(`Sale completed successfully! Order ID: ${orderId}`, 'success');
  }

  // --- Real-time Inventory Deduction ---
  function deductInventoryStock(purchasedItems) {
    const inventory = window.WeBakeAdmin.getInventory();
    if (!inventory.stock) inventory.stock = {};

    purchasedItems.forEach(item => {
      const pid = item.id;
      if (!inventory.stock[pid]) {
        inventory.stock[pid] = { morning: 100, carried: 0, spoilage: 0 };
      }
      // Deduct bundles or pieces
      const qtyDeducted = item.unitType === 'bundle' ? item.qty : Math.ceil(item.qty / 25);
      inventory.stock[pid].morning = Math.max(0, (inventory.stock[pid].morning || 0) - qtyDeducted);
    });

    window.WeBakeAdmin.saveInventory(inventory);
  }

  // --- Render Thermal Receipt ---
  function renderThermalReceipt(order) {
    const container = document.getElementById('receipt-print-area');
    if (!container) return;

    const isDownpayment = order.balance > 0;
    const dueAmount = isDownpayment ? order.downpayment : order.total;

    container.innerHTML = `
      <div class="receipt-paper">
        <div class="receipt-header">
          <h3>CRUMBS N' ROLLS</h3>
          <p>WeBake Bakery — Lambakin, Marilao</p>
          <p>Tel: (044) 815-9284 / 0917-123-4567</p>
        </div>

        <hr class="receipt-divider">

        <div class="receipt-meta-row">
          <span>Order ID:</span>
          <strong>${order.orderId}</strong>
        </div>
        <div class="receipt-meta-row">
          <span>Date / Time:</span>
          <span>${order.date} ${order.time}</span>
        </div>
        <div class="receipt-meta-row">
          <span>Type:</span>
          <span>${order.orderType === 'walkin_instant' ? 'Instant Takeout' : 'Advance Reservation'}</span>
        </div>
        <div class="receipt-meta-row">
          <span>Customer:</span>
          <span>${order.customer.name}</span>
        </div>
        ${order.customer.contact ? `
          <div class="receipt-meta-row">
            <span>Contact:</span>
            <span>${order.customer.contact}</span>
          </div>
        ` : ''}
        ${order.advancePickupDate ? `
          <div class="receipt-meta-row">
            <span>Pickup Date:</span>
            <strong>${order.advancePickupDate} ${order.advancePickupTime}</strong>
          </div>
        ` : ''}

        <hr class="receipt-divider">

        <table class="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => `
              <tr>
                <td>${item.rawName || item.name}</td>
                <td class="text-right">${item.qty}</td>
                <td class="text-right">${window.WeBakeAdmin.formatPHP(item.price * item.qty)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <hr class="receipt-divider">

        <div class="receipt-meta-row">
          <span>Total Order Value:</span>
          <strong>${window.WeBakeAdmin.formatPHP(order.total)}</strong>
        </div>

        ${isDownpayment ? `
          <div class="receipt-meta-row">
            <span>50% Downpayment Paid:</span>
            <strong>${window.WeBakeAdmin.formatPHP(order.downpayment)}</strong>
          </div>
          <div class="receipt-meta-row" style="color:#B45309; font-weight:700;">
            <span>Balance Due on Pickup:</span>
            <strong>${window.WeBakeAdmin.formatPHP(order.balance)}</strong>
          </div>
        ` : ''}

        <div class="receipt-meta-row">
          <span>Payment Method:</span>
          <span>${order.paymentMethod}</span>
        </div>

        ${order.paymentMethod === 'Cash' ? `
          <div class="receipt-meta-row">
            <span>Cash Tendered:</span>
            <span>${window.WeBakeAdmin.formatPHP(order.cashTendered)}</span>
          </div>
          <div class="receipt-meta-row">
            <span>Change:</span>
            <strong>${window.WeBakeAdmin.formatPHP(order.changeGiven)}</strong>
          </div>
        ` : `
          <div class="receipt-meta-row">
            <span>Ref #:</span>
            <span>${order.referenceNumber || 'N/A'}</span>
          </div>
        `}

        <hr class="receipt-divider">

        <div class="receipt-footer-msg">
          <p>Thank you for buying at WeBake!</p>
          <p>Salamat po sa pagtangkilik!</p>
        </div>
      </div>
    `;
  }

  // --- Initial Setup & Listeners ---
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial product load
    renderProducts();

    // 2. Search & filter listener
    const searchInput = document.getElementById('pos-search');
    searchInput?.addEventListener('input', (e) => {
      renderProducts('all', e.target.value.trim());
    });

    document.querySelectorAll('.pos-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.pos-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const cat = pill.dataset.category;
        renderProducts(cat, searchInput ? searchInput.value.trim() : '');
      });
    });

    // 3. Order type toggle
    document.querySelectorAll('.pos-type-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pos-type-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        orderType = btn.dataset.type;
        if (advanceDetailsEl) {
          advanceDetailsEl.classList.toggle('active', orderType === 'advance');
        }
      });
    });

    // 4. Downpayment toggle
    downpaymentCheckboxEl?.addEventListener('change', (e) => {
      paymentMode = e.target.checked ? 'downpayment' : 'full';
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      updateTotals(subtotal);
    });

    // 5. Payment method buttons
    document.querySelectorAll('.pos-pay-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setPaymentMethod(btn.dataset.method);
      });
    });

    // 6. Cash tendered input & preset chips
    cashInputEl?.addEventListener('input', () => {
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const isDownpayment = paymentMode === 'downpayment';
      const currentDue = isDownpayment ? Math.round(subtotal * 0.5) : subtotal;
      updateChange(currentDue);
    });

    document.querySelectorAll('.cash-chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const isDownpayment = paymentMode === 'downpayment';
        const currentDue = isDownpayment ? Math.round(subtotal * 0.5) : subtotal;

        const val = chip.dataset.amount;
        if (val === 'exact') {
          if (cashInputEl) cashInputEl.value = currentDue;
        } else {
          if (cashInputEl) cashInputEl.value = parseFloat(val);
        }
        updateChange(currentDue);
      });
    });

    // 7. Clear cart button
    document.getElementById('btn-clear-cart')?.addEventListener('click', clearCart);

    // 8. Complete order button
    btnCompleteOrder?.addEventListener('click', completeWalkInSale);

    // 9. Receipt modal print & close buttons
    document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
      window.print();
    });

    document.getElementById('btn-close-receipt')?.addEventListener('click', () => {
      if (receiptModal) receiptModal.classList.remove('active');
    });

    // 10. Quick link customer modal
    document.getElementById('btn-link-customer')?.addEventListener('click', () => {
      const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      if (users.length === 0) {
        window.WeBakeAdmin.showToast('No customer accounts registered yet.');
        return;
      }
      const u = users[0];
      if (custNameInput) custNameInput.value = u.name;
      if (custPhoneInput) custPhoneInput.value = u.contact || '';
      window.WeBakeAdmin.showToast(`Linked customer: ${u.name}`);
    });

    // 11. Listen for storage sync
    window.addEventListener('weBakeAdminUpdate', () => {
      renderProducts();
    });
  });

})(window, document);
