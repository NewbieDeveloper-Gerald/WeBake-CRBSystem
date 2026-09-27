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
    { id: 1, name: 'Mamon', desc: 'Soft and fluffy Filipino sponge cake, perfect for merienda or pasalubong. Light, airy, and melt-in-your-mouth delicious.', price: 850, min: 100, img: '' },
    { id: 2, name: 'Otap', desc: 'Crispy, flaky oval-shaped puff pastry with a caramelized sugar coating. A beloved Visayan delicacy enjoyed by all ages.', price: 650, min: 100, img: '' },
    { id: 3, name: 'Eggnog', desc: 'Sweet and crumbly meringue-based cookie, delicately baked to perfection. A classic Filipino bakery staple.', price: 550, min: 100, img: '' },
    { id: 4, name: 'Buttertoast', desc: 'Golden, crunchy butter-toasted bread slices. Perfectly toasted with a rich, buttery flavor ideal for wholesale.', price: 750, min: 100, img: '' }
  ];
  let cart = [], currentProduct = null, checkoutItems = [], customerInfo = {};

  /* --- RENDER PRODUCT GRID --- */
  const grid = document.getElementById('product-grid');
  if (grid) {
    grid.innerHTML = products.map(p => `
      <div class="product-card" data-id="${p.id}">
        <div class="product-img">${p.img ? `<img src="${p.img}" alt="${p.name}">` : `<i class="fas fa-image"></i><span>No image added</span>`}</div>
        <div class="product-card-info">
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-price">\u20B1${p.price.toLocaleString()} / ${p.min}pcs</div>
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
    document.getElementById('modal-price').textContent = `\u20B1${currentProduct.price.toLocaleString()} per ${currentProduct.min} pcs`;
    qtyInput.value = currentProduct.min;
    modal.classList.add('active'); modalOv.classList.add('active');
  }
  function closeModal() {
    modal?.classList.remove('active');
    modalOv?.classList.remove('active');
    currentProduct = null;
  }
  ['modal-close', 'modal-overlay'].forEach(id => document.getElementById(id)?.addEventListener('click', closeModal));
  document.getElementById('qty-minus')?.addEventListener('click', () => { qtyInput.value = Math.max(100, +qtyInput.value - 100); });
  document.getElementById('qty-plus')?.addEventListener('click', () => { qtyInput.value = +qtyInput.value + 100; });

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
      itemsEl.innerHTML = cart.map((item, i) => `<div class="cart-item"><div class="cart-item-info"><h4>${item.name}</h4><div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.25rem;"><button class="cart-qty-btn" data-i="${i}" data-action="minus" style="padding:0.1rem 0.4rem; cursor:pointer;">-</button><span style="font-size:0.85rem;">${item.qty} pcs</span><button class="cart-qty-btn" data-i="${i}" data-action="plus" style="padding:0.1rem 0.4rem; cursor:pointer;">+</button></div><p style="margin-top:0.25rem;">\u20B1${(item.price * item.qty / 100).toLocaleString()}</p></div><button class="cart-item-remove" data-i="${i}"><i class="fas fa-trash"></i></button></div>`).join('');
      itemsEl.querySelectorAll('.cart-item-remove').forEach(b => b.addEventListener('click', () => { cart.splice(+b.dataset.i, 1); updateCartUI(); }));
      itemsEl.querySelectorAll('.cart-qty-btn').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        cart[i].qty = b.dataset.action === 'minus' ? Math.max(100, cart[i].qty - 100) : cart[i].qty + 100;
        updateCartUI();
      }));
    }
    const total = cart.reduce((s, i) => s + i.price * i.qty / 100, 0);
    if (totalEl) totalEl.textContent = `\u20B1${total.toLocaleString()}`;
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
    closeModal(); updateCartUI(); showToast(`${name} added to cart!`);
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
    checkoutItems = [...cart]; toggleCart(false); startCheckout();
  });

  /* --- CHECKOUT FLOW: Stock → Info → Review → Payment → Success --- */
  function showStep(id) {
    document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
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

  /* Info → Payment (Combined Order Summary & Payment) */
  document.getElementById('info-form')?.addEventListener('submit', e => {
    e.preventDefault();
    customerInfo = {
      name: document.getElementById('cust-name')?.value || '',
      contact: document.getElementById('cust-contact')?.value || '',
      email: document.getElementById('cust-email')?.value || '',
      address: document.getElementById('cust-address')?.value || ''
    };
    /* Build centered review details inside payment step */
    const total = checkoutItems.reduce((s, i) => s + i.price * i.qty / 100, 0);
    let html = `<div class="confirmation-details-section"><h4><i class="fas fa-user"></i> Customer Information</h4>`;
    html += `<p><span>Name:</span> ${customerInfo.name}</p><p><span>Contact:</span> ${customerInfo.contact}</p>`;
    html += `<p><span>Email:</span> ${customerInfo.email}</p><p><span>Address:</span> ${customerInfo.address}</p></div>`;
    html += `<div class="confirmation-details-section"><h4><i class="fas fa-box"></i> Items Ordered</h4>`;
    checkoutItems.forEach(i => { html += `<p>${i.name} — ${i.qty} pcs — \u20B1${(i.price * i.qty / 100).toLocaleString()}</p>`; });
    html += `<p style="font-weight:700;margin-top:0.5rem;color:var(--primary)">Total: \u20B1${total.toLocaleString()}</p></div>`;
    document.getElementById('review-details').innerHTML = html;
    showStep('step-payment');
  });

  /* Payment → back to Info */
  document.getElementById('payment-back-btn')?.addEventListener('click', () => showStep('step-info'));

  /* GCash toggle */
  const paymentMethod = document.getElementById('payment-method');
  const gcashFields = document.getElementById('gcash-fields');
  if (paymentMethod && gcashFields) {
    paymentMethod.addEventListener('change', () => {
      gcashFields.style.display = paymentMethod.value === 'GCash' ? 'block' : 'none';
    });
  }

  /* Payment → Success */
  document.getElementById('pay-btn')?.addEventListener('click', () => {
    const method = paymentMethod?.value || 'Cash on Delivery';
    const errBox = document.getElementById('payment-error-msg');
    if (errBox) errBox.style.display = 'none';
    if (method === 'GCash') {
      const ref = document.getElementById('gcash-ref');
      const proof = document.getElementById('gcash-proof');
      if (!ref.value.trim() || !proof.files.length) { 
        if (errBox) { errBox.textContent = 'Please enter GCash reference and upload screenshot.'; errBox.style.display = 'block'; }
        return; 
      }
    }
    const btn = document.getElementById('pay-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true;
    setTimeout(() => {
      cart = []; updateCartUI(); showStep('step-success');
      btn.innerHTML = '<i class="fas fa-check"></i> Confirm Payment'; btn.disabled = false;
    }, 1500);
  });

  /* Order Again */
  document.getElementById('order-again-btn')?.addEventListener('click', () => {
    closeCheckout();
    document.getElementById('info-form')?.reset();
    if (gcashFields) gcashFields.style.display = 'none';
    checkoutItems = []; customerInfo = {};
  });


  /* --- PARTNER FORM --- */
  document.getElementById('partner-form')?.addEventListener('submit', e => {
    e.preventDefault();
    showToast('Partnership application submitted successfully!');
    e.target.reset();
  });

  /* --- VALIDATION --- */
  function validateInput(el, isValid) {
    if (!el) return;
    el.classList.toggle('is-valid', isValid);
    el.classList.toggle('is-invalid', !isValid && el.value.length > 0);
  }
  document.getElementById('cust-contact')?.addEventListener('input', e => validateInput(e.target, e.target.value.replace(/\D/g, '').length === 11 && e.target.value.replace(/\D/g, '').startsWith('09')));
  document.getElementById('gcash-ref')?.addEventListener('input', e => validateInput(e.target, e.target.value.trim().length >= 13));

  /* Init */
  updateCartUI();
  
});


