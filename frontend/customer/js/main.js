/* ==========================================================================
   WeBake — Main Customer Portal Script (main.js)
   Handles navigation, scroll-spy, product catalog, cart sidebar, and
   the 5-step wholesale ordering & checkout flow.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* --------------------------------------------------------------------------
     1. Navigation & Scroll Spy
     -------------------------------------------------------------------------- */
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (navToggle) {
    navToggle.addEventListener('click', e => {
      e.stopPropagation();
      navLinks.classList.toggle('active');
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav')) navLinks.classList.remove('active');
    });
    navLinks?.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navLinks.classList.remove('active'));
    });
  }

  // Active Nav Scroll Spy for Home and About Us
  const aboutSection = document.getElementById('about');
  if (aboutSection && navLinks) {
    const homeLink = Array.from(navLinks.querySelectorAll('a')).find(a =>
      a.getAttribute('href') === 'home.html' || a.getAttribute('href') === '#' || a.textContent.trim().toLowerCase() === 'home'
    );
    const aboutLink = navLinks.querySelector('a[href="#about"]');

    function setActiveNav(target) {
      if (homeLink) homeLink.classList.remove('active');
      if (aboutLink) aboutLink.classList.remove('active');
      if (target) target.classList.add('active');
    }

    if (window.location.hash === '#about') {
      setActiveNav(aboutLink);
    } else {
      setActiveNav(homeLink);
    }

    aboutLink?.addEventListener('click', () => {
      setActiveNav(aboutLink);
    });

    homeLink?.addEventListener('click', (e) => {
      const isHomePage = window.location.pathname.endsWith('home.html') ||
                         window.location.pathname.endsWith('/') ||
                         !window.location.pathname.includes('.html');
      if (isHomePage) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        history.replaceState(null, null, 'home.html');
        setActiveNav(homeLink);
      }
    });

    let isTicking = false;
    window.addEventListener('scroll', () => {
      if (!isTicking) {
        window.requestAnimationFrame(() => {
          const headerH = 75;
          const rect = aboutSection.getBoundingClientRect();
          if (rect.top <= headerH + 120 && rect.bottom >= headerH + 80) {
            setActiveNav(aboutLink);
          } else if (window.scrollY < 300) {
            setActiveNav(homeLink);
          }
          isTicking = false;
        });
        isTicking = true;
      }
    }, { passive: true });

    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#about') setActiveNav(aboutLink);
      else setActiveNav(homeLink);
    });
  }

  // Mobile Auth Buttons inside hamburger menu
  if (navLinks && !navLinks.querySelector('.nav-auth-mobile')) {
    navLinks.insertAdjacentHTML('beforeend',
      '<div class="nav-auth-divider"></div>' +
      '<div class="nav-auth-mobile">' +
        '<a href="#" class="btn btn-outline btn-sm auth-mobile-btn">Sign In</a>' +
        '<a href="#" class="btn btn-primary btn-sm auth-mobile-btn">Register</a>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------------
     2. Global Notifications & Validation Helpers
     -------------------------------------------------------------------------- */
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }
  window.showToast = showToast;

  function validateInput(el, isValid) {
    if (!el) return;
    el.classList.toggle('is-valid', isValid);
    el.classList.toggle('is-invalid', !isValid && (el.value || '').length > 0);
  }
  window.validateInput = validateInput;

  /* --------------------------------------------------------------------------
     3. Product Catalog Data & Modals
     -------------------------------------------------------------------------- */
  const products = [
    { id: 1, name: 'Mamon', desc: 'Soft and fluffy Filipino sponge cake, perfect for merienda or pasalubong. Light, airy, and melt-in-your-mouth delicious.', price: 105, min: 25, img: '' },
    { id: 2, name: 'Otap', desc: 'Crispy, flaky oval-shaped puff pastry with a caramelized sugar coating. A beloved Visayan delicacy enjoyed by all ages.', price: 105, min: 25, img: '' },
    { id: 3, name: 'Eggnog', desc: 'Sweet and crumbly meringue-based cookie, delicately baked to perfection. A classic Filipino bakery staple.', price: 105, min: 25, img: '' },
    { id: 4, name: 'Buttertoast', desc: 'Golden, crunchy butter-toasted bread slices. Perfectly toasted with a rich, buttery flavor ideal for wholesale.', price: 105, min: 25, img: '' }
  ];

  let cart = [];
  let currentProduct = null;
  let checkoutItems = [];
  let customerInfo = {};

  /* --------------------------------------------------------------------------
     4. Store & Session Synchronization Hooks
     -------------------------------------------------------------------------- */
  function mergeCarts(baseCart, incomingCart) {
    const result = (baseCart || []).map(item => ({ ...item }));
    (incomingCart || []).forEach(incoming => {
      if (!incoming) return;
      const incomingId = parseInt(incoming.productId || incoming.id || 0, 10);
      if (!incomingId) return;
      const existing = result.find(c => parseInt(c.productId || c.id || 0, 10) === incomingId);
      if (existing) {
        existing.qty = Math.min(99, (parseInt(existing.qty, 10) || 1) + (parseInt(incoming.qty, 10) || 1));
      } else {
        result.push({ ...incoming });
      }
    });
    return result;
  }

  function syncCartToStore() {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      if (!s) {
        // Guest user: save to guest cart storage
        localStorage.setItem('weBakeGuestCart', JSON.stringify(cart));
        return;
      }

      // Logged-in user: save to user profile in localStorage
      const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const sEmail = (s.email || '').trim().toLowerCase();
      const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);
      if (u) {
        u.savedCart = cart;
        localStorage.setItem('weBakeUsers', JSON.stringify(all));
      }

      // Asynchronously persist cart to Supabase cloud database
      if (sEmail) {
        const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
          window.location.protocol === 'file:' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api'
            : '/api'
        );
        fetch(`${apiBase}/cart/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: sEmail, cart: cart })
        }).catch(err => console.warn('[Cloud Cart Sync Notice]:', err));
      }
    } catch (e) {}
  }

  function loadCartFromStore() {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      if (!s) {
        // Guest user: load from guest cart storage
        const guestData = JSON.parse(localStorage.getItem('weBakeGuestCart') || '[]');
        cart = Array.isArray(guestData) ? guestData : [];
        updateCartUI();
        return;
      }

      const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const sEmail = (s.email || '').trim().toLowerCase();
      const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);

      // Check if there is an unmerged guest cart from before logging in
      let guestCart = [];
      try {
        guestCart = JSON.parse(localStorage.getItem('weBakeGuestCart') || '[]');
      } catch (e) { guestCart = []; }

      if (Array.isArray(guestCart) && guestCart.length > 0) {
        // Transition from guest to logged in: merge guest cart into account cart ONCE
        const saved = (u && Array.isArray(u.savedCart)) ? u.savedCart : [];
        cart = mergeCarts(saved, guestCart);
        if (u) {
          u.savedCart = cart;
          localStorage.setItem('weBakeUsers', JSON.stringify(all));
        }
        localStorage.removeItem('weBakeGuestCart');
        syncCartToStore();
      } else {
        // Normal logged-in load: use the user's saved cart directly (do NOT duplicate quantities)
        cart = (u && Array.isArray(u.savedCart)) ? u.savedCart.map(it => ({ ...it })) : [];
      }

      updateCartUI();

      // Asynchronously fetch latest cart from Supabase cloud database
      if (sEmail) {
        const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
          window.location.protocol === 'file:' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api'
            : '/api'
        );
        fetch(`${apiBase}/cart/sync?email=${encodeURIComponent(sEmail)}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        })
          .then(res => res.json())
          .then(data => {
            if (data && data.success && Array.isArray(data.cart)) {
              if (cart.length === 0) {
                // Local cart was empty: load directly from cloud
                cart = data.cart.map(it => ({ ...it }));
                if (u) {
                  u.savedCart = cart;
                  localStorage.setItem('weBakeUsers', JSON.stringify(all));
                }
                updateCartUI();
              } else {
                // Reconcile: append any cloud items not present locally (do NOT add duplicate quantities!)
                let changed = false;
                data.cart.forEach(cloudItem => {
                  const cId = parseInt(cloudItem.productId || cloudItem.id || 0, 10);
                  if (!cId) return;
                  const localItem = cart.find(c => parseInt(c.productId || c.id || 0, 10) === cId);
                  if (!localItem) {
                    cart.push({ ...cloudItem });
                    changed = true;
                  }
                });
                if (changed) {
                  if (u) {
                    u.savedCart = cart;
                    localStorage.setItem('weBakeUsers', JSON.stringify(all));
                  }
                  updateCartUI();
                  syncCartToStore();
                }
              }
            }
          })
          .catch(err => console.warn('[Cloud Cart Load Notice]:', err));
      }
    } catch (e) {}
  }

  function addOrderToStore(totalAmt, paymentDetails) {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const sEmail = s ? (s.email || '').trim().toLowerCase() : '';
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const downpayment = paymentDetails?.downpayment ?? Math.round(totalAmt * 0.5);
      const balance = paymentDetails?.balance ?? (totalAmt - downpayment);
      const orderId = 'WB-' + Math.floor(10000 + Math.random() * 90000);

      const orderObj = {
        orderId: orderId,
        date: date,
        items: [...checkoutItems],
        total: totalAmt,
        downpayment: downpayment,
        balance: balance,
        paymentMethod: paymentDetails?.method || 'GCash',
        referenceNumber: paymentDetails?.referenceNumber || '',
        customer: { ...customerInfo },
        status: 'pending'
      };

      if (s) {
        const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);
        if (u) {
          u.orderHistory = u.orderHistory || [];
          u.orderHistory.unshift(orderObj);
          localStorage.setItem('weBakeUsers', JSON.stringify(all));
        }
      }

      // Always save in global order tracking registry
      const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
      allOrders.unshift(orderObj);
      localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders));

      return orderObj;
    } catch (e) {
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     5. Product Grid & Product Modal Rendering
     -------------------------------------------------------------------------- */
  const grid = document.getElementById('product-grid');
  if (grid) {
    grid.innerHTML = products.map(p => `
      <div class="product-card" data-id="${p.id}">
        <div class="product-img">${p.img ? `<img src="${p.img}" alt="${p.name}">` : `<i class="fas fa-image"></i><span>No image added</span>`}</div>
        <div class="product-card-info">
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-price">\u20B1${p.price.toLocaleString()} / 1 Bundle <div style="font-size: 0.75rem; color: #666; font-weight: normal; margin-top: 0.2rem;">(Note: 1 bundle = ${p.min} pcs)</div></div>
        </div>
      </div>`).join('');
    grid.addEventListener('click', e => {
      const c = e.target.closest('.product-card');
      if (c) openProduct(+c.dataset.id);
    });
  }

  const modal = document.getElementById('product-modal');
  const modalOv = document.getElementById('modal-overlay');
  const qtyInput = document.getElementById('qty-input');

  function openProduct(id) {
    if (!(currentProduct = products.find(p => p.id === id)) || !modal) return;
    document.getElementById('modal-name').textContent = currentProduct.name;
    document.getElementById('modal-desc').textContent = currentProduct.desc;
    document.getElementById('modal-price').innerHTML = `\u20B1${currentProduct.price.toLocaleString()} per 1 Bundle <br><span style="font-size: 0.85rem; color: #666; font-weight: normal;">(Note: 1 bundle is equivalent to ${currentProduct.min} pcs)</span>`;
    qtyInput.value = 1;
    modal.classList.add('active');
    modalOv.classList.add('active');
  }

  function closeModal() {
    modal?.classList.remove('active');
    modalOv?.classList.remove('active');
    currentProduct = null;
  }

  ['modal-close', 'modal-overlay'].forEach(id => document.getElementById(id)?.addEventListener('click', closeModal));
  document.getElementById('qty-minus')?.addEventListener('click', () => {
    if (!qtyInput) return;
    const cur = parseInt(qtyInput.value, 10) || 1;
    qtyInput.value = Math.max(1, cur - 1);
  });
  document.getElementById('qty-plus')?.addEventListener('click', () => {
    if (!qtyInput) return;
    const cur = parseInt(qtyInput.value, 10) || 1;
    qtyInput.value = Math.min(99, cur + 1);
  });
  qtyInput?.addEventListener('input', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 99) val = 99;
    e.target.value = val;
  });

  /* --------------------------------------------------------------------------
     6. Shopping Cart Management & Sidebar
     -------------------------------------------------------------------------- */
  function updateCartUI() {
    const badge = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (badge) {
      badge.textContent = cart.length;
      badge.style.display = cart.length ? 'flex' : 'none';
    }
    if (!itemsEl) return;
    if (!cart.length) {
      itemsEl.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; color:var(--gray);">
          <i class="fas fa-store" style="font-size:3rem; margin-bottom:1rem; color:var(--primary);"></i>
          <p style="margin-bottom:1.5rem; font-weight:500;">Your cart is empty</p>
          <button class="btn btn-primary btn-sm" id="empty-cart-shop-btn">Start Shopping</button>
        </div>`;
      document.getElementById('empty-cart-shop-btn')?.addEventListener('click', () => {
        toggleCart(false);
        if (grid) window.scrollTo({ top: grid.offsetTop - 100, behavior: 'smooth' });
      });
    } else {
      itemsEl.innerHTML = `
        <div style="font-size: 0.85rem; font-weight: bold; padding-bottom: 0.5rem; border-bottom: 1px solid #eee; margin-bottom: 0.5rem; display: flex; justify-content: space-between; text-align:center;">
          <span style="width: 25px;"><input type="checkbox" id="sidebar-select-all" checked></span>
          <span style="flex: 2; text-align:left;">Product Name</span>
          <span style="flex: 2;">Bundle(pcs)</span>
          <span style="flex: 1; text-align:right;">Price</span>
          <span style="width: 25px;"></span>
        </div>
      ` + cart.map((item, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px dashed #eee; font-size: 0.9rem;">
          <span style="width: 25px;"><input type="checkbox" class="sidebar-item-check" data-i="${i}" data-price="${item.price * item.qty}" checked></span>
          <span style="flex: 2; text-align:left; font-weight: 500;">${item.name}</span>
          <div style="flex: 2; display: flex; flex-direction:column; align-items: center; justify-content: center; gap: 2px;">
            <div style="display:flex; align-items:center; gap: 0.25rem;">
              <button class="cart-qty-btn btn btn-outline" data-i="${i}" data-action="minus" style="padding:0 0.4rem; cursor:pointer; min-width:unset; line-height:1.2;">-</button>
              <span style="font-weight:bold; min-width: 1rem; text-align:center;">${item.qty}</span>
              <button class="cart-qty-btn btn btn-outline" data-i="${i}" data-action="plus" style="padding:0 0.4rem; cursor:pointer; min-width:unset; line-height:1.2;">+</button>
            </div>
            <span style="font-size: 0.7rem; color: #888;">(${item.qty * item.min} pcs)</span>
          </div>
          <span style="flex: 1; text-align:right; color: var(--primary); font-weight:bold;">\u20B1${(item.price * item.qty).toLocaleString()}</span>
          <div style="width: 25px; text-align:right;">
            <button class="cart-item-remove" data-i="${i}" style="background:none; border:none; color: #dc3545; cursor:pointer; padding:0;"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('');

      itemsEl.querySelectorAll('.cart-item-remove').forEach(b => b.addEventListener('click', () => {
        cart.splice(+b.dataset.i, 1);
        updateCartUI();
        syncCartToStore();
      }));

      itemsEl.querySelectorAll('.cart-qty-btn').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        if (!cart[i]) return;
        const currentQty = parseInt(cart[i].qty, 10) || 1;
        cart[i].qty = b.dataset.action === 'minus' ? Math.max(1, currentQty - 1) : Math.min(99, currentQty + 1);
        updateCartUI();
        syncCartToStore();
      }));
    }

    const checks = itemsEl?.querySelectorAll('.sidebar-item-check') || [];
    const selectAll = document.getElementById('sidebar-select-all');

    function updateSidebarTotal() {
      let currentTotal = 0;
      checks.forEach(chk => {
        if (chk.checked) currentTotal += parseFloat(chk.dataset.price);
      });
      if (totalEl) totalEl.textContent = `\u20B1${currentTotal.toLocaleString()}`;
      if (selectAll && checks.length > 0) selectAll.checked = Array.from(checks).every(c => c.checked);
    }

    checks.forEach(chk => chk.addEventListener('change', updateSidebarTotal));
    if (selectAll) {
      selectAll.addEventListener('change', e => {
        checks.forEach(chk => chk.checked = e.target.checked);
        updateSidebarTotal();
      });
    }
    updateSidebarTotal();
  }

  function toggleCart(show) {
    document.getElementById('cart-sidebar')?.classList.toggle('active', show);
    document.getElementById('cart-overlay')?.classList.toggle('active', show);
  }

  // Add to Cart
  document.getElementById('add-to-cart-btn')?.addEventListener('click', () => {
    if (!currentProduct) return;
    const qty = Math.max(1, Math.min(99, parseInt(qtyInput ? qtyInput.value : 1, 10) || 1));
    const targetId = parseInt(currentProduct.id || currentProduct.productId || 0, 10);
    const existing = cart.find(c => parseInt(c.productId || c.id || 0, 10) === targetId);
    if (existing) {
      existing.qty = Math.min(99, (parseInt(existing.qty, 10) || 1) + qty);
    } else {
      cart.push({ ...currentProduct, id: targetId, productId: targetId, qty });
    }
    const name = currentProduct.name;
    closeModal();
    updateCartUI();
    syncCartToStore();
    showToast(`${name} added to cart!`);
  });

  // Buy Now (skip cart directly to checkout)
  document.getElementById('buy-now-btn')?.addEventListener('click', () => {
    if (!currentProduct) return;
    const targetId = parseInt(currentProduct.id || currentProduct.productId || 0, 10);
    const qty = Math.max(1, Math.min(99, parseInt(qtyInput ? qtyInput.value : 1, 10) || 1));
    checkoutItems = [{ ...currentProduct, id: targetId, productId: targetId, qty }];
    closeModal();
    startCheckout();
  });

  // Cart sidebar controls
  document.getElementById('cart-icon')?.addEventListener('click', () => {
    updateCartUI();
    toggleCart(true);
  });

  ['cart-close', 'cart-overlay', 'continue-browsing'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => toggleCart(false));
  });

  document.getElementById('proceed-checkout')?.addEventListener('click', () => {
    if (!cart.length) {
      showToast('Your cart is empty!');
      return;
    }

    const checks = document.querySelectorAll('.sidebar-item-check');
    const selectedIndices = [];
    checks.forEach(chk => {
      if (chk.checked) selectedIndices.push(+chk.dataset.i);
    });

    if (selectedIndices.length === 0) {
      showToast('Please select at least one item to checkout.');
      return;
    }

    checkoutItems = selectedIndices.map(i => cart[i]);
    toggleCart(false);
    startCheckout();
  });

  /* --------------------------------------------------------------------------
     7. Multi-step Checkout Flow (Stock -> Info -> OTP -> Payment -> Success)
     -------------------------------------------------------------------------- */
  function showStep(id) {
    document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
    const step = document.getElementById(id);
    if (step) {
      step.classList.add('active');
      if (id === 'step-success') {
        const successNavBtn = document.getElementById('success-nav-btn');
        let currentSession = null;
        try {
          currentSession = JSON.parse(localStorage.getItem('weBakeSession'));
        } catch (e) {}
        if (successNavBtn) {
          if (currentSession && currentSession.email) {
            successNavBtn.href = 'dashboard.html';
            successNavBtn.innerHTML = '<i class="fas fa-receipt"></i> View in Dashboard';
          } else {
            successNavBtn.href = 'home.html';
            successNavBtn.innerHTML = '<i class="fas fa-home"></i> Back to Home Page';
          }
        }
      }
      setTimeout(() => {
        const firstInput = step.querySelector('input:not([type="hidden"])');
        if (firstInput) firstInput.focus();
      }, 100);
    }
  }

  function closeCheckout() {
    const overlay = document.getElementById('checkout-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');

    // Reset step to step-info
    showStep('step-info');

    // Clear OTP inputs and errors
    document.querySelectorAll('#step-otp .otp-input').forEach(i => i.value = '');
    const otpError = document.getElementById('otp-error');
    if (otpError) {
      otpError.style.display = 'none';
      otpError.textContent = '';
    }

    // Clear payment inputs & errors (Fixes closeCheckout IDs)
    const payError = document.getElementById('payment-error-msg') || document.getElementById('pay-error');
    if (payError) {
      payError.style.display = 'none';
      payError.textContent = '';
    }
    const refInput = document.getElementById('gcash-ref');
    if (refInput) refInput.value = '';
    const proofInput = document.getElementById('gcash-proof') || document.getElementById('pay-proof');
    if (proofInput) proofInput.value = '';

    // Clear validation borders and feedback
    overlay.querySelectorAll('.is-invalid, .is-valid').forEach(el => el.classList.remove('is-invalid', 'is-valid'));
    const emailFeedback = document.getElementById('cust-email-feedback');
    if (emailFeedback) {
      emailFeedback.style.display = '';
      emailFeedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
    }

    const orderIdCard = document.getElementById('success-order-id-card');
    if (orderIdCard) {
      orderIdCard.innerHTML = '';
      orderIdCard.style.display = 'none';
    }

    if (window.WeBakeOTP && typeof window.WeBakeOTP.clearCountdown === 'function') {
      window.WeBakeOTP.clearCountdown();
    }
  }
  window.closeCheckout = closeCheckout;

  // Build centered review breakdown inside payment step
  function buildReviewDetails() {
    const total = checkoutItems.reduce((s, i) => s + i.price * i.qty, 0);
    const downpayment = Math.round(total * 0.5);
    const balance = total - downpayment;

    let html = `<div class="confirmation-details-section"><h4><i class="fas fa-user"></i> Customer Information</h4>`;
    html += `<p><span>Name:</span> ${customerInfo.name || 'N/A'}</p><p><span>Contact:</span> ${customerInfo.contact || 'N/A'}</p>`;
    html += `<p><span>Email:</span> ${customerInfo.email || 'N/A'}</p><p><span>Address:</span> ${customerInfo.address || 'N/A'}</p></div>`;
    html += `<div class="confirmation-details-section"><h4><i class="fas fa-box"></i> Items Ordered</h4>`;
    html += `
      <div style="font-size:0.8rem; font-weight:bold; padding: 4px 0; display:flex; justify-content:space-between; color:#666; border-bottom: 1px solid #ddd; margin-bottom: 4px;">
        <span style="flex:1;">Product Name</span>
        <span style="flex:1; text-align:center;">bundle(pcs)</span>
        <span style="flex:1; text-align:right;">price</span>
      </div>
    `;
    checkoutItems.forEach(i => {
      html += `
        <div style="font-size:0.85rem; padding: 4px 0; display:flex; justify-content:space-between; border-bottom: 1px dashed #eee;">
          <span style="flex:1;">${i.name}</span>
          <span style="flex:1; text-align:center;">${i.qty} bundle(${i.qty * (i.min || 100)} pcs)</span>
          <span style="flex:1; text-align:right;">\u20B1${(i.price * i.qty).toLocaleString()}</span>
        </div>
      `;
    });
    html += `</div>`;

    // 50% Downpayment Breakdown Box
    html += `
      <div class="downpayment-breakdown-box">
        <div class="downpayment-breakdown-row">
          <span>Total Order:</span>
          <span>\u20B1${total.toLocaleString()}</span>
        </div>
        <div class="downpayment-breakdown-row highlight">
          <span><i class="fas fa-coins"></i> 50% Downpayment (Due Now):</span>
          <span>\u20B1${downpayment.toLocaleString()}</span>
        </div>
        <div class="downpayment-breakdown-row balance">
          <span><i class="fas fa-truck"></i> Remaining Balance (Upon Delivery):</span>
          <span>\u20B1${balance.toLocaleString()}</span>
        </div>
      </div>
    `;
    const reviewEl = document.getElementById('review-details');
    if (reviewEl) reviewEl.innerHTML = html;
  }

  function startCheckout() {
    document.getElementById('checkout-overlay')?.classList.add('active');
    showStep('step-stock');

    let session = null;
    try {
      session = JSON.parse(localStorage.getItem('weBakeSession'));
    } catch (err) {}

    let loggedInUser = null;
    if (session && session.email) {
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const sEmail = (session.email || '').trim().toLowerCase();
      loggedInUser = allUsers.find(u => (u.email || '').trim().toLowerCase() === sEmail);
    }

    if (loggedInUser) {
      // CUSTOMER WITH ACCOUNT: Pre-populate customerInfo directly from account
      customerInfo = {
        name: loggedInUser.name || session.name || '',
        contact: (loggedInUser.contact || '').replace(/\D/g, ''),
        email: loggedInUser.email || session.email || '',
        address: loggedInUser.address || ''
      };

      // Also pre-fill form in step-info so they can view/edit if they click "Back"
      const f = (id, v) => {
        const el = document.getElementById(id);
        if (el && v) el.value = v;
      };
      f('cust-name', customerInfo.name);
      f('cust-contact', customerInfo.contact);
      f('cust-email', customerInfo.email);
      f('cust-address', customerInfo.address);

      buildReviewDetails();

      // If address and valid contact are present, directly proceed to step-payment
      if (customerInfo.address && customerInfo.contact && customerInfo.contact.length === 11) {
        setTimeout(() => showStep('step-payment'), 1500);
      } else {
        setTimeout(() => showStep('step-info'), 1500);
      }
    } else {
      // Guest customer -> navigate to step-info
      setTimeout(() => showStep('step-info'), 1500);
    }
  }

  // Real-time Guest Email Validation (Registered / Already Used Detection)
  function validateGuestEmailRealtime(isBlur = false) {
    const custEmailEl = document.getElementById('cust-email');
    const feedback = document.getElementById('cust-email-feedback');
    if (!custEmailEl) return true;

    // Skip guest duplicate check if user is already logged in
    let session = null;
    try { session = JSON.parse(localStorage.getItem('weBakeSession')); } catch (e) {}
    if (session && session.email) return true;

    const rawVal = custEmailEl.value || '';
    const cleanEmail = rawVal.trim().toLowerCase();

    if (!cleanEmail) {
      custEmailEl.classList.remove('is-invalid', 'is-valid');
      if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
      }
      return false;
    }

    const isFullGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(cleanEmail);

    if (isFullGmail) {
      // 1. Check if email already has a registered account
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === cleanEmail);
      if (isRegistered) {
        validateInput(custEmailEl, false);
        if (feedback) {
          if (!feedback.querySelector('#checkout-inline-signin')) {
            feedback.innerHTML = `This Gmail address is already registered. Please <a href="#" data-auth-open="signin-modal" id="checkout-inline-signin" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or use another email.`;
          }
          feedback.style.display = 'block';
        }
        return false;
      }

      // 2. Guest Gmail address can only be used ONCE for an order
      const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
      const hasGuestOrdered = allOrders.some(o => (o.customer?.email || '').trim().toLowerCase() === cleanEmail);
      if (hasGuestOrdered) {
        validateInput(custEmailEl, false);
        if (feedback) {
          if (!feedback.querySelector('#checkout-inline-signin2')) {
            feedback.innerHTML = `This email has already been used for a guest order. Please <a href="#" data-auth-open="signin-modal" id="checkout-inline-signin2" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or create an account to order again.`;
          }
          feedback.style.display = 'block';
        }
        return false;
      }

      // Available valid Gmail
      validateInput(custEmailEl, true);
      if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
      }
      return true;
    } else {
      const afterAt = cleanEmail.includes('@') ? cleanEmail.split('@')[1] : '';
      const isTypingGmail = 'gmail.com'.startsWith(afterAt);
      if (isBlur || (cleanEmail.includes('@') && !isTypingGmail)) {
        validateInput(custEmailEl, false);
        if (feedback) {
          feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
          feedback.style.display = 'block';
        }
        return false;
      } else {
        custEmailEl.classList.remove('is-invalid', 'is-valid');
        if (feedback) feedback.style.display = 'none';
        return false;
      }
    }
  }

  const custEmailInput = document.getElementById('cust-email');
  custEmailInput?.addEventListener('input', () => validateGuestEmailRealtime(false));
  custEmailInput?.addEventListener('blur', () => validateGuestEmailRealtime(true));

  // Universal delegated handler for any inline "sign in" links across all pages
  document.addEventListener('click', (e) => {
    const inlineSignIn = e.target.closest('#checkout-inline-signin, #checkout-inline-signin2, .inline-signin-trigger');
    if (inlineSignIn) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.closeCheckout === 'function') {
        window.closeCheckout();
      }
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('signin-modal');
      } else {
        const signinBtn = document.querySelector('[data-auth-open="signin-modal"]');
        if (signinBtn && signinBtn !== inlineSignIn) {
          signinBtn.click();
        }
      }
    }
  });

  // Prevent mousedown on inline signin links from triggering blur on input fields
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('#checkout-inline-signin, #checkout-inline-signin2, .inline-signin-trigger')) {
      e.preventDefault();
    }
  });

  // Back from Info -> close checkout
  document.getElementById('info-back-btn')?.addEventListener('click', closeCheckout);

  // Info -> OTP (if guest) or Payment (if logged in)
  document.getElementById('info-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const custContactEl = document.getElementById('cust-contact');
    const custEmailEl = document.getElementById('cust-email');

    const cleanContact = (custContactEl?.value || '').trim().replace(/\D/g, '');
    const emailVal = (custEmailEl?.value || '').trim();

    if (!validateGuestEmailRealtime(true)) {
      showToast('Please check your Gmail address.');
      custEmailEl?.focus();
      return;
    }

    if (cleanContact.length !== 11 || !cleanContact.startsWith('09')) {
      showToast('Contact number must be 11 digits starting with 09 (no letters/characters)');
      validateInput(custContactEl, false);
      custContactEl?.focus();
      return;
    }

    customerInfo = {
      name: document.getElementById('cust-name')?.value || '',
      contact: cleanContact,
      email: emailVal,
      address: document.getElementById('cust-address')?.value || ''
    };
    buildReviewDetails();

    let session = null;
    try {
      session = JSON.parse(localStorage.getItem('weBakeSession'));
    } catch (err) {}

    if (!session) {
      // Guest user -> require real OTP verification
      const proceedBtn = document.getElementById('info-proceed-btn');
      const otpInputs = document.querySelectorAll('#step-otp .otp-input');
      const otpError = document.getElementById('otp-error');
      const emailDisplay = document.getElementById('checkout-otp-email-display');
      const timerSpan = document.getElementById('checkout-otp-timer');
      const timerWrap = document.getElementById('checkout-otp-timer-wrap');
      const resendBtn = document.getElementById('checkout-otp-resend-btn');

      otpInputs.forEach(i => i.value = '');
      if (otpError) {
        otpError.style.display = 'none';
        otpError.textContent = '';
      }
      if (emailDisplay) emailDisplay.textContent = customerInfo.email;

      WeBakeOTP.send({
        email: customerInfo.email,
        purpose: 'checkout_verification',
        buttonEl: proceedBtn,
        loadingText: 'Sending code...',
        onSuccess: () => {
          showToast('Verification code sent to ' + customerInfo.email);
          WeBakeOTP.startCountdown({
            timerSpanEl: timerSpan,
            timerWrapEl: timerWrap,
            resendBtnEl: resendBtn,
            duration: 60
          });
          showStep('step-otp');
        },
        onError: (errMsg) => {
          showToast(errMsg);
        }
      });
    } else {
      // Logged in user -> skip OTP directly to payment
      showStep('step-payment');
    }
  });

  // Resend OTP for checkout
  document.getElementById('checkout-otp-resend-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const resendBtn = document.getElementById('checkout-otp-resend-btn');
    const timerSpan = document.getElementById('checkout-otp-timer');
    const timerWrap = document.getElementById('checkout-otp-timer-wrap');
    const otpError = document.getElementById('otp-error');

    WeBakeOTP.send({
      email: customerInfo.email,
      purpose: 'checkout_verification',
      buttonEl: resendBtn,
      errorEl: otpError,
      loadingText: 'Resending...',
      onSuccess: () => {
        showToast('New verification code sent to ' + customerInfo.email);
        WeBakeOTP.startCountdown({
          timerSpanEl: timerSpan,
          timerWrapEl: timerWrap,
          resendBtnEl: resendBtn,
          duration: 60
        });
      },
      onError: (errMsg) => {
        if (otpError) {
          otpError.textContent = errMsg;
          otpError.style.display = 'block';
        }
      }
    });
  });

  // OTP Navigation & Verification
  document.getElementById('otp-back-btn')?.addEventListener('click', () => showStep('step-info'));
  document.getElementById('otp-verify-btn')?.addEventListener('click', () => {
    const entered = Array.from(document.querySelectorAll('#step-otp .otp-input')).map(i => i.value).join('');
    const otpError = document.getElementById('otp-error');
    const verifyBtn = document.getElementById('otp-verify-btn');

    if (entered.length !== 6) {
      if (otpError) {
        otpError.textContent = 'Please enter the complete 6-digit verification code.';
        otpError.style.display = 'block';
      }
      return;
    }

    WeBakeOTP.verify({
      email: customerInfo.email,
      code: entered,
      purpose: 'checkout_verification',
      buttonEl: verifyBtn,
      errorEl: otpError,
      loadingText: 'Verifying...',
      onSuccess: (data) => {
        if (otpError) otpError.style.display = 'none';
        window.checkoutProofToken = data?.proofToken || '';
        showToast('Email verified successfully!');
        showStep('step-payment');
      },
      onError: (errMsg) => {
        if (otpError) {
          otpError.textContent = errMsg;
          otpError.style.display = 'block';
        }
      }
    });
  });

  // Payment -> back to Info
  document.getElementById('payment-back-btn')?.addEventListener('click', () => showStep('step-info'));

  // Payment Method (GCash & Maya) Tabs and QR Logic
  const btnMethodGcash = document.getElementById('btn-method-gcash');
  const btnMethodMaya = document.getElementById('btn-method-maya');
  const paymentMethodInput = document.getElementById('payment-method');
  const paymentQrImg = document.getElementById('payment-qr-img');
  const qrBrandLabel = document.getElementById('qr-brand-label');
  const qrNumDisplay = document.getElementById('qr-num-display');
  const refFieldLabel = document.getElementById('ref-field-label');
  const gcashRefInput = document.getElementById('gcash-ref');
  const copyAccBtn = document.getElementById('copy-acc-btn');
  const copyBtnText = document.getElementById('copy-btn-text');

  function setPaymentMethod(method) {
    if (paymentMethodInput) paymentMethodInput.value = method;
    const refFeedback = document.getElementById('ref-invalid-feedback');
    if (method === 'GCash') {
      btnMethodGcash?.classList.add('active-gcash');
      btnMethodMaya?.classList.remove('active-maya');
      if (paymentQrImg) { paymentQrImg.src = '../img/gcash-qr.svg'; paymentQrImg.alt = 'GCash QR Code'; }
      if (qrBrandLabel) qrBrandLabel.textContent = 'GCash';
      if (qrNumDisplay) qrNumDisplay.textContent = '0912 221 7577';
      if (refFieldLabel) refFieldLabel.textContent = 'GCash';
      if (gcashRefInput) {
        gcashRefInput.maxLength = 13;
        gcashRefInput.placeholder = 'e.g. 1000123456789 (13 digits)';
        gcashRefInput.value = gcashRefInput.value.replace(/\D/g, '').slice(0, 13);
      }
      if (refFeedback) {
        refFeedback.textContent = 'Please enter a valid 13-digit GCash reference number (numbers only).';
      }
    } else {
      btnMethodMaya?.classList.add('active-maya');
      btnMethodGcash?.classList.remove('active-gcash');
      if (paymentQrImg) { paymentQrImg.src = '../img/paymaya-qr.svg'; paymentQrImg.alt = 'Maya QR Code'; }
      if (qrBrandLabel) qrBrandLabel.textContent = 'Maya';
      if (qrNumDisplay) qrNumDisplay.textContent = '0912 221 7577';
      if (refFieldLabel) refFieldLabel.textContent = 'PayMaya / Maya';
      if (gcashRefInput) {
        gcashRefInput.maxLength = 17;
        gcashRefInput.placeholder = 'e.g. 10001234567890123 (max 17 digits)';
        gcashRefInput.value = gcashRefInput.value.replace(/\D/g, '').slice(0, 17);
      }
      if (refFeedback) {
        refFeedback.textContent = 'Please enter a valid PayMaya reference number (up to 17 digits, numbers only).';
      }
    }

    if (gcashRefInput && gcashRefInput.value) {
      const val = gcashRefInput.value;
      const valid = method === 'GCash' ? (val.length === 13) : (val.length > 0 && val.length <= 17);
      validateInput(gcashRefInput, valid);
    }
  }

  btnMethodGcash?.addEventListener('click', () => setPaymentMethod('GCash'));
  btnMethodMaya?.addEventListener('click', () => setPaymentMethod('PayMaya'));

  // Quick Copy Account Number
  copyAccBtn?.addEventListener('click', () => {
    const numToCopy = '09122217577';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(numToCopy).then(() => {
        if (copyBtnText) copyBtnText.textContent = 'Copied!';
        copyAccBtn.classList.add('copied');
        showToast('Payment account number copied: ' + numToCopy);
        setTimeout(() => {
          if (copyBtnText) copyBtnText.textContent = 'Copy';
          copyAccBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        showToast('Payment number: ' + numToCopy);
      });
    } else {
      showToast('Payment number: ' + numToCopy);
    }
  });

  // Payment Confirmation & Order Finalization
  document.getElementById('pay-btn')?.addEventListener('click', async () => {
    const method = paymentMethodInput?.value || 'GCash';
    const errBox = document.getElementById('payment-error-msg');
    if (errBox) errBox.style.display = 'none';

    const ref = document.getElementById('gcash-ref');
    const proof = document.getElementById('gcash-proof');
    const refVal = ref ? ref.value.trim().replace(/\D/g, '') : '';

    if (!refVal) {
      if (errBox) {
        errBox.textContent = `Please enter your ${method} reference number (numbers only).`;
        errBox.style.display = 'block';
      }
      validateInput(ref, false);
      ref?.focus();
      return;
    }

    if (method === 'GCash' && refVal.length !== 13) {
      if (errBox) {
        errBox.textContent = 'GCash reference number must be 13 digits (no letters or characters).';
        errBox.style.display = 'block';
      }
      validateInput(ref, false);
      ref?.focus();
      return;
    }

    if (method === 'PayMaya' && (refVal.length === 0 || refVal.length > 17)) {
      if (errBox) {
        errBox.textContent = 'PayMaya reference number must be up to 17 digits (no letters or characters).';
        errBox.style.display = 'block';
      }
      validateInput(ref, false);
      ref?.focus();
      return;
    }

    if (ref) ref.value = refVal;
    validateInput(ref, true);

    if (!proof || !proof.files.length) {
      if (errBox) {
        errBox.textContent = `Please upload the screenshot proof of your 50% downpayment transfer.`;
        errBox.style.display = 'block';
      }
      return;
    }

    const totalAmt = checkoutItems.reduce((s, i) => s + i.price * i.qty, 0);
    const downpayment = Math.round(totalAmt * 0.5);
    const balance = totalAmt - downpayment;

    const btn = document.getElementById('pay-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Downpayment...';
    btn.disabled = true;

    // Generate or maintain idempotency key across retries
    if (!window.currentCheckoutIdempotencyKey) {
      window.currentCheckoutIdempotencyKey = 'wb_chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }

    const apiBase = window.WEBAKE_API_BASE || (
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000/api'
        : '/api'
    );

    const payload = {
      items: checkoutItems.map(item => ({
        productId: item.id,
        qty: item.qty
      })),
      customer: {
        fullName: customerInfo.name,
        email: customerInfo.email,
        phone: customerInfo.contact,
        address: customerInfo.address,
        deliveryDate: customerInfo.deliveryDate || new Date().toISOString().slice(0, 10),
        deliveryTime: customerInfo.deliveryTime || '09:00 AM - 12:00 PM',
        notes: customerInfo.notes || ''
      },
      paymentMethod: method,
      referenceNumber: refVal,
      proofToken: window.checkoutProofToken || '',
      idempotencyKey: window.currentCheckoutIdempotencyKey
    };

    try {
      const response = await fetch(`${apiBase}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': window.currentCheckoutIdempotencyKey
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        // ON FAILURE: Show error, re-enable button, keep cart intact! (Fixes C5, M11)
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm 50% Payment';
        const errorMsg = result.message || 'Unable to place order. Please try again.';
        if (errBox) {
          errBox.textContent = errorMsg;
          errBox.style.display = 'block';
        }
        showToast(errorMsg);
        return;
      }

      // ON SUCCESS: Use the SERVER's authoritative order code and totals (Fixes C5)
      const orderId = result.orderId;
      const subtotal = result.subtotal || checkoutItems.reduce((s, i) => s + i.price * i.qty, 0);
      const deliveryFee = 0;
      const totalAmt = result.grandTotal || subtotal;
      const downpayment = result.downpaymentRequired || Math.round(totalAmt * 0.5);
      const balance = result.balanceDue || (totalAmt - downpayment);

      const placedOrder = {
        orderId: orderId,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        items: [...checkoutItems],
        subtotal: subtotal,
        total: totalAmt,
        downpayment: downpayment,
        balance: balance,
        paymentMethod: method,
        referenceNumber: refVal,
        status: 'pending',
        customer: {
          name: customerInfo.name,
          email: customerInfo.email,
          contact: customerInfo.contact,
          address: customerInfo.address
        }
      };

      try {
        const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
        if (!allOrders.some(o => o.orderId === orderId)) {
          allOrders.unshift(placedOrder);
          localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders));
        }

        let currentSession = null;
        try {
          currentSession = JSON.parse(localStorage.getItem('weBakeSession'));
        } catch (e) {}

        if (currentSession && currentSession.email) {
          const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
          const userIdx = users.findIndex(u => (u.email || '').toLowerCase() === currentSession.email.toLowerCase());
          if (userIdx !== -1) {
            users[userIdx].orderHistory = users[userIdx].orderHistory || [];
            if (!users[userIdx].orderHistory.some(o => o.orderId === orderId)) {
              users[userIdx].orderHistory.unshift(placedOrder);
              localStorage.setItem('weBakeUsers', JSON.stringify(users));
            }
          }
        }
      } catch (storageErr) {
        console.warn('[LocalStorage Sync Notice]:', storageErr);
      }

      // Populate Order ID Card (Guests only - removed for customers with account who track via dashboard)
      let currentSession = null;
      try {
        currentSession = JSON.parse(localStorage.getItem('weBakeSession'));
      } catch (e) {}

      const orderIdCard = document.getElementById('success-order-id-card');
      if (orderIdCard) {
        if (currentSession && currentSession.email) {
          orderIdCard.innerHTML = '';
          orderIdCard.style.display = 'none';
        } else {
          orderIdCard.style.display = 'block';
          orderIdCard.innerHTML = `
            <div class="order-id-badge-box">
              <div>
                <span class="oid-label">Your Order Tracking ID</span>
                <span class="oid-val">${orderId}</span>
              </div>
              <div style="display:flex; gap:0.5rem; align-items:center;">
                <button type="button" class="btn-copy-num" id="copy-order-id-btn">
                  <i class="far fa-copy"></i> <span id="copy-order-id-text">Copy ID</span>
                </button>
                <button type="button" class="btn btn-outline btn-sm" id="quick-track-btn" style="padding:0.35rem 0.75rem; font-size:0.75rem;">
                  <i class="fas fa-search"></i> Track / Refund
                </button>
              </div>
            </div>
          `;

          document.getElementById('copy-order-id-btn')?.addEventListener('click', () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(orderId).then(() => {
                const txt = document.getElementById('copy-order-id-text');
                if (txt) txt.textContent = 'Copied!';
                showToast('Order ID copied: ' + orderId);
                setTimeout(() => { if (txt) txt.textContent = 'Copy ID'; }, 2000);
              });
            } else {
              showToast('Order ID: ' + orderId);
            }
          });

          document.getElementById('quick-track-btn')?.addEventListener('click', () => {
            if (window.openTrackOrderModal) {
              window.openTrackOrderModal(orderId, customerInfo.email || customerInfo.contact || '');
            }
          });
        }
      }

      // Populate success breakdown
      const successSummary = document.getElementById('success-downpayment-summary');
      if (successSummary) {
        successSummary.innerHTML = `
          <div class="downpayment-breakdown-box" style="text-align:left;">
            <div class="downpayment-breakdown-row">
              <span>Total Order Value:</span>
              <strong>\u20B1${totalAmt.toLocaleString()}</strong>
            </div>
            <div class="downpayment-breakdown-row highlight" style="color:var(--success); border-color:#d4edda; background:#e8f5e9; border-radius:6px; padding:0.6rem 0.85rem;">
              <span><i class="fas fa-check-circle"></i> 50% Downpayment Paid (${method}):</span>
              <strong>\u20B1${downpayment.toLocaleString()}</strong>
            </div>
            <div class="downpayment-breakdown-row" style="font-size:0.8rem; color:#666;">
              <span>Reference Number:</span>
              <span>${refVal}</span>
            </div>
            <div class="downpayment-breakdown-row balance" style="margin-top:0.4rem; padding-top:0.4rem; border-top:1px dashed #ebd9c8;">
              <span><i class="fas fa-truck"></i> Remaining Balance Upon Delivery:</span>
              <strong style="font-size:1.05rem; color:var(--primary);">\u20B1${balance.toLocaleString()}</strong>
            </div>
          </div>
          <div style="background:#e8f4fd; color:#0c5460; padding:0.75rem 1rem; border-radius:8px; font-size:0.83rem; text-align:left; border:1px solid #bee5eb; margin-top:0.65rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
              <i class="fas fa-paper-plane" style="color:#17a2b8; font-size:1rem;"></i>
              <span>A digital receipt has been sent to <strong>${customerInfo.email}</strong>.</span>
            </div>
            <div style="font-size:0.78rem; color:#6c757d; line-height:1.45;">
              \uD83D\uDCEC <em>Can't find it in your Inbox? Please check your <strong>Spam</strong>, <strong>Junk</strong>, or <strong>Promotions</strong> folder and mark as "Not Spam".</em>
            </div>
          </div>
          <div style="background:#fff3cd; color:#856404; padding:0.75rem 1rem; border-radius:var(--radius); font-size:0.82rem; text-align:left; border:1px solid #ffeeba; margin-top:0.6rem;">
            <i class="fas fa-info-circle"></i> <strong>Reminder:</strong> Please prepare <strong>\u20B1${balance.toLocaleString()}</strong> upon delivery. You may pay in cash to the delivery rider or scan their ${method} QR upon handover.
          </div>
        `;
      }

      // Guest Convert to Account handler
      const guestConvertBox = document.getElementById('success-guest-convert-box');
      if (!currentSession && guestConvertBox) {
        guestConvertBox.innerHTML = `
          <div class="guest-convert-box" id="guest-account-prompt-card">
            <div class="guest-convert-header">
              <i class="fas fa-user-plus"></i>
              <div>
                <h4>Would you like to create an account?</h4>
                <p>Save your order details for <strong>${customerInfo.email}</strong> to easily track your delivery, view receipts, and request refunds in your personal dashboard anytime!</p>
              </div>
            </div>
            <div id="guest-ask-step" style="margin-top:0.85rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-ask-yes-pwd" style="padding:0.6rem 1.25rem; font-size:0.88rem;">
                <i class="fas fa-key"></i> Yes, Create Account
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-ask-no-pwd" style="padding:0.6rem 1rem; font-size:0.88rem; color:#666; border-color:#ccc;">
                <i class="fas fa-times"></i> No, Thanks
              </button>
            </div>
            <div id="guest-declined-msg" style="display:none; margin-top:0.75rem; font-size:0.84rem; color:var(--gray); background:#f8f9fa; padding:0.6rem 0.85rem; border-radius:6px; border:1px solid #e9ecef;">
              <i class="fas fa-info-circle" style="color:var(--primary);"></i> You can track this order anytime with your Order ID (<strong>${orderId}</strong>) via <strong>Track Order</strong>.
            </div>
          </div>
        `;
        guestConvertBox.style.display = 'block';

        const askStep = document.getElementById('guest-ask-step');
        const declinedMsg = document.getElementById('guest-declined-msg');
        const btnAskYes = document.getElementById('btn-ask-yes-pwd');
        const btnAskNo = document.getElementById('btn-ask-no-pwd');

        btnAskYes?.addEventListener('click', () => {
          if (window.openAuthModal) {
            closeCheckout();
            window.openAuthModal('signup-modal');
            const regEmailInput = document.getElementById('reg-email');
            const regNameInput = document.getElementById('reg-fullname');
            const regContactInput = document.getElementById('reg-contact');
            if (regEmailInput) regEmailInput.value = customerInfo.email;
            if (regNameInput) regNameInput.value = customerInfo.name;
            if (regContactInput) regContactInput.value = customerInfo.contact;
          }
        });

        btnAskNo?.addEventListener('click', () => {
          if (askStep) askStep.style.display = 'none';
          if (declinedMsg) declinedMsg.style.display = 'block';
        });
      } else if (guestConvertBox) {
        guestConvertBox.style.display = 'none';
        guestConvertBox.innerHTML = '';
      }

      // ONLY remove checked-out items from cart after confirmed server success!
      checkoutItems.forEach(item => {
        cart = cart.filter(c => c.id !== item.id);
      });

      // Reset idempotency key & proof token for next checkout
      window.currentCheckoutIdempotencyKey = null;
      window.checkoutProofToken = null;

      updateCartUI();
      syncCartToStore();
      showStep('step-success');
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm 50% Payment';
      btn.disabled = false;

    } catch (networkErr) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm 50% Payment';
      const netMsg = 'Cannot connect to order server. Please check your internet connection and try again.';
      if (errBox) {
        errBox.textContent = netMsg;
        errBox.style.display = 'block';
      }
      showToast(netMsg);
    }
  });

  // Order Again reset
  document.getElementById('order-again-btn')?.addEventListener('click', () => {
    closeCheckout();
    document.getElementById('info-form')?.reset();
    const gcashRef = document.getElementById('gcash-ref');
    const gcashProof = document.getElementById('gcash-proof');
    if (gcashRef) gcashRef.value = '';
    if (gcashProof) gcashProof.value = '';
    const errBox = document.getElementById('payment-error-msg');
    if (errBox) errBox.style.display = 'none';
    const orderIdCard = document.getElementById('success-order-id-card');
    if (orderIdCard) orderIdCard.innerHTML = '';
    const guestConvertBox = document.getElementById('success-guest-convert-box');
    if (guestConvertBox) {
      guestConvertBox.style.display = 'none';
      guestConvertBox.innerHTML = '';
    }
    setPaymentMethod('GCash');
    checkoutItems = [];
    customerInfo = {};
  });

  /* --------------------------------------------------------------------------
     8. Input Formatting & Live Validations (Checkout Form)
     -------------------------------------------------------------------------- */
  document.getElementById('cust-contact')?.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
    const valid = e.target.value.length === 11 && e.target.value.startsWith('09');
    validateInput(e.target, valid);
  });

  document.getElementById('cust-email')?.addEventListener('input', e => {
    const val = e.target.value.trim();
    const valid = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(val);
    validateInput(e.target, valid);
  });

  document.getElementById('gcash-ref')?.addEventListener('input', e => {
    const method = paymentMethodInput?.value || 'GCash';
    const maxLen = method === 'GCash' ? 13 : 17;
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, maxLen);
    const val = e.target.value;
    const isValid = method === 'GCash' ? (val.length === 13) : (val.length > 0 && val.length <= 17);
    validateInput(e.target, isValid);
  });

  /* --------------------------------------------------------------------------
     9. Initialization & Dashboard Auto-Checkout Hook
     -------------------------------------------------------------------------- */
  loadCartFromStore();
  updateCartUI();

  // Re-synchronize cloud cart whenever authentication state changes
  window.addEventListener('weBakeAuthChange', () => {
    const s = JSON.parse(localStorage.getItem('weBakeSession'));
    if (!s) {
      // User signed out: clear in-memory cart and guest cart
      cart = [];
      localStorage.removeItem('weBakeGuestCart');
      updateCartUI();
    } else {
      // User signed in: load user cart (and merge any guest items)
      loadCartFromStore();
    }
  });

  // Auto-checkout from Dashboard URL query parameters (?checkout=true&items=0,1)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkout') === 'true' && cart.length > 0) {
    const itemsParam = urlParams.get('items');
    if (itemsParam) {
      const indices = itemsParam.split(',').map(n => parseInt(n));
      checkoutItems = indices.map(i => cart[i]).filter(item => item !== undefined);
    } else {
      checkoutItems = [...cart];
    }

    if (checkoutItems.length > 0) {
      startCheckout();
    }
  }
});