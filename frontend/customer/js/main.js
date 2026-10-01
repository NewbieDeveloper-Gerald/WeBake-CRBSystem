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
      const u = all.find(u => u.email === s.email);
      if (u) { u.savedCart = cart; localStorage.setItem('weBakeUsers', JSON.stringify(all)); }
    } catch(e){}
  }
  function addOrderToStore(totalAmt, paymentDetails) {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
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
        const u = all.find(u => u.email === s.email);
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
      const u = all.find(u => u.email === s.email);
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
    document.getElementById('checkout-overlay')?.classList.remove('active');
  }
  function startCheckout() {
    document.getElementById('checkout-overlay')?.classList.add('active');
    showStep('step-stock');
    setTimeout(() => showStep('step-info'), 1500);
  }

  /* Back from Info → close checkout */
  document.getElementById('info-back-btn')?.addEventListener('click', closeCheckout);

  let generatedOTP = null;
  let checkoutOtpInterval = null;

  function startCheckoutOtpTimer() {
    clearInterval(checkoutOtpInterval);
    let t = 30;
    const wrap = document.getElementById('checkout-otp-timer-wrap');
    const span = document.getElementById('checkout-otp-timer');
    const btn = document.getElementById('checkout-otp-resend-btn');
    if (wrap && span && btn) {
      wrap.style.display = 'inline';
      btn.style.display = 'none';
      span.textContent = t;
      checkoutOtpInterval = setInterval(() => {
        span.textContent = --t;
        if (t <= 0) {
          clearInterval(checkoutOtpInterval);
          wrap.style.display = 'none';
          btn.style.display = 'inline';
        }
      }, 1000);
    }
  }

  /* Info → OTP (if guest) or Payment (if logged in) */
  document.getElementById('info-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const custContactEl = document.getElementById('cust-contact');
    const custEmailEl = document.getElementById('cust-email');

    const cleanContact = (custContactEl?.value || '').trim().replace(/\D/g, '');
    const emailVal = (custEmailEl?.value || '').trim();

    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(emailVal)) {
      showToast('Please enter a valid Gmail address (must end with @gmail.com)');
      validateInput(custEmailEl, false);
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
    /* Build centered review details inside payment step */
    const total = checkoutItems.reduce((s, i) => s + i.price * i.qty, 0);
    const downpayment = Math.round(total * 0.5);
    const balance = total - downpayment;

    let html = `<div class="confirmation-details-section"><h4><i class="fas fa-user"></i> Customer Information</h4>`;
    html += `<p><span>Name:</span> ${customerInfo.name}</p><p><span>Contact:</span> ${customerInfo.contact}</p>`;
    html += `<p><span>Email:</span> ${customerInfo.email}</p><p><span>Address:</span> ${customerInfo.address}</p></div>`;
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
    document.getElementById('review-details').innerHTML = html;
    
    let session = null;
    try {
      session = JSON.parse(localStorage.getItem('weBakeSession'));
    } catch(err) {}

    if (!session) {
      // Guest user -> require OTP
      generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      // Simulate sending OTP via email by showing it in a toast
      showToast(`OTP sent to ${customerInfo.email}: ${generatedOTP}`);
      
      const otpInputs = document.querySelectorAll('.otp-input');
      const otpError = document.getElementById('otp-error');
      otpInputs.forEach(i => i.value = '');
      if (otpError) otpError.style.display = 'none';
      
      const emailDisplay = document.getElementById('checkout-otp-email-display');
      if (emailDisplay) emailDisplay.textContent = customerInfo.email;
      
      startCheckoutOtpTimer();
      showStep('step-otp');
    } else {
      // Logged in user -> skip OTP
      showStep('step-payment');
    }
  });

  document.getElementById('checkout-otp-resend-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    showToast(`OTP resent to ${customerInfo.email}: ${generatedOTP}`);
    startCheckoutOtpTimer();
  });

  /* OTP Handlers */
  document.getElementById('otp-back-btn')?.addEventListener('click', () => showStep('step-info'));
  document.getElementById('otp-verify-btn')?.addEventListener('click', () => {
    const entered = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
    const otpError = document.getElementById('otp-error');
    if (entered === generatedOTP) {
      if (otpError) otpError.style.display = 'none';
      showStep('step-payment');
    } else {
      if (otpError) otpError.style.display = 'block';
    }
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
      
      // Populate Order ID Card
      const orderIdCard = document.getElementById('success-order-id-card');
      if (orderIdCard) {
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
      let currentSession = null;
      try { currentSession = JSON.parse(localStorage.getItem('weBakeSession')); } catch(e){}

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
  if (partnerForm) {
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      if (s) {
        const all = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
        const u = all.find(u => u.email === s.email);
        if (u && (u.partnerStatus === 'pending' || u.partnerStatus === 'active')) {
          const intro = document.querySelector('.partner-intro');
          if (intro) intro.innerHTML = `<div style="background:#e3f2fd; color:#0c5460; padding:1rem; border-radius:8px; margin-bottom:1rem; font-weight:bold;"><i class="fas fa-info-circle"></i> You have already submitted an application. You can update your existing details below.</div>`;
          const submitBtn = partnerForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Application';
          
          // Pre-populate fields
          if (u.partnerDetails) {
            ['bakery-name', 'owner-name', 'type', 'years', 'address', 'branches', 'permit', 'tin', 'email', 'phone', 'notes'].forEach(key => {
              const el = document.getElementById(`partner-${key}`);
              if (el && u.partnerDetails[key]) el.value = u.partnerDetails[key];
            });
            // Handle checkboxes
            if (u.partnerDetails.products) {
              const checkboxes = partnerForm.querySelectorAll('input[type="checkbox"]');
              checkboxes.forEach(cb => {
                if (u.partnerDetails.products.includes(cb.value)) cb.checked = true;
              });
            }
          }
        }
      }
    } catch(e) {}
  }

  partnerForm?.addEventListener('submit', e => {
    e.preventDefault();
    let isUpdate = false;
    
    // Gather details from form
    const details = {};
    ['bakery-name', 'owner-name', 'type', 'years', 'address', 'branches', 'permit', 'tin', 'email', 'phone', 'notes'].forEach(key => {
      const el = document.getElementById(`partner-${key}`);
      if (el) details[key] = el.value.trim();
    });
    details.products = Array.from(partnerForm.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    // Validate Gmail pattern
    const partnerEmailEl = document.getElementById('partner-email');
    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(details.email)) {
      showToast('Please enter a valid Gmail address (must end with @gmail.com)');
      validateInput(partnerEmailEl, false);
      partnerEmailEl?.focus();
      return;
    }

    // Validate Contact number: 11 max length no letters or characters
    const partnerPhoneEl = document.getElementById('partner-phone');
    const cleanPhone = (details.phone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('09')) {
      showToast('Contact number must be 11 digits starting with 09 (no letters or characters)');
      validateInput(partnerPhoneEl, false);
      partnerPhoneEl?.focus();
      return;
    }
    details.phone = cleanPhone;

    // Save to global weBakePartnerApplications
    const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
    let existingApp = allApps.find(a => 
      (a.details?.email && a.details.email.toLowerCase() === details.email.toLowerCase()) || 
      (a.details?.phone && a.details.phone.replace(/\D/g, '') === details.phone.replace(/\D/g, ''))
    );

    let appId = existingApp ? existingApp.appId : ('WB-PRT-' + Math.floor(10000 + Math.random() * 90000));

    if (existingApp) {
      isUpdate = true;
      existingApp.details = details;
      existingApp.updatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
      allApps.unshift({
        appId: appId,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'pending',
        details: details
      });
    }
    localStorage.setItem('weBakePartnerApplications', JSON.stringify(allApps));

    // Also link to logged-in user if session exists
    let hasSession = false;
    try {
      const s = JSON.parse(localStorage.getItem('weBakeSession'));
      if (s) {
        hasSession = true;
        const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
        const u = allUsers.find(u => u.email === s.email);
        if (u) {
          u.partnerStatus = u.partnerStatus === 'active' ? 'active' : 'pending';
          u.partnerDetails = details;
          u.partnerAppId = appId;
          localStorage.setItem('weBakeUsers', JSON.stringify(allUsers));
        }
      }
    } catch(err) {}

    showToast(isUpdate ? 'Partnership application updated successfully!' : 'Partnership application submitted successfully!');

    if (hasSession) {
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
    } else {
      // Guest applicant: Render a confirmation card with Reference ID & direct Track link
      const formContainer = document.querySelector('.partner-form-container');
      if (formContainer) {
        formContainer.innerHTML = `
          <div style="text-align:center; padding:1.5rem 0; animation: fadeIn 0.4s ease;">
            <div style="font-size:3.5rem; color:#28a745; margin-bottom:1rem;"><i class="fas fa-check-circle"></i></div>
            <h3 style="color:var(--primary); font-size:1.6rem; font-weight:700; margin-bottom:0.5rem;">Partnership Application Submitted!</h3>
            <p style="color:var(--gray); font-size:0.95rem; max-width:540px; margin:0 auto 1.75rem; line-height:1.6;">
              Thank you for applying to be an authorized wholesale partner with Crumbs N' Rolls Bakery. Our wholesale team reviews business applications within 24–48 hours.
            </p>

            <div style="background:#FAF6F0; border:1px dashed #ebd9c8; border-radius:10px; padding:1.25rem 1.5rem; max-width:440px; margin:0 auto 1.5rem;">
              <span style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#888; display:block; letter-spacing:0.5px;">Your Application Reference ID</span>
              <div style="font-size:1.85rem; font-weight:800; color:var(--primary); margin:0.35rem 0;" id="app-reference-id">${appId}</div>
              <button type="button" class="btn btn-sm btn-outline" id="btn-copy-partner-id" style="padding:0.35rem 1rem; font-size:0.8rem;">
                <i class="far fa-copy"></i> <span id="copy-partner-text">Copy Reference ID</span>
              </button>
            </div>

            <div style="background:#e8f4fd; border:1px solid #b8daff; border-radius:8px; padding:0.85rem 1rem; max-width:480px; margin:0 auto 1.75rem; font-size:0.85rem; color:#004085;">
              <i class="fas fa-info-circle"></i> Keep this Reference ID safe. You can track your application review status and notes anytime via <strong>Track Transactions</strong>.
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