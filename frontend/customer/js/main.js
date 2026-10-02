/* ==============================================
   WeBake — Main JavaScript (main.js)
   All interactivity: nav, products, cart, checkout
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* --- NAV TOGGLE --- */
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (navToggle) {
    navToggle.addEventListener('click', e => { e.stopPropagation(); navLinks.classList.toggle('active'); });
    document.addEventListener('click', e => { if (!e.target.closest('.nav')) navLinks.classList.remove('active'); });
    navLinks?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('active')));
  }

  /* --- HOME & ABOUT US ACTIVE NAV SCROLL SPY --- */
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

    // Check initial hash on page load
    if (window.location.hash === '#about') {
      setActiveNav(aboutLink);
    } else {
      setActiveNav(homeLink);
    }

    // Click on About Us link
    aboutLink?.addEventListener('click', () => {
      setActiveNav(aboutLink);
    });

    // Click on Home link
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

    // Real-time Scroll Spy
    let isTicking = false;
    window.addEventListener('scroll', () => {
      if (!isTicking) {
        window.requestAnimationFrame(() => {
          const headerH = 75;
          const rect = aboutSection.getBoundingClientRect();
          // Active when aboutSection enters view near header
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

  /* --- MOBILE AUTH BUTTONS (inside hamburger dropdown) --- */
  if (navLinks && !navLinks.querySelector('.nav-auth-mobile')) {
    navLinks.insertAdjacentHTML('beforeend',
      '<div class="nav-auth-divider"></div>' +
      '<div class="nav-auth-mobile">' +
        '<a href="#" class="btn btn-outline btn-sm auth-mobile-btn">Sign In</a>' +
        '<a href="#" class="btn btn-primary btn-sm auth-mobile-btn">Register</a>' +
      '</div>'
    );
  }

  /* --- TOAST --- */
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  /* --- PRODUCT DATA --- */
  const products = [
    { id: 1, name: 'Mamon', desc: 'Soft and fluffy Filipino sponge cake, perfect for merienda or pasalubong. Light, airy, and melt-in-your-mouth delicious.', price: 105, min: 25, img: '' },
    { id: 2, name: 'Otap', desc: 'Crispy, flaky oval-shaped puff pastry with a caramelized sugar coating. A beloved Visayan delicacy enjoyed by all ages.', price: 105, min: 25, img: '' },
    { id: 3, name: 'Eggnog', desc: 'Sweet and crumbly meringue-based cookie, delicately baked to perfection. A classic Filipino bakery staple.', price: 105, min: 25, img: '' },
    { id: 4, name: 'Buttertoast', desc: 'Golden, crunchy butter-toasted bread slices. Perfectly toasted with a rich, buttery flavor ideal for wholesale.', price: 105, min: 25, img: '' }
  ];
  let cart = [], currentProduct = null, checkoutItems = [], customerInfo = {};
  /* --- HOOKS FOR DASHBOARD --- */
  function syncCartToStore() {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession')); if (!s) return;
      const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const sEmail = (s.email || '').trim().toLowerCase();
      const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);
      if (u) { u.savedCart = cart; localStorage.setItem('weBakeUsers', JSON.stringify(all)); }
    } catch(e){}
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
    } catch(e){
      return null;
    }
  }
  function loadCartFromStore() {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession')); if (!s) return;
      const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const sEmail = (s.email || '').trim().toLowerCase();
      const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);
      if (u && u.savedCart) { cart = u.savedCart; }
    } catch(e){}
  }


  /* --- RENDER PRODUCT GRID --- */
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
    grid.addEventListener('click', e => { const c = e.target.closest('.product-card'); if (c) openProduct(+c.dataset.id); });
  }

  /* --- PRODUCT MODAL --- */
  const modal = document.getElementById('product-modal');
  const modalOv = document.getElementById('modal-overlay');
  const qtyInput = document.getElementById('qty-input');

  function openProduct(id) {
    if (!(currentProduct = products.find(p => p.id === id)) || !modal) return;
    document.getElementById('modal-name').textContent = currentProduct.name;
    document.getElementById('modal-desc').textContent = currentProduct.desc;
    document.getElementById('modal-price').innerHTML = `\u20B1${currentProduct.price.toLocaleString()} per 1 Bundle <br><span style="font-size: 0.85rem; color: #666; font-weight: normal;">(Note: 1 bundle is equivalent to ${currentProduct.min} pcs)</span>`;
    qtyInput.value = 1;
    modal.classList.add('active'); modalOv.classList.add('active');
  }
  function closeModal() {
    modal?.classList.remove('active');
    modalOv?.classList.remove('active');
    currentProduct = null;
  }
  ['modal-close', 'modal-overlay'].forEach(id => document.getElementById(id)?.addEventListener('click', closeModal));
  document.getElementById('qty-minus')?.addEventListener('click', () => { qtyInput.value = Math.max(1, +qtyInput.value - 1); });
  document.getElementById('qty-plus')?.addEventListener('click', () => { qtyInput.value = +qtyInput.value + 1; });

  /* --- CART --- */
  function updateCartUI() {
    const badge = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (badge) { badge.textContent = cart.length; badge.style.display = cart.length ? 'flex' : 'none'; }
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
      itemsEl.querySelectorAll('.cart-item-remove').forEach(b => b.addEventListener('click', () => { cart.splice(+b.dataset.i, 1); updateCartUI(); syncCartToStore(); }));
      itemsEl.querySelectorAll('.cart-qty-btn').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        cart[i].qty = b.dataset.action === 'minus' ? Math.max(1, cart[i].qty - 1) : cart[i].qty + 1;
        updateCartUI();
        syncCartToStore();
      }));
    }

    const checks = itemsEl?.querySelectorAll('.sidebar-item-check') || [];
    const selectAll = document.getElementById('sidebar-select-all');
    function updateSidebarTotal() {
      let currentTotal = 0;
      checks.forEach(chk => { if(chk.checked) currentTotal += parseFloat(chk.dataset.price); });
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

  /* Add to Cart — toast only, cart does NOT auto-open */
  document.getElementById('add-to-cart-btn')?.addEventListener('click', () => {
    if (!currentProduct) return;
    const qty = +qtyInput.value, existing = cart.find(c => c.id === currentProduct.id);
    if (existing) existing.qty += qty; else cart.push({ ...currentProduct, qty });
    const name = currentProduct.name;
    closeModal(); updateCartUI(); syncCartToStore(); showToast(`${name} added to cart!`);
  });

  /* Buy Now (skip cart) */
  document.getElementById('buy-now-btn')?.addEventListener('click', () => {
    if (!currentProduct) return;
    checkoutItems = [{ ...currentProduct, qty: +qtyInput.value }];
    closeModal(); startCheckout();
  });

  /* Cart sidebar controls */
  document.getElementById('cart-icon')?.addEventListener('click', () => { updateCartUI(); toggleCart(true); });
  ['cart-close', 'cart-overlay', 'continue-browsing'].forEach(id => document.getElementById(id)?.addEventListener('click', () => toggleCart(false)));
  document.getElementById('proceed-checkout')?.addEventListener('click', () => {
    if (!cart.length) { showToast('Your cart is empty!'); return; }
    
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

  /* --- CHECKOUT FLOW: Stock → Info → Review → Payment → Success --- */
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
        } catch(e) {}
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
    if (otpError) { otpError.style.display = 'none'; otpError.textContent = ''; }

    // Clear payment inputs & errors
    const payError = document.getElementById('pay-error');
    if (payError) { payError.style.display = 'none'; payError.textContent = ''; }
    const refInput = document.getElementById('gcash-ref');
    if (refInput) refInput.value = '';
    const proofInput = document.getElementById('pay-proof');
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

  /* Build centered review details inside payment step */
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
    } catch(err) {}

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
      const f = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      f('cust-name', customerInfo.name);
      f('cust-contact', customerInfo.contact);
      f('cust-email', customerInfo.email);
      f('cust-address', customerInfo.address);

      buildReviewDetails();

      // If address and valid contact are present, DIRECTLY navigate to step-payment so no time is wasted!
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

  /* Real-time Guest Email Validation (Registered / Already Used Detection) */
  function validateGuestEmailRealtime(isBlur = false) {
    const custEmailEl = document.getElementById('cust-email');
    const feedback = document.getElementById('cust-email-feedback');
    if (!custEmailEl) return true;

    // Skip guest duplicate check if user is already logged in
    let session = null;
    try { session = JSON.parse(localStorage.getItem('weBakeSession')); } catch(e){}
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
      // 1. Check if email already has a registered account (Item 1)
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

      // 2. REQUIREMENT: Guest Gmail address can only be used ONCE for an order
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
    const inlineSignIn = e.target.closest('#checkout-inline-signin, #checkout-inline-signin2, #partner-inline-signin-link, #partner-inline-signin-link2, .inline-signin-trigger');
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
    if (e.target.closest('#checkout-inline-signin, #checkout-inline-signin2, #partner-inline-signin-link, #partner-inline-signin-link2, .inline-signin-trigger')) {
      e.preventDefault();
    }
  });

  /* Back from Info → close checkout */
  document.getElementById('info-back-btn')?.addEventListener('click', closeCheckout);

  /* Info → OTP (if guest) or Payment (if logged in) */
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
    } catch(err) {}

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
      // Logged in user -> skip OTP
      showStep('step-payment');
    }
  });

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

  /* OTP Handlers */
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
      onSuccess: () => {
        if (otpError) otpError.style.display = 'none';
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

  /* Payment → back to Info */
  document.getElementById('payment-back-btn')?.addEventListener('click', () => showStep('step-info'));

  /* Payment Method (GCash & Maya) Tabs and QR Logic */
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

  /* Quick Copy Account Number */
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

  /* Payment → Success */
  document.getElementById('pay-btn')?.addEventListener('click', () => {
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

    setTimeout(() => {
      const placedOrder = addOrderToStore(totalAmt, {
        method: method,
        referenceNumber: ref.value.trim(),
        downpayment: downpayment,
        balance: balance
      });
      const orderId = placedOrder?.orderId || ('WB-' + Math.floor(10000 + Math.random() * 90000));
      
      let currentSession = null;
      try { currentSession = JSON.parse(localStorage.getItem('weBakeSession')); } catch(e){}

      // Populate Order ID Card (Guests only - removed for customers with account who track via dashboard)
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
              <span>${ref.value.trim()}</span>
            </div>
            <div class="downpayment-breakdown-row balance" style="margin-top:0.4rem; padding-top:0.4rem; border-top:1px dashed #ebd9c8;">
              <span><i class="fas fa-truck"></i> Remaining Balance Upon Delivery:</span>
              <strong style="font-size:1.05rem; color:var(--primary);">\u20B1${balance.toLocaleString()}</strong>
            </div>
          </div>
          <div style="background:#fff3cd; color:#856404; padding:0.75rem 1rem; border-radius:var(--radius); font-size:0.82rem; text-align:left; border:1px solid #ffeeba;">
            <i class="fas fa-info-circle"></i> <strong>Reminder:</strong> Please prepare <strong>\u20B1${balance.toLocaleString()}</strong> upon delivery. You may pay in cash to the delivery rider or scan their ${method} QR upon handover.
          </div>
        `;
      }

      // 1-Click Convert to Account for Guests
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

            <!-- Ask First Choice -->
            <div id="guest-ask-step" style="margin-top:0.85rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-ask-yes-pwd" style="padding:0.6rem 1.25rem; font-size:0.88rem;">
                <i class="fas fa-key"></i> Yes, Create Password
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-ask-no-pwd" style="padding:0.6rem 1rem; font-size:0.88rem; color:#666; border-color:#ccc;">
                <i class="fas fa-times"></i> No, Thanks
              </button>
            </div>

            <!-- Create Password Form (Initially Hidden) -->
            <form id="guest-convert-form" style="display:none; margin-top:1rem; border-top:1px dashed #d4a96a; padding-top:0.85rem;">
              <div style="font-size:0.85rem; font-weight:600; color:var(--primary); margin-bottom:0.75rem;">
                <i class="fas fa-shield-alt"></i> Set a password to save your account:
              </div>
              <div class="guest-convert-fields">
                <div class="form-group" style="margin-bottom:0.5rem; text-align:left;">
                  <label style="font-size:0.8rem; font-weight:600; display:flex; align-items:center; gap:0.35rem; margin-bottom:0.25rem;">
                    <i class="fas fa-lock" style="color:var(--primary); font-size:0.85rem;"></i> Create Password *
                  </label>
                  <div class="auth-icon-input">
                    <i class="fas fa-lock"></i>
                    <input type="password" class="form-input" id="guest-convert-pwd" placeholder="Enter password (min 6 chars)" minlength="6" required style="font-size:0.85rem;">
                    <button type="button" class="auth-eye-toggle" aria-label="Toggle password visibility"><i class="fas fa-eye"></i></button>
                  </div>
                  <div class="pwd-strength" style="display:none;">
                    <div class="pwd-strength-bar"></div>
                  </div>
                  <div class="pwd-strength-text" style="display:none;"></div>
                </div>

                <div class="form-group" style="margin-bottom:0.25rem; text-align:left;">
                  <label style="font-size:0.8rem; font-weight:600; display:flex; align-items:center; gap:0.35rem; margin-bottom:0.25rem;">
                    <i class="fas fa-shield-alt" style="color:var(--primary); font-size:0.85rem;"></i> Confirm Password *
                  </label>
                  <div class="auth-icon-input">
                    <i class="fas fa-lock"></i>
                    <input type="password" class="form-input" id="guest-convert-cpwd" placeholder="Confirm your password" minlength="6" required style="font-size:0.85rem;">
                    <button type="button" class="auth-eye-toggle" aria-label="Toggle password visibility"><i class="fas fa-eye"></i></button>
                  </div>
                  <div class="cpwd-error" style="display:none;">Passwords do not match</div>
                </div>
              </div>

              <div style="display:flex; gap:0.6rem; margin-top:0.75rem;">
                <button type="button" class="btn btn-outline btn-sm" id="btn-cancel-convert" style="padding:0.65rem 1rem; font-size:0.85rem; color:#666;">
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary btn-block" id="btn-convert-submit" style="padding:0.65rem 1rem; font-size:0.88rem; flex:1;">
                  <i class="fas fa-check-circle"></i> Save Account & Open Dashboard
                </button>
              </div>
            </form>

            <!-- Dismissed acknowledgement -->
            <div id="guest-declined-msg" style="display:none; margin-top:0.75rem; font-size:0.84rem; color:var(--gray); background:#f8f9fa; padding:0.6rem 0.85rem; border-radius:6px; border:1px solid #e9ecef;">
              <i class="fas fa-info-circle" style="color:var(--primary);"></i> You can track this order anytime with your Order ID (<strong>${orderId}</strong>) via <strong>Track Transactions</strong>.
            </div>
          </div>
        `;
        guestConvertBox.style.display = 'block';

        const askStep = document.getElementById('guest-ask-step');
        const convertForm = document.getElementById('guest-convert-form');
        const declinedMsg = document.getElementById('guest-declined-msg');
        const btnAskYes = document.getElementById('btn-ask-yes-pwd');
        const btnAskNo = document.getElementById('btn-ask-no-pwd');
        const btnCancelConvert = document.getElementById('btn-cancel-convert');

        btnAskYes?.addEventListener('click', () => {
          if (askStep) askStep.style.display = 'none';
          if (declinedMsg) declinedMsg.style.display = 'none';
          if (convertForm) convertForm.style.display = 'block';
          document.getElementById('guest-convert-pwd')?.focus();
        });

        btnAskNo?.addEventListener('click', () => {
          if (askStep) askStep.style.display = 'none';
          if (convertForm) convertForm.style.display = 'none';
          if (declinedMsg) declinedMsg.style.display = 'block';
        });

        btnCancelConvert?.addEventListener('click', () => {
          if (convertForm) convertForm.style.display = 'none';
          if (askStep) askStep.style.display = 'flex';
          if (declinedMsg) declinedMsg.style.display = 'none';
        });

        const convertPwd = document.getElementById('guest-convert-pwd');
        const convertCpwd = document.getElementById('guest-convert-cpwd');
        const convertSubmitBtn = document.getElementById('btn-convert-submit');

        const strengthWrap = convertForm?.querySelector('.pwd-strength');
        const strengthBar = convertForm?.querySelector('.pwd-strength-bar');
        const strengthText = convertForm?.querySelector('.pwd-strength-text');
        const cpwdError = convertForm?.querySelector('.cpwd-error');

        function checkConvertStrength(pwd) {
          let strength = 0;
          if (pwd.length >= 6) strength += 25;
          if (pwd.length >= 10) strength += 25;
          if (/[A-Z]/.test(pwd)) strength += 25;
          if (/[0-9!@#$%^&*]/.test(pwd)) strength += 25;
          return strength;
        }

        function validateConvertPwd() {
          const pwd = convertPwd ? convertPwd.value : '';
          const cpwd = convertCpwd ? convertCpwd.value : '';

          // Strength indicator
          if (pwd && strengthWrap && strengthBar && strengthText) {
            strengthWrap.style.display = 'block';
            strengthText.style.display = 'block';
            const score = checkConvertStrength(pwd);
            strengthBar.style.width = score + '%';
            if (score <= 25) {
              strengthBar.style.background = 'red';
              strengthText.textContent = 'Weak';
              strengthText.style.color = 'red';
            } else if (score <= 50) {
              strengthBar.style.background = 'orange';
              strengthText.textContent = 'Fair';
              strengthText.style.color = 'orange';
            } else if (score <= 75) {
              strengthBar.style.background = '#e6c200';
              strengthText.textContent = 'Good';
              strengthText.style.color = '#e6c200';
            } else {
              strengthBar.style.background = 'green';
              strengthText.textContent = 'Strong';
              strengthText.style.color = 'green';
            }
          } else if (strengthWrap && strengthText) {
            strengthWrap.style.display = 'none';
            strengthText.style.display = 'none';
          }

          // Match validation
          if (cpwd && cpwdError) {
            if (pwd !== cpwd) {
              cpwdError.style.display = 'block';
              if (convertSubmitBtn) convertSubmitBtn.disabled = true;
            } else {
              cpwdError.style.display = 'none';
              if (convertSubmitBtn) convertSubmitBtn.disabled = (pwd.length < 6);
            }
          } else if (cpwdError) {
            cpwdError.style.display = 'none';
            if (convertSubmitBtn) convertSubmitBtn.disabled = (pwd.length < 6);
          }
        }

        convertPwd?.addEventListener('input', validateConvertPwd);
        convertCpwd?.addEventListener('input', validateConvertPwd);

        convertForm?.addEventListener('submit', (e) => {
          e.preventDefault();
          const pwd = convertPwd?.value;
          const cpwd = convertCpwd?.value;

          if (!pwd || pwd.length < 6) {
            showToast('Password must be at least 6 characters.');
            return;
          }
          if (pwd !== cpwd) {
            showToast('Passwords do not match.');
            if (cpwdError) cpwdError.style.display = 'block';
            return;
          }

          const users = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
          let existingUser = users.find(u => u.email.toLowerCase() === (customerInfo.email || '').toLowerCase());
          if (existingUser) {
            existingUser.password = pwd;
            existingUser.orderHistory = existingUser.orderHistory || [];
            if (placedOrder && !existingUser.orderHistory.some(o => o.orderId === orderId)) {
              existingUser.orderHistory.unshift(placedOrder);
            }
          } else {
            const newUser = {
              name: customerInfo.name,
              email: customerInfo.email,
              contact: customerInfo.contact,
              address: customerInfo.address,
              password: pwd,
              orderHistory: placedOrder ? [ placedOrder ] : []
            };
            users.push(newUser);
          }
          localStorage.setItem('weBakeUsers', JSON.stringify(users));
          localStorage.setItem('weBakeSession', JSON.stringify({ name: customerInfo.name, email: customerInfo.email }));
          if (window.updateNavState) window.updateNavState();
          showToast(`Account created! Welcome, ${customerInfo.name} 🎉`);
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 1200);
        });
      } else if (guestConvertBox) {
        guestConvertBox.style.display = 'none';
        guestConvertBox.innerHTML = '';
      }

      // Only remove the checked out items from the cart
      checkoutItems.forEach(item => {
        cart = cart.filter(c => c.id !== item.id);
      });
      
      updateCartUI();
      syncCartToStore();
      showStep('step-success');
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm 50% Payment';
      btn.disabled = false;
    }, 1500);
  });

  /* Order Again */
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
    if (guestConvertBox) { guestConvertBox.style.display = 'none'; guestConvertBox.innerHTML = ''; }
    setPaymentMethod('GCash');
    checkoutItems = []; customerInfo = {};
  });


  /* --- PARTNER FORM --- */
  const partnerForm = document.getElementById('partner-form');
  const yearsSelect = document.getElementById('partner-years');
  const yearsCustomWrap = document.getElementById('partner-years-custom-wrap');
  const yearsCustomInput = document.getElementById('partner-years-custom');
  const yearsBackBtn = document.getElementById('partner-years-back-btn');

  // Restrict custom input to numbers only and maximum 2 digits
  yearsCustomInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
  });

  // Dropdown toggle: when "more" is clicked, replace dropdown with text input
  yearsSelect?.addEventListener('change', () => {
    if (yearsSelect.value === 'more') {
      yearsSelect.style.display = 'none';
      yearsSelect.removeAttribute('required');
      if (yearsCustomWrap) yearsCustomWrap.style.display = 'block';
      if (yearsCustomInput) {
        yearsCustomInput.setAttribute('required', '');
        yearsCustomInput.value = '';
        yearsCustomInput.focus();
      }
    }
  });

  // Back button: switch back from custom text input to dropdown list
  yearsBackBtn?.addEventListener('click', () => {
    if (yearsCustomWrap) yearsCustomWrap.style.display = 'none';
    if (yearsCustomInput) {
      yearsCustomInput.removeAttribute('required');
      yearsCustomInput.value = '';
    }
    if (yearsSelect) {
      yearsSelect.style.display = 'block';
      yearsSelect.setAttribute('required', '');
      yearsSelect.value = '';
      yearsSelect.focus();
    }
  });

  // Form reset: restore dropdown view
  partnerForm?.addEventListener('reset', () => {
    setTimeout(() => {
      if (yearsCustomWrap) yearsCustomWrap.style.display = 'none';
      if (yearsCustomInput) {
        yearsCustomInput.removeAttribute('required');
        yearsCustomInput.value = '';
      }
      if (yearsSelect) {
        yearsSelect.style.display = 'block';
        yearsSelect.setAttribute('required', '');
      }
    }, 50);
  });

  let partnerEmailVerified = false;
  let verifiedPartnerEmail = '';

  function triggerPartnerEmailOtp() {
    const emailEl = document.getElementById('partner-email');
    const emailVal = (emailEl?.value || '').trim().toLowerCase();
    const feedback = document.getElementById('partner-email-feedback');
    const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');

    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(emailVal)) {
      showToast('Please enter a valid Gmail address (must end with @gmail.com)');
      validateInput(emailEl, false);
      if (feedback) {
        feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
        feedback.style.display = 'block';
      }
      emailEl?.focus();
      return;
    }

    // 1. Check if email belongs to registered user (Item 1)
    const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === emailVal);
    if (isRegistered) {
      showToast('This Gmail address is already registered. Please sign in or use another email.');
      validateInput(emailEl, false);
      if (feedback) {
        if (!feedback.querySelector('#partner-inline-signin-link')) {
          feedback.innerHTML = `This Gmail address is already registered. Please <a href="#" data-auth-open="signin-modal" id="partner-inline-signin-link" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or use another email.`;
        }
        feedback.style.display = 'block';
      }
      emailEl?.focus();
      return;
    }

    // 2. Check if email already has active application (guest rule)
    const editingAppId = sessionStorage.getItem('weBakeEditPartnerId');
    const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
    const existingApp = allApps.find(a => 
      a.status !== 'cancelled' &&
      ((a.details?.email && (a.details.email || '').trim().toLowerCase() === emailVal) ||
       (a.email && (a.email || '').trim().toLowerCase() === emailVal))
    );
    if (existingApp && (!editingAppId || existingApp.appId.toUpperCase() !== editingAppId.toUpperCase())) {
      showToast(`This Gmail address has an active application (ID: ${existingApp.appId}). Guests can only apply once.`);
      validateInput(emailEl, false);
      if (feedback) {
        feedback.textContent = `This Gmail address has an active application (ID: ${existingApp.appId}). Guests can only apply once. Track it via Track Transactions.`;
        feedback.style.display = 'block';
      }
      emailEl?.focus();
      return;
    }

    validateInput(emailEl, true);
    if (feedback) feedback.style.display = 'none';

    const vBtn = document.getElementById('btn-partner-verify-email');
    const otpContainer = document.getElementById('partner-otp-container');
    const emailDisplay = document.getElementById('partner-otp-email-display');
    const otpError = document.getElementById('partner-otp-error');
    const timerSpan = document.getElementById('partner-otp-timer');
    const timerWrap = document.getElementById('partner-otp-timer-wrap');
    const resendBtn = document.getElementById('partner-otp-resend-btn');

    document.querySelectorAll('#partner-otp-inputs .otp-input').forEach(i => i.value = '');
    if (otpError) { otpError.style.display = 'none'; otpError.textContent = ''; }
    if (emailDisplay) emailDisplay.textContent = emailVal;

    WeBakeOTP.send({
      email: emailVal,
      purpose: 'partner_verification',
      buttonEl: vBtn,
      loadingText: 'Sending...',
      onSuccess: () => {
        showToast('Verification code sent to ' + emailVal);
        if (otpContainer) otpContainer.style.display = 'block';
        WeBakeOTP.startCountdown({
          timerSpanEl: timerSpan,
          timerWrapEl: timerWrap,
          resendBtnEl: resendBtn,
          duration: 60
        });
        const firstInput = document.querySelector('#partner-otp-inputs .otp-input');
        if (firstInput) firstInput.focus();
      },
      onError: (errMsg) => {
        showToast(errMsg);
        if (otpError) { otpError.textContent = errMsg; otpError.style.display = 'block'; }
      }
    });
  }

  // Wire Verify button
  document.getElementById('btn-partner-verify-email')?.addEventListener('click', triggerPartnerEmailOtp);

  // Wire Resend button
  document.getElementById('partner-otp-resend-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const emailEl = document.getElementById('partner-email');
    const emailVal = (emailEl?.value || '').trim().toLowerCase();
    const resendBtn = document.getElementById('partner-otp-resend-btn');
    const timerSpan = document.getElementById('partner-otp-timer');
    const timerWrap = document.getElementById('partner-otp-timer-wrap');
    const otpError = document.getElementById('partner-otp-error');

    WeBakeOTP.send({
      email: emailVal,
      purpose: 'partner_verification',
      buttonEl: resendBtn,
      errorEl: otpError,
      loadingText: 'Resending...',
      onSuccess: () => {
        showToast('New verification code sent to ' + emailVal);
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

  // Wire Confirm Code button
  document.getElementById('btn-partner-submit-otp')?.addEventListener('click', () => {
    const emailEl = document.getElementById('partner-email');
    const emailVal = (emailEl?.value || '').trim().toLowerCase();
    const entered = Array.from(document.querySelectorAll('#partner-otp-inputs .otp-input')).map(i => i.value).join('');
    const otpError = document.getElementById('partner-otp-error');
    const submitBtn = document.getElementById('btn-partner-submit-otp');

    if (entered.length !== 6) {
      if (otpError) {
        otpError.textContent = 'Please enter the complete 6-digit verification code.';
        otpError.style.display = 'block';
      }
      return;
    }

    WeBakeOTP.verify({
      email: emailVal,
      code: entered,
      purpose: 'partner_verification',
      buttonEl: submitBtn,
      errorEl: otpError,
      loadingText: 'Verifying...',
      onSuccess: () => {
        partnerEmailVerified = true;
        verifiedPartnerEmail = emailVal;
        if (otpError) otpError.style.display = 'none';
        showToast('Email verified successfully!');
        const otpContainer = document.getElementById('partner-otp-container');
        if (otpContainer) otpContainer.style.display = 'none';
        const vBadge = document.getElementById('partner-email-verified-badge');
        if (vBadge) vBadge.style.display = 'inline-block';
        const vBtn = document.getElementById('btn-partner-verify-email');
        if (vBtn) vBtn.style.display = 'none';
      },
      onError: (errMsg) => {
        if (otpError) {
          otpError.textContent = errMsg;
          otpError.style.display = 'block';
        }
      }
    });
  });

  // Real-time Guest Email Validation for Partner Page
  function checkPartnerEmailRealtime(isBlur = false) {
    const partnerEmailEl = document.getElementById('partner-email');
    const feedback = document.getElementById('partner-email-feedback');
    const vBadge = document.getElementById('partner-email-verified-badge');
    const vBtn = document.getElementById('btn-partner-verify-email');
    const otpContainer = document.getElementById('partner-otp-container');
    if (!partnerEmailEl) return true;

    let s = null;
    try { s = JSON.parse(localStorage.getItem('weBakeSession')); } catch(e){}
    if (s && s.email) return true;

    const curVal = (partnerEmailEl.value || '').trim().toLowerCase();

    if (curVal && curVal === verifiedPartnerEmail) {
      partnerEmailVerified = true;
      if (vBadge) vBadge.style.display = 'inline-block';
      if (vBtn) vBtn.style.display = 'none';
      if (otpContainer) otpContainer.style.display = 'none';
      validateInput(partnerEmailEl, true);
      if (feedback) feedback.style.display = 'none';
      return true;
    } else {
      partnerEmailVerified = false;
      if (vBadge) vBadge.style.display = 'none';
      if (vBtn) vBtn.style.display = 'inline-flex';
    }

    if (!curVal) {
      partnerEmailEl.classList.remove('is-invalid', 'is-valid');
      if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
      }
      return false;
    }

    const isFullGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(curVal);
    if (isFullGmail) {
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === curVal);
      if (isRegistered) {
        validateInput(partnerEmailEl, false);
        if (feedback) {
          if (!feedback.querySelector('#partner-inline-signin-link')) {
            feedback.innerHTML = `This Gmail address is already registered. Please <a href="#" data-auth-open="signin-modal" id="partner-inline-signin-link" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or use another email.`;
          }
          feedback.style.display = 'block';
        }
        return false;
      }

      // Check active application
      const editingAppId = sessionStorage.getItem('weBakeEditPartnerId');
      const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
      const existingApp = allApps.find(a => 
        a.status !== 'cancelled' &&
        ((a.details?.email && (a.details.email || '').trim().toLowerCase() === curVal) ||
         (a.email && (a.email || '').trim().toLowerCase() === curVal))
      );
      if (existingApp && (!editingAppId || existingApp.appId.toUpperCase() !== editingAppId.toUpperCase())) {
        validateInput(partnerEmailEl, false);
        if (feedback) {
          feedback.textContent = `This Gmail address has an active application (ID: ${existingApp.appId}). Guests can only apply once. Track it via Track Transactions.`;
          feedback.style.display = 'block';
        }
        return false;
      }

      // Valid & available
      validateInput(partnerEmailEl, true);
      if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
      }
      return true;
    } else {
      const afterAt = curVal.includes('@') ? curVal.split('@')[1] : '';
      const isTypingGmail = 'gmail.com'.startsWith(afterAt);
      if (isBlur || (curVal.includes('@') && !isTypingGmail)) {
        validateInput(partnerEmailEl, false);
        if (feedback) {
          feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
          feedback.style.display = 'block';
        }
        return false;
      } else {
        partnerEmailEl.classList.remove('is-invalid', 'is-valid');
        if (feedback) feedback.style.display = 'none';
        return false;
      }
    }
  }

  const partnerEmailInput = document.getElementById('partner-email');
  partnerEmailInput?.addEventListener('input', () => checkPartnerEmailRealtime(false));
  partnerEmailInput?.addEventListener('blur', () => checkPartnerEmailRealtime(true));

  function syncPartnerFormState() {
    const partnerForm = document.getElementById('partner-form');
    if (!partnerForm) return;
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      const contactSection = document.getElementById('partner-contact-section');
      const loggedInBadge = document.getElementById('partner-logged-in-badge');
      const partnerEmailEl = document.getElementById('partner-email');
      const partnerPhoneEl = document.getElementById('partner-phone');
      const partnerOwnerEl = document.getElementById('partner-owner-name');
      const yearsSelect = document.getElementById('partner-years');
      const yearsCustomWrap = document.getElementById('partner-years-custom-wrap');
      const yearsCustomInput = document.getElementById('partner-years-custom');
      const editBanner = document.getElementById('partner-edit-banner');
      const editIdText = document.getElementById('partner-edit-id-text');
      const cancelEditBtn = document.getElementById('partner-cancel-edit-btn');
      const submitBtn = partnerForm.querySelector('button[type="submit"]');

      function populatePartnerFields(data, rootApp) {
        if (!data) return;
        ['bakery-name', 'owner-name', 'type', 'address', 'notes'].forEach(key => {
          const el = document.getElementById(`partner-${key}`);
          if (el && data[key] !== undefined) el.value = data[key];
        });

        // Ensure email & phone are read from data or rootApp (fixing Item 4)
        const savedEmail = (data.email || (rootApp && rootApp.email) || '').trim();
        const savedPhone = (data.phone || (rootApp && rootApp.phone) || '').trim();
        if (partnerEmailEl && savedEmail) {
          partnerEmailEl.value = savedEmail;
          partnerEmailVerified = true;
          verifiedPartnerEmail = savedEmail.toLowerCase();
          const vBadge = document.getElementById('partner-email-verified-badge');
          if (vBadge) vBadge.style.display = 'inline-block';
          const vBtn = document.getElementById('btn-partner-verify-email');
          if (vBtn) vBtn.style.display = 'none';
        }
        if (partnerPhoneEl && savedPhone) {
          partnerPhoneEl.value = savedPhone;
        }

        if (data.years) {
          const standardYears = ['Less than 1 year', '1 year', '2 years', '3 years', '4 years', '5 years'];
          if (standardYears.includes(data.years)) {
            if (yearsSelect) {
              yearsSelect.style.display = 'block';
              yearsSelect.setAttribute('required', '');
              yearsSelect.value = data.years;
            }
            if (yearsCustomWrap) yearsCustomWrap.style.display = 'none';
            if (yearsCustomInput) yearsCustomInput.removeAttribute('required');
          } else {
            if (yearsSelect) {
              yearsSelect.style.display = 'none';
              yearsSelect.removeAttribute('required');
              yearsSelect.value = 'more';
            }
            if (yearsCustomWrap) yearsCustomWrap.style.display = 'block';
            if (yearsCustomInput) {
              yearsCustomInput.setAttribute('required', '');
              const numStr = (data.years.match(/\d{1,2}/) || [''])[0];
              yearsCustomInput.value = numStr;
            }
          }
        }

        if (data.products && Array.isArray(data.products)) {
          const checkboxes = partnerForm.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(cb => {
            cb.checked = data.products.includes(cb.value);
          });
        }
      }

      if (s) {
        const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
        const sEmail = (s.email || '').trim().toLowerCase();
        const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);

        // Account is logged in -> email is inherently verified
        partnerEmailVerified = true;
        verifiedPartnerEmail = ((u && u.email) || s.email || '').trim().toLowerCase();

        // Hide contact input section and show verified account badge
        if (contactSection) contactSection.style.display = 'none';
        if (partnerEmailEl) partnerEmailEl.removeAttribute('required');
        if (partnerPhoneEl) partnerPhoneEl.removeAttribute('required');

        if (loggedInBadge) {
          loggedInBadge.style.display = 'block';
          const badgeName = document.getElementById('partner-badge-name');
          const badgeEmail = document.getElementById('partner-badge-email');
          const badgePhone = document.getElementById('partner-badge-phone');
          if (badgeName) badgeName.textContent = (u && u.name) || s.name || 'Account Holder';
          if (badgeEmail) badgeEmail.textContent = (u && u.email) || s.email || '';
          if (badgePhone) badgePhone.textContent = (u && u.contact) || 'Not provided in profile';
        }

        // Auto-fill representative name if empty
        if (partnerOwnerEl && !partnerOwnerEl.value && ((u && u.name) || s.name)) {
          partnerOwnerEl.value = (u && u.name) || s.name;
        }

        if (u && (u.partnerStatus === 'pending' || u.partnerStatus === 'active')) {
          const intro = document.querySelector('.partner-intro');
          if (intro) intro.innerHTML = `<div style="background:#e3f2fd; color:#0c5460; padding:1rem; border-radius:8px; margin-bottom:1rem; font-weight:bold;"><i class="fas fa-info-circle"></i> You have already submitted an application. You can update your existing details below.</div>`;
          if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Application';
          if (u.partnerDetails) populatePartnerFields(u.partnerDetails, u);
        }
      } else {
        // Guest mode: ensure contact inputs are displayed and required
        if (contactSection) contactSection.style.display = 'block';
        if (loggedInBadge) loggedInBadge.style.display = 'none';
        if (partnerEmailEl) partnerEmailEl.setAttribute('required', '');
        if (partnerPhoneEl) partnerPhoneEl.setAttribute('required', '');
      }

      // Check if user is editing a specific application (e.g. from Track Transaction modal)
      const editPartnerId = sessionStorage.getItem('weBakeEditPartnerId');
      if (editPartnerId) {
        const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
        const editApp = allApps.find(a => a.appId && a.appId.toUpperCase() === editPartnerId.toUpperCase());
        if (editApp && editApp.status !== 'cancelled') {
          populatePartnerFields(editApp.details || {}, editApp);

          if (editBanner) {
            editBanner.style.display = 'flex';
            if (editIdText) editIdText.textContent = editApp.appId;
          }

          if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Application Changes';
          }

          if (cancelEditBtn) {
            cancelEditBtn.onclick = function() {
              sessionStorage.removeItem('weBakeEditPartnerId');
              if (editBanner) editBanner.style.display = 'none';
              partnerForm.reset();
              partnerEmailVerified = false;
              verifiedPartnerEmail = '';
              const vBadge = document.getElementById('partner-email-verified-badge');
              if (vBadge) vBadge.style.display = 'none';
              const vBtn = document.getElementById('btn-partner-verify-email');
              if (vBtn) vBtn.style.display = 'inline-flex';
              const otpContainer = document.getElementById('partner-otp-container');
              if (otpContainer) otpContainer.style.display = 'none';
              if (window.WeBakeOTP && typeof window.WeBakeOTP.clearCountdown === 'function') {
                window.WeBakeOTP.clearCountdown();
              }
              if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
              syncPartnerFormState();
              showToast('Edit mode cancelled.');
            };
          }
        } else {
          sessionStorage.removeItem('weBakeEditPartnerId');
          if (editBanner) editBanner.style.display = 'none';
        }
      } else {
        if (editBanner) editBanner.style.display = 'none';
      }
    } catch(e) {}
  }

  // Initial sync on load
  syncPartnerFormState();

  // Expose globally and listen for live auth changes
  window.syncPartnerFormState = syncPartnerFormState;
  window.addEventListener('weBakeAuthChange', syncPartnerFormState);

  partnerForm?.addEventListener('submit', e => {
    e.preventDefault();
    let isUpdate = false;
    const editingAppId = sessionStorage.getItem('weBakeEditPartnerId');
    
    // Check if user is logged in
    let s = null;
    try { s = JSON.parse(localStorage.getItem('weBakeSession')); } catch(err){}
    const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
    const sEmail = s ? (s.email || '').trim().toLowerCase() : '';
    const currentUser = s ? allUsers.find(u => (u.email || '').trim().toLowerCase() === sEmail) : null;

    // Gather details from form
    const details = {};
    ['bakery-name', 'owner-name', 'type', 'address', 'notes'].forEach(key => {
      const el = document.getElementById(`partner-${key}`);
      if (el) details[key] = el.value.trim();
    });

    // Handle years of operation (dropdown or replaced custom 2-digit input)
    const yearsSelect = document.getElementById('partner-years');
    const yearsCustomWrap = document.getElementById('partner-years-custom-wrap');
    const yearsCustomInput = document.getElementById('partner-years-custom');
    if (yearsCustomWrap && yearsCustomWrap.style.display !== 'none') {
      const customVal = yearsCustomInput?.value.replace(/\D/g, '').slice(0, 2);
      if (!customVal) {
        showToast('Please enter the number of years in operation (numbers only, max 2 digits)');
        yearsCustomInput?.focus();
        return;
      }
      details.years = `${customVal} years`;
    } else if (yearsSelect) {
      details.years = yearsSelect.value;
    }

    details.products = Array.from(partnerForm.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    if (currentUser) {
      // Logged in: auto-attach user account details
      details.email = currentUser.email || s.email;
      details.phone = (currentUser.contact || '').replace(/\D/g, '');
      if (!details['owner-name'] && (currentUser.name || s.name)) {
        details['owner-name'] = currentUser.name || s.name;
      }
    } else {
      // Guest mode: validate input fields
      const partnerEmailEl = document.getElementById('partner-email');
      const emailVal = (partnerEmailEl?.value || '').trim().toLowerCase();
      const feedback = document.getElementById('partner-email-feedback');

      if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(emailVal)) {
        showToast('Please enter a valid Gmail address (must end with @gmail.com)');
        validateInput(partnerEmailEl, false);
        if (feedback) {
          feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
          feedback.style.display = 'block';
        }
        partnerEmailEl?.focus();
        return;
      }
      details.email = emailVal;

      const partnerPhoneEl = document.getElementById('partner-phone');
      const cleanPhone = (partnerPhoneEl?.value || '').replace(/\D/g, '');
      if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
        showToast('Contact number must be 11 digits starting with 09 (no letters or characters)');
        validateInput(partnerPhoneEl, false);
        partnerPhoneEl?.focus();
        return;
      }
      details.phone = cleanPhone;

      // 1. If email belongs to registered user, prompt inline (Item 1)
      const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === emailVal);
      if (isRegistered) {
        showToast('This Gmail address is already registered. Please sign in or use another email.');
        validateInput(partnerEmailEl, false);
        if (feedback) {
          if (!feedback.querySelector('#partner-inline-signin-link2')) {
            feedback.innerHTML = `This Gmail address is already registered. Please <a href="#" data-auth-open="signin-modal" id="partner-inline-signin-link2" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or use another email.`;
          }
          feedback.style.display = 'block';
        }
        partnerEmailEl?.focus();
        return;
      }

      // 2. REQUIREMENT: Guest Gmail address or phone can only apply ONCE (active/pending)
      const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
      const existingApp = allApps.find(a => 
        (a.status !== 'cancelled') &&
        ((a.details?.email && (a.details.email || '').trim().toLowerCase() === emailVal) || 
         (a.email && (a.email || '').trim().toLowerCase() === emailVal) ||
         (a.details?.phone && (a.details.phone || '').replace(/\D/g, '') === cleanPhone) ||
         (a.phone && (a.phone || '').replace(/\D/g, '') === cleanPhone))
      );
      if (existingApp && (!editingAppId || existingApp.appId.toUpperCase() !== editingAppId.toUpperCase())) {
        showToast(`This Gmail address or phone has an active application (ID: ${existingApp.appId}). Guests can only apply once.`);
        if (partnerEmailEl) {
          validateInput(partnerEmailEl, false);
          if (feedback) {
            feedback.textContent = `This Gmail address has an active application (${existingApp.appId}). Guests can only apply once. Track it via Track Transactions.`;
            feedback.style.display = 'block';
          }
          partnerEmailEl.focus();
        }
        return;
      }

      // 3. REQUIREMENT: Guest must verify Gmail via OTP (Item 3)
      if (!partnerEmailVerified || emailVal !== verifiedPartnerEmail) {
        showToast('Please verify your Gmail address with the OTP code before submitting.');
        triggerPartnerEmailOtp();
        return;
      }
    }

    // Save to global weBakePartnerApplications
    const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
    let targetApp = null;
    if (editingAppId) {
      targetApp = allApps.find(a => a.appId && a.appId.toUpperCase() === editingAppId.toUpperCase());
    }
    if (!targetApp) {
      targetApp = allApps.find(a => 
        (a.status !== 'cancelled') &&
        ((a.details?.email && (a.details.email || '').trim().toLowerCase() === (details.email || '').trim().toLowerCase()) || 
         (a.email && (a.email || '').trim().toLowerCase() === (details.email || '').trim().toLowerCase()) ||
         (a.details?.phone && (a.details.phone || '').replace(/\D/g, '') === (details.phone || '').replace(/\D/g, '')) ||
         (a.phone && (a.phone || '').replace(/\D/g, '') === (details.phone || '').replace(/\D/g, '')))
      );
    }

    let appId = targetApp ? targetApp.appId : ('WB-PRT-' + Math.floor(10000 + Math.random() * 90000));

    // Fully synchronize root and details properties (fixing Item 4)
    if (targetApp) {
      isUpdate = true;
      targetApp.email = details.email;
      targetApp.phone = details.phone;
      targetApp.details = { ...(targetApp.details || {}), ...details, email: details.email, phone: details.phone };
      targetApp.updatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
      allApps.unshift({
        appId: appId,
        email: details.email,
        phone: details.phone,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'pending',
        details: { ...details, email: details.email, phone: details.phone }
      });
    }
    localStorage.setItem('weBakePartnerApplications', JSON.stringify(allApps));

    if (editingAppId) {
      sessionStorage.removeItem('weBakeEditPartnerId');
    }

    // Also link to logged-in user if session exists
    if (currentUser) {
      currentUser.partnerStatus = currentUser.partnerStatus === 'active' ? 'active' : 'pending';
      currentUser.partnerDetails = details;
      currentUser.partnerAppId = appId;
      localStorage.setItem('weBakeUsers', JSON.stringify(allUsers));
    }

    showToast(isUpdate ? 'Partnership application updated successfully!' : 'Partnership application submitted successfully!');

    if (currentUser) {
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
    } else {
      // Guest applicant: Render a confirmation card with Reference ID & direct Track link
      const formContainer = document.querySelector('.partner-form-container');
      if (formContainer) {
        formContainer.innerHTML = `
          <div style="text-align:center; padding:1.5rem 0; animation: fadeIn 0.4s ease;">
            <div style="font-size:3.5rem; color:#28a745; margin-bottom:1rem;"><i class="fas fa-check-circle"></i></div>
            <h3 style="color:var(--primary); font-size:1.6rem; font-weight:700; margin-bottom:0.5rem;">${isUpdate ? 'Partnership Application Updated!' : 'Partnership Application Submitted!'}</h3>
            <p style="color:var(--gray); font-size:0.95rem; max-width:540px; margin:0 auto 1.75rem; line-height:1.6;">
              ${isUpdate ? 'Your wholesale partner details have been successfully updated in our system. You can review and track your application anytime.' : "Thank you for applying to be an authorized wholesale partner with Crumbs N' Rolls Bakery. Our wholesale team reviews business applications within 24–48 hours."}
            </p>

            <div style="background:#FAF6F0; border:1px dashed #ebd9c8; border-radius:10px; padding:1.25rem 1.5rem; max-width:440px; margin:0 auto 1.5rem;">
              <span style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#888; display:block; letter-spacing:0.5px;">Your Application Reference ID</span>
              <div style="font-size:1.85rem; font-weight:800; color:var(--primary); margin:0.35rem 0;" id="app-reference-id">${appId}</div>
              <button type="button" class="btn btn-sm btn-outline" id="btn-copy-partner-id" style="padding:0.35rem 1rem; font-size:0.8rem;">
                <i class="far fa-copy"></i> <span id="copy-partner-text">Copy Reference ID</span>
              </button>
            </div>

            <div style="background:#e8f4fd; border:1px solid #b8daff; border-radius:8px; padding:0.85rem 1rem; max-width:480px; margin:0 auto 1.75rem; font-size:0.85rem; color:#004085;">
              <i class="fas fa-info-circle"></i> Keep this Reference ID safe. You can track your application review status, edit details, or cancel anytime via <strong>Track Transactions</strong>.
            </div>

            <div style="display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" id="btn-track-partner-now" style="padding:0.75rem 1.75rem;">
                <i class="fas fa-search-dollar"></i> Track This Application
              </button>
              <a href="home.html" class="btn btn-outline" style="padding:0.75rem 1.5rem;">
                <i class="fas fa-home"></i> Return to Home
              </a>
            </div>
          </div>
        `;

        document.getElementById('btn-copy-partner-id')?.addEventListener('click', () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(appId).then(() => {
              const txt = document.getElementById('copy-partner-text');
              if (txt) txt.textContent = 'Copied!';
              showToast('Application ID copied: ' + appId);
              setTimeout(() => { if (txt) txt.textContent = 'Copy Reference ID'; }, 2000);
            });
          } else {
            showToast('Application ID: ' + appId);
          }
        });

        document.getElementById('btn-track-partner-now')?.addEventListener('click', () => {
          if (window.openTrackOrderModal) {
            window.openTrackOrderModal(appId, details.email || details.phone || '', 'partner');
          }
        });

        window.scrollTo({ top: formContainer.offsetTop - 100, behavior: 'smooth' });
      }
    }
  });

  document.getElementById('partner-clear-btn')?.addEventListener('click', () => {
    partnerEmailVerified = false;
    verifiedPartnerEmail = '';
    const vBadge = document.getElementById('partner-email-verified-badge');
    if (vBadge) vBadge.style.display = 'none';
    const vBtn = document.getElementById('btn-partner-verify-email');
    if (vBtn) vBtn.style.display = 'inline-flex';
    const otpContainer = document.getElementById('partner-otp-container');
    if (otpContainer) otpContainer.style.display = 'none';
    if (window.WeBakeOTP && typeof window.WeBakeOTP.clearCountdown === 'function') {
      window.WeBakeOTP.clearCountdown();
    }
    if (sessionStorage.getItem('weBakeEditPartnerId')) {
      sessionStorage.removeItem('weBakeEditPartnerId');
      const editBanner = document.getElementById('partner-edit-banner');
      if (editBanner) editBanner.style.display = 'none';
      const submitBtn = partnerForm?.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
      showToast('Form cleared. Edit mode cancelled.');
    }
  });

  /* --- VALIDATION --- */
  function validateInput(el, isValid) {
    if (!el) return;
    el.classList.toggle('is-valid', isValid);
    el.classList.toggle('is-invalid', !isValid && el.value.length > 0);
  }

  // Product Page Checkout validations
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

  // Partner Page validations
  document.getElementById('partner-email')?.addEventListener('input', e => {
    const val = e.target.value.trim();
    const valid = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(val);
    validateInput(e.target, valid);
  });

  document.getElementById('partner-phone')?.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
    const valid = e.target.value.length === 11 && e.target.value.startsWith('09');
    validateInput(e.target, valid);
  });

  /* Init */
  loadCartFromStore();
  updateCartUI();

  /* Auto-checkout from Dashboard */
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