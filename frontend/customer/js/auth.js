/* ==============================================
   WeBake - Auth JavaScript (auth.js)
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  /* ── Data Store (replace with MongoDB API calls later) ── */
  const USERS_KEY = 'weBakeUsers';
  const store = {
    getAll: () => JSON.parse(localStorage.getItem(USERS_KEY) || '[]'),
    save: arr => localStorage.setItem(USERS_KEY, JSON.stringify(arr)),
    find: email => store.getAll().find(u => u.email === email),
    add: user => { const all = store.getAll(); all.push(user); store.save(all); },
    updatePassword: (email, pwd) => {
      const all = store.getAll(); const i = all.findIndex(u => u.email === email);
      if (i >= 0) { all[i].password = pwd; store.save(all); return true; } return false;
    },
    updateProfile: (email, data) => {
      const all = store.getAll(); const i = all.findIndex(u => u.email === email);
      if (i >= 0) { Object.assign(all[i], data); store.save(all); return true; } return false;
    },
    setSession: user => localStorage.setItem('weBakeSession', JSON.stringify({ name: user.name, email: user.email })),
    getSession: () => JSON.parse(localStorage.getItem('weBakeSession') || 'null'),
    clearSession: () => localStorage.removeItem('weBakeSession')
  };
  /* ── End Data Store ── */

  let otpInterval, pendingEmail = null, flowMode = null;

  if (!document.getElementById('auth-overlay')) {
    const authHtml = `
      <style>
        .auth-icon-input{position:relative}
        .auth-icon-input i.fa-lock,.auth-icon-input i.fa-envelope,.auth-icon-input i.fa-user,.auth-icon-input i.fa-phone,.auth-icon-input i.fa-map-marker-alt{position:absolute;left:1rem;top:50%;transform:translateY(-50%);color:var(--gray);font-size:.9rem}
        .auth-icon-input input{padding-left:2.5rem!important;padding-right:2.5rem!important}
        .auth-eye-toggle{position:absolute;right:1rem;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--gray);font-size:.95rem;background:none;border:none;padding:0}
        .auth-eye-toggle:hover{color:var(--dark)}
        .auth-modal-title{text-align:center;margin-bottom:.5rem;color:var(--primary);font-size:1.5rem}
        .auth-modal-subtitle{text-align:center;color:var(--gray);margin-bottom:1.5rem;font-size:.9rem}
        .auth-link{color:#6B3A2A;font-weight:600;text-decoration:none;transition:var(--ease)}
        .auth-link:hover{text-decoration:underline;color:#D4A96A}
      </style>
      <div class="overlay" id="auth-overlay" style="z-index:3000"></div>

      <!-- SIGN IN -->
      <div class="modal" id="signin-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Welcome Back</h3>
        <p class="auth-modal-subtitle">Sign in to your WeBake account</p>
        <form id="signin-form"><div class="form-group"><label>Email</label><div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" required placeholder="Enter your email"></div></div><div class="form-group"><label>Password</label><div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required placeholder="Enter your password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div></div><div class="form-group" style="text-align:right;margin-top:-.5rem"><a href="#" data-auth-open="forgot-modal" class="auth-link" style="font-size:.85rem;font-weight:500">Forgot Password?</a></div><button type="submit" class="btn btn-primary btn-block"><i class="fas fa-sign-in-alt"></i> Log In</button></form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem">Don't have an account yet? <a href="#" data-auth-open="register-modal" class="auth-link">Create one here</a></p>
      </div>

      <!-- REGISTER -->
      <div class="modal" id="register-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Create Account</h3>
        <p class="auth-modal-subtitle">Join us and enjoy freshly baked goods!</p>
        <form id="register-form">
          <div class="form-group"><label>Full Name</label><div class="auth-icon-input"><i class="fas fa-user"></i><input type="text" class="form-input" required placeholder="Juan Dela Cruz"></div></div>
          <div class="form-group"><label>Email</label><div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" required id="reg-email" placeholder="juan@gmail.com" pattern="[a-zA-Z0-9._%+\-]+@[gG][mM][aA][iI][lL]\.[cC][oO][mM]" title="Must be a valid Gmail address (@gmail.com)"></div><div class="reg-email-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;">Please enter a valid Gmail address (must end with @gmail.com)</div></div>
          <div class="form-group"><label>Contact Number</label><div class="auth-icon-input"><i class="fas fa-phone"></i><input type="tel" class="form-input" required id="reg-contact" placeholder="09XXXXXXXXX" pattern="09[0-9]{9}" maxlength="11" inputmode="numeric" title="Must start with 09 and be 11 digits long"></div><div class="reg-contact-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;">Contact number must be 11 digits starting with 09 (no letters/characters)</div></div>
          <div class="form-group"><label>Delivery Address</label><div class="auth-icon-input"><i class="fas fa-map-marker-alt"></i><input type="text" class="form-input" required id="reg-address" placeholder="123 Bakery St, City"></div></div>
          <div class="form-group">
            <label>Password</label>
            <div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required id="reg-pwd" placeholder="Create a strong password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div>
            <div class="pwd-strength" style="display:none; margin-top:0.5rem; height:4px; border-radius:2px; background:#eee; overflow:hidden;"><div class="pwd-strength-bar" style="width:0; height:100%; transition:all 0.3s;"></div></div>
            <div class="pwd-strength-text" style="display:none; font-size:0.75rem; margin-top:0.25rem; font-weight:600;"></div>
          </div>
          <div class="form-group">
            <label>Confirm Password</label>
            <div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required id="reg-cpwd" placeholder="Confirm your password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div>
            <div class="cpwd-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;">Passwords do not match</div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="reg-submit-btn"><i class="fas fa-user-plus"></i> Register Account</button>
        </form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem">Already have an account? <a href="#" data-auth-open="signin-modal" class="auth-link">Sign In</a></p>
      </div>

      <!-- FORGOT PASSWORD -->
      <div class="modal" id="forgot-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Reset Password</h3>
        <p class="auth-modal-subtitle">Enter your email to receive an OTP.</p>
        <form id="forgot-form"><div class="form-group"><label>Email</label><div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" required placeholder="Enter your registered email"></div></div><button type="submit" class="btn btn-primary btn-block"><i class="fas fa-paper-plane"></i> Send OTP</button></form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem">Remember your password? <a href="#" data-auth-open="signin-modal" class="auth-link">Return to Sign In</a></p>
      </div>

      <!-- OTP VERIFICATION -->
      <div class="modal" id="otp-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <div style="text-align:center;font-size:2.5rem;color:var(--accent);margin-bottom:1rem"><i class="fas fa-envelope-open-text"></i></div>
        <h3 class="auth-modal-title" style="margin-bottom:.25rem">Verify Email</h3>
        <p class="auth-modal-subtitle">Enter the 6‑digit code sent to <br><strong id="otp-email-display" style="color:var(--dark)"></strong></p>
        <form id="otp-form">
          <div class="form-group otp-inputs" id="otpInputs" style="display:flex;gap:0.5rem;justify-content:center;margin-bottom:1.5rem">
            <input class="otp-input form-input" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code" required style="width:3rem;height:3.5rem;text-align:center;font-size:1.5rem;font-weight:600;padding:0">
            <input class="otp-input form-input" type="text" inputmode="numeric" maxlength="1" required style="width:3rem;height:3.5rem;text-align:center;font-size:1.5rem;font-weight:600;padding:0">
            <input class="otp-input form-input" type="text" inputmode="numeric" maxlength="1" required style="width:3rem;height:3.5rem;text-align:center;font-size:1.5rem;font-weight:600;padding:0">
            <input class="otp-input form-input" type="text" inputmode="numeric" maxlength="1" required style="width:3rem;height:3.5rem;text-align:center;font-size:1.5rem;font-weight:600;padding:0">
            <input class="otp-input form-input" type="text" inputmode="numeric" maxlength="1" required style="width:3rem;height:3.5rem;text-align:center;font-size:1.5rem;font-weight:600;padding:0">
            <input class="otp-input form-input" type="text" inputmode="numeric" maxlength="1" required style="width:3rem;height:3.5rem;text-align:center;font-size:1.5rem;font-weight:600;padding:0">
          </div>
          <button type="submit" class="btn btn-primary btn-block"><i class="fas fa-check-circle"></i> Verify</button>
        </form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem;color:var(--gray)"><span id="otp-timer-wrap">Resend code in <strong id="otp-timer">30</strong>s</span> <a href="#" id="otp-resend-btn" class="auth-link" style="display:none"><i class="fas fa-redo-alt"></i> Resend OTP</a></p>
      </div>

      <!-- RESET PASSWORD -->
      <div class="modal" id="reset-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Set New Password</h3>
        <p class="auth-modal-subtitle">Enter and confirm your new password.</p>
        <form id="reset-form">
          <div class="form-group">
            <label>New Password</label>
            <div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required id="reset-pwd" placeholder="New password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div>
            <div class="pwd-strength" style="display:none; margin-top:0.5rem; height:4px; border-radius:2px; background:#eee; overflow:hidden;"><div class="pwd-strength-bar" style="width:0; height:100%; transition:all 0.3s;"></div></div>
            <div class="pwd-strength-text" style="display:none; font-size:0.75rem; margin-top:0.25rem; font-weight:600;"></div>
          </div>
          <div class="form-group">
            <label>Confirm Password</label>
            <div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required id="reset-cpwd" placeholder="Confirm password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div>
            <div class="cpwd-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;">Passwords do not match</div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="reset-submit-btn"><i class="fas fa-save"></i> Save Password</button>
        </form>
      </div>

      <!-- TRACK TRANSACTIONS MODAL -->
      <div class="modal" id="track-order-modal" style="z-index:3001;padding:2rem;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title" style="margin-bottom:0.25rem;"><i class="fas fa-search-dollar"></i> Track Transactions</h3>
        <p class="auth-modal-subtitle" style="margin-bottom:1.25rem;">Look up bread delivery orders, 50% downpayments, refunds, or wholesale partnership applications in real-time.</p>
        
        <!-- Track Mode Tabs -->
        <div class="track-tab-wrap" style="display:flex; gap:0.5rem; margin-bottom:1.25rem; background:#f5f0eb; padding:4px; border-radius:8px;">
          <button type="button" class="btn btn-sm track-tab-btn" id="tab-btn-orders" style="flex:1; border-radius:6px; font-weight:600; font-size:0.85rem; padding:0.55rem; border:none; transition:all 0.2s; background:var(--primary); color:#fff; cursor:pointer;">
            <i class="fas fa-bread-slice"></i> Bread Orders
          </button>
          <button type="button" class="btn btn-sm track-tab-btn" id="tab-btn-partner" style="flex:1; border-radius:6px; font-weight:600; font-size:0.85rem; padding:0.55rem; border:none; transition:all 0.2s; background:transparent; color:#666; cursor:pointer;">
            <i class="fas fa-handshake"></i> Partnership Applications
          </button>
        </div>

        <form id="track-order-form" style="margin-bottom:1rem;">
          <input type="hidden" id="track-type-mode" value="order">
          <div class="form-group" style="text-align:left;">
            <label id="track-label-id" style="font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:0.45rem;margin-bottom:0.35rem;color:var(--dark);">
              <i class="fas fa-receipt" style="color:var(--primary);font-size:0.95rem;"></i> Order ID *
            </label>
            <input type="text" class="form-input" id="track-input-id" required placeholder="e.g. WB-84920" style="text-transform:uppercase;">
          </div>
          <div class="form-group" style="text-align:left;">
            <label id="track-label-contact" style="font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:0.45rem;margin-bottom:0.35rem;color:var(--dark);">
              <i class="fas fa-address-card" style="color:var(--primary);font-size:0.95rem;"></i> Email or Contact Number *
            </label>
            <input type="text" class="form-input" id="track-input-contact" required placeholder="Email or phone used at checkout">
          </div>
          <div id="track-error-msg" style="display:none; color:var(--danger); background:rgba(220,53,69,0.1); padding:0.6rem; border-radius:var(--radius); font-size:0.85rem; text-align:center; margin-bottom:0.75rem;"></div>
          <button type="submit" class="btn btn-primary btn-block" id="track-submit-btn"><i class="fas fa-search"></i> Check Order Status</button>
        </form>

        <div id="track-result-container" style="display:none; text-align:left;"></div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', authHtml);
  }

  // ---------- Password Strength & Matching Logic ----------
  function checkStrength(pwd) {
    let strength = 0;
    if (pwd.length >= 6) strength += 25;
    if (pwd.length >= 10) strength += 25;
    if (/[A-Z]/.test(pwd)) strength += 25;
    if (/[0-9!@#$%^&*]/.test(pwd)) strength += 25;
    return strength;
  }
  
  function updatePwdUI(formId, pwdId, cpwdId, submitId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const pwdInput = document.getElementById(pwdId);
    const cpwdInput = document.getElementById(cpwdId);
    
    const strengthBar = form.querySelector('.pwd-strength-bar');
    const strengthText = form.querySelector('.pwd-strength-text');
    const strengthWrap = form.querySelector('.pwd-strength');
    const cpwdError = form.querySelector('.cpwd-error');
    const submitBtn = document.getElementById(submitId);
    
    function validate() {
      const pwd = pwdInput.value;
      const cpwd = cpwdInput.value;
      
      // Strength
      if (pwd) {
        strengthWrap.style.display = 'block';
        strengthText.style.display = 'block';
        const score = checkStrength(pwd);
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
      } else {
        strengthWrap.style.display = 'none';
        strengthText.style.display = 'none';
      }
      
      // Match
      if (cpwd) {
        if (pwd !== cpwd) {
          cpwdError.style.display = 'block';
          if(submitBtn) submitBtn.disabled = true;
        } else {
          cpwdError.style.display = 'none';
          if(submitBtn) submitBtn.disabled = (pwd.length < 6);
        }
      } else {
        cpwdError.style.display = 'none';
        if(submitBtn) submitBtn.disabled = false;
      }
    }
    
    if (pwdInput) pwdInput.addEventListener('input', validate);
    if (cpwdInput) cpwdInput.addEventListener('input', validate);
  }
  
  updatePwdUI('register-form', 'reg-pwd', 'reg-cpwd', 'reg-submit-btn');
  updatePwdUI('reset-form', 'reset-pwd', 'reset-cpwd', 'reset-submit-btn');

  // Register Form Live Validation
  const regEmailInput = document.getElementById('reg-email');
  const regEmailErr = document.querySelector('.reg-email-error');
  regEmailInput?.addEventListener('input', e => {
    const val = e.target.value.trim();
    const valid = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(val);
    e.target.classList.toggle('is-valid', valid);
    e.target.classList.toggle('is-invalid', !valid && val.length > 0);
    if (regEmailErr) regEmailErr.style.display = (!valid && val.length > 0) ? 'block' : 'none';
  });

  const regContactInput = document.getElementById('reg-contact');
  const regContactErr = document.querySelector('.reg-contact-error');
  regContactInput?.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
    const valid = e.target.value.length === 11 && e.target.value.startsWith('09');
    e.target.classList.toggle('is-valid', valid);
    e.target.classList.toggle('is-invalid', !valid && e.target.value.length > 0);
    if (regContactErr) regContactErr.style.display = (!valid && e.target.value.length > 0) ? 'block' : 'none';
  });

  // Ensure toast element exists on all pages
  if (!document.getElementById('toast')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');
  }

  const authOverlay = document.getElementById('auth-overlay');
  updateNavState();
  autoFillCheckoutForm();

  function openAuthModal(id) {
    document.querySelectorAll('#signin-modal,#register-modal,#forgot-modal,#otp-modal,#reset-modal,#track-order-modal')
      .forEach(m => m.classList.remove('active'));
    authOverlay.classList.add('active');
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
    
    // Auto-focus first input
    setTimeout(() => {
      const firstInput = modal.querySelector('input');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function closeAuthModals() {
    document.querySelectorAll('#signin-modal,#register-modal,#forgot-modal,#otp-modal,#reset-modal,#track-order-modal')
      .forEach(m => m.classList.remove('active'));
    authOverlay.classList.remove('active');
    clearInterval(otpInterval);
  }

  // ---------- Nav State (logged in / logged out) ----------
  function updateNavState() {
    const s = store.getSession();
    const navLinks = document.getElementById('nav-links');
    if (navLinks) {
      if (!navLinks.querySelector('#nav-track-order')) {
        const trackLink = document.createElement('a');
        trackLink.href = '#';
        trackLink.id = 'nav-track-order';
        trackLink.innerHTML = '<i class="fas fa-search-dollar"></i> Track Transactions';
        trackLink.setAttribute('data-track-order-open', 'true');
        navLinks.appendChild(trackLink);
      }
      if (!navLinks.querySelector('.nav-auth-mobile')) {
        navLinks.insertAdjacentHTML('beforeend', '<div class="nav-auth-divider"></div><div class="nav-auth-mobile"></div>');
      }
    }
    const db = document.querySelector('.auth-buttons');
    const mb = document.querySelector('.nav-auth-mobile');
    if (s) {
      const inner = `<a href="dashboard.html" class="btn btn-outline btn-sm"><i class="fas fa-user-circle"></i> Profile</a><a href="#" id="logout-btn" class="btn btn-danger-outline btn-sm"><i class="fas fa-sign-out-alt"></i> Log Out</a>`;
      if (db) db.innerHTML = inner;
      if (mb) mb.innerHTML = inner.replace('id="logout-btn"', 'id="logout-btn-mobile"');
    } else {
      if (db) db.innerHTML = `<a href="#" class="btn btn-outline btn-sm">Sign In</a><a href="#" class="btn btn-primary btn-sm">Register</a>`;
      if (mb) mb.innerHTML = `<a href="#" class="btn btn-outline btn-sm auth-mobile-btn">Sign In</a><a href="#" class="btn btn-primary btn-sm auth-mobile-btn">Register</a>`;
    }
  }

  // ---------- Auto-fill Products page checkout form ----------
  function autoFillCheckoutForm() {
    const s = store.getSession(); if (!s) return;
    const u = store.find(s.email); if (!u) return;
    const f = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    f('cust-name', u.name); f('cust-contact', u.contact); f('cust-email', u.email); f('cust-address', u.address);
  }

  // ---------- Track Transactions (Orders & Applications) Hub ----------
  function setTrackTab(mode) {
    const modeInput = document.getElementById('track-type-mode');
    const tabOrders = document.getElementById('tab-btn-orders');
    const tabPartner = document.getElementById('tab-btn-partner');
    const labelId = document.getElementById('track-label-id');
    const inputId = document.getElementById('track-input-id');
    const labelContact = document.getElementById('track-label-contact');
    const inputContact = document.getElementById('track-input-contact');
    const submitBtn = document.getElementById('track-submit-btn');
    const errBox = document.getElementById('track-error-msg');
    const resBox = document.getElementById('track-result-container');

    if (errBox) errBox.style.display = 'none';
    if (resBox) { resBox.style.display = 'none'; resBox.innerHTML = ''; }

    if (mode === 'partner') {
      if (modeInput) modeInput.value = 'partner';
      if (tabOrders) { tabOrders.style.background = 'transparent'; tabOrders.style.color = '#666'; }
      if (tabPartner) { tabPartner.style.background = 'var(--primary)'; tabPartner.style.color = '#fff'; }
      if (labelId) labelId.innerHTML = '<i class="fas fa-id-badge" style="color:var(--primary);font-size:0.95rem;"></i> Partner Reference ID *';
      if (inputId) { inputId.placeholder = 'e.g. WB-PRT-58291'; }
      if (labelContact) labelContact.innerHTML = '<i class="fas fa-address-card" style="color:var(--primary);font-size:0.95rem;"></i> Business Email or Contact Number *';
      if (inputContact) { inputContact.placeholder = 'Email or phone used in application'; }
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-search"></i> Check Application Status';
    } else {
      if (modeInput) modeInput.value = 'order';
      if (tabOrders) { tabOrders.style.background = 'var(--primary)'; tabOrders.style.color = '#fff'; }
      if (tabPartner) { tabPartner.style.background = 'transparent'; tabPartner.style.color = '#666'; }
      if (labelId) labelId.innerHTML = '<i class="fas fa-receipt" style="color:var(--primary);font-size:0.95rem;"></i> Order ID *';
      if (inputId) { inputId.placeholder = 'e.g. WB-84920'; }
      if (labelContact) labelContact.innerHTML = '<i class="fas fa-address-card" style="color:var(--primary);font-size:0.95rem;"></i> Email or Contact Number *';
      if (inputContact) { inputContact.placeholder = 'Email or phone used at checkout'; }
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-search"></i> Check Order Status';
    }
  }

  window.openTrackOrderModal = function(id = '', contact = '', mode = 'order') {
    openAuthModal('track-order-modal');
    setTrackTab(mode);
    const idInput = document.getElementById('track-input-id');
    const contactInput = document.getElementById('track-input-contact');
    const errBox = document.getElementById('track-error-msg');
    const resBox = document.getElementById('track-result-container');
    if (errBox) errBox.style.display = 'none';
    if (resBox) { resBox.style.display = 'none'; resBox.innerHTML = ''; }
    if (idInput && id) idInput.value = id;
    if (contactInput && contact) contactInput.value = contact;
    if (id && contact) {
      setTimeout(() => {
        document.getElementById('track-order-form')?.dispatchEvent(new Event('submit'));
      }, 150);
    }
  };

  function findOrderRecord(enteredId, enteredContact) {
    let allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
    let found = allOrders.find(o => o.orderId && o.orderId.toUpperCase() === enteredId);

    if (!found) {
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      for (const u of allUsers) {
        if (u.orderHistory) {
          const match = u.orderHistory.find(o => o.orderId && o.orderId.toUpperCase() === enteredId);
          if (match) {
            found = match;
            if (!found.customer) found.customer = { name: u.name, email: u.email, contact: u.contact, address: u.address };
            break;
          }
        }
      }
    }

    if (found) {
      const cleanEnteredContact = enteredContact.replace(/\D/g, '');
      const cleanCustomerContact = (found?.customer?.contact || '').replace(/\D/g, '');
      const emailMatch = found?.customer?.email && found.customer.email.toLowerCase() === enteredContact;
      const phoneMatch = cleanEnteredContact.length >= 7 && cleanCustomerContact.includes(cleanEnteredContact);
      if (emailMatch || phoneMatch || found.orderId.toUpperCase() === enteredId) {
        return found;
      }
    }
    return null;
  }

  function findPartnerRecord(enteredId, enteredContact) {
    const allApps = JSON.parse(localStorage.getItem('weBakePartnerApplications') || '[]');
    let foundApp = allApps.find(a => a.appId && a.appId.toUpperCase() === enteredId);

    if (!foundApp) {
      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      for (const u of allUsers) {
        if (u.partnerDetails && u.partnerStatus && u.partnerStatus !== 'none') {
          const matchesId = u.partnerAppId && u.partnerAppId.toUpperCase() === enteredId;
          const matchesEmail = u.email && u.email.toLowerCase() === enteredContact;
          const matchesPhone = u.contact && u.contact.replace(/\D/g, '') === enteredContact.replace(/\D/g, '');
          if (matchesId || matchesEmail || matchesPhone) {
            foundApp = {
              appId: u.partnerAppId || ('WB-PRT-' + Math.floor(10000 + Math.random() * 90000)),
              date: 'Recently Submitted',
              status: u.partnerStatus,
              details: u.partnerDetails
            };
            break;
          }
        }
      }
    }

    if (foundApp) {
      const appEmail = (foundApp.details?.email || '').toLowerCase();
      const appPhone = (foundApp.details?.phone || '').replace(/\D/g, '');
      const cleanEnteredContact = enteredContact.replace(/\D/g, '');
      const emailMatch = appEmail && (appEmail === enteredContact);
      const phoneMatch = cleanEnteredContact.length >= 7 && appPhone.includes(cleanEnteredContact);
      if (emailMatch || phoneMatch || (foundApp.appId && foundApp.appId.toUpperCase() === enteredId)) {
        return foundApp;
      }
    }
    return null;
  }

  document.getElementById('track-order-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const idInput = document.getElementById('track-input-id');
    const contactInput = document.getElementById('track-input-contact');
    const errBox = document.getElementById('track-error-msg');
    const resBox = document.getElementById('track-result-container');
    const currentMode = document.getElementById('track-type-mode')?.value || 'order';

    const enteredId = idInput?.value.trim().toUpperCase();
    const enteredContact = contactInput?.value.trim().toLowerCase();

    if (!enteredId || !enteredContact) return;

    // Smart Lookup: Auto-detect if user entered a Partner ID or Order ID
    const isPartnerQuery = (currentMode === 'partner') || enteredId.startsWith('WB-PRT') || enteredId.includes('PRT');

    if (isPartnerQuery) {
      const app = findPartnerRecord(enteredId, enteredContact);
      if (app) {
        if (errBox) errBox.style.display = 'none';
        setTrackTab('partner');
        renderTrackPartnerResult(app, resBox);
        return;
      }
      // Smart Fallback: check if it's an order instead
      const order = findOrderRecord(enteredId, enteredContact);
      if (order) {
        if (errBox) errBox.style.display = 'none';
        setTrackTab('order');
        renderTrackOrderResult(order, resBox);
        return;
      }

      if (errBox) {
        errBox.textContent = 'No matching partnership application found. Please verify your Reference ID (e.g. WB-PRT-XXXXX) and registered email or phone.';
        errBox.style.display = 'block';
      }
      if (resBox) resBox.style.display = 'none';
      return;
    }

    // Default: Bread Orders lookup
    const order = findOrderRecord(enteredId, enteredContact);
    if (order) {
      if (errBox) errBox.style.display = 'none';
      setTrackTab('order');
      renderTrackOrderResult(order, resBox);
      return;
    }

    // Smart Fallback: check if user entered a partner application on the order tab
    const app = findPartnerRecord(enteredId, enteredContact);
    if (app) {
      if (errBox) errBox.style.display = 'none';
      setTrackTab('partner');
      renderTrackPartnerResult(app, resBox);
      return;
    }

    if (errBox) {
      errBox.textContent = 'No matching order found. Please verify your Order ID and the email or phone number used at checkout.';
      errBox.style.display = 'block';
    }
    if (resBox) resBox.style.display = 'none';
  });

  function renderTrackOrderResult(order, resBox) {
    if (!resBox) return;

    let statusText = 'Pending Downpayment Verification';
    let statusBg = '#fff3cd';
    let statusColor = '#856404';

    if (order.status === 'completed') {
      statusText = 'Completed';
      statusBg = '#d4edda';
      statusColor = '#155724';
    } else if (order.status === 'cancelled') {
      statusText = 'Cancelled & Refunded';
      statusBg = '#f8d7da';
      statusColor = '#721c24';
    } else if (order.status === 'cancellation_requested') {
      statusText = 'Cancellation & Refund Requested';
      statusBg = '#ffe8d6';
      statusColor = '#a73a00';
    } else if (order.status === 'preparing' || order.status === 'in_production') {
      statusText = 'In Production / Baking';
      statusBg = '#cce5ff';
      statusColor = '#004085';
    } else if (order.status === 'delivery') {
      statusText = 'Out for Delivery';
      statusBg = '#e2d9f3';
      statusColor = '#4a154b';
    }

    const downpayment = order.downpayment !== undefined ? order.downpayment : Math.round(order.total * 0.5);
    const balance = order.balance !== undefined ? order.balance : (order.total - downpayment);
    const method = order.paymentMethod || 'GCash';
    const refNo = order.referenceNumber ? `(Ref: ${order.referenceNumber})` : '';

    let itemsHtml = `
      <div style="font-size:0.75rem; font-weight:bold; padding: 4px 0; display:flex; justify-content:space-between; color:#666; border-bottom: 1px solid #ddd;">
        <span style="flex:1;">Product Name</span>
        <span style="flex:1; text-align:center;">Bundle(pcs)</span>
        <span style="flex:1; text-align:right;">Price</span>
      </div>
    ` + (order.items || []).map(i => {
      return `<div style="font-size:0.8rem; padding: 4px 0; display:flex; justify-content:space-between; border-bottom: 1px dashed #eee;">
                <span style="flex:1;">${i.name}</span>
                <span style="flex:1; text-align:center;">${i.qty} Bundle(${i.qty * (i.min || 100)} pcs)</span>
                <span style="flex:1; text-align:right;">\u20B1${(i.price * i.qty).toLocaleString()}</span>
              </div>`;
    }).join('');

    let refundSectionHtml = '';
    if (order.status === 'pending') {
      refundSectionHtml = `
        <div style="background:#e8f5e9; border:1px solid #c8e6c9; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#2e7d32;">
          <i class="fas fa-check-circle"></i> <strong>Eligible for 100% Downpayment Refund:</strong> Baking has not started yet. You may cancel this order and receive a full \u20B1${downpayment.toLocaleString()} refund.
        </div>
        <button type="button" class="btn btn-outline btn-sm btn-block" id="btn-toggle-refund-form" style="margin-top:0.5rem; color:#dc3545; border-color:#dc3545;">
          <i class="fas fa-undo"></i> Request Cancellation & Downpayment Refund
        </button>
        <div id="refund-form-card" style="display:none; background:#fff; border:1px solid #ebd9c8; border-radius:6px; padding:0.85rem; margin-top:0.65rem;">
          <h5 style="margin-bottom:0.5rem; color:var(--primary); font-size:0.88rem;"><i class="fas fa-money-bill-wave"></i> Downpayment Refund Request</h5>
          <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-question-circle" style="color:var(--primary);"></i> Reason for Cancellation *</label>
            <select class="form-select" id="refund-select-reason" style="font-size:0.82rem; padding:0.4rem;">
              <option>Change of plans / Event cancelled</option>
              <option>Accidental or duplicate order</option>
              <option>Ordered wrong items or quantity</option>
              <option>Found another supplier</option>
              <option>Other</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-wallet" style="color:var(--primary);"></i> Refund To (E-Wallet) *</label>
            <select class="form-select" id="refund-select-wallet" style="font-size:0.82rem; padding:0.4rem;">
              <option value="GCash" ${method === 'GCash' ? 'selected' : ''}>GCash</option>
              <option value="PayMaya" ${method === 'PayMaya' ? 'selected' : ''}>PayMaya / Maya</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-mobile-alt" style="color:var(--primary);"></i> Account Number to Receive Refund *</label>
            <input type="tel" class="form-input" id="refund-input-number" value="${order.customer?.contact || ''}" placeholder="09XXXXXXXXX" style="font-size:0.82rem; padding:0.4rem;">
          </div>
          <div class="form-group" style="margin-bottom:0.75rem;">
            <label style="font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:0.35rem;"><i class="fas fa-user" style="color:var(--primary);"></i> Account Name *</label>
            <input type="text" class="form-input" id="refund-input-name" value="${order.customer?.name || ''}" placeholder="Name on GCash / Maya" style="font-size:0.82rem; padding:0.4rem;">
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-block" id="btn-submit-refund-action" style="background:#dc3545; border-color:#dc3545;">
            Confirm & Request \u20B1${downpayment.toLocaleString()} Refund
          </button>
        </div>
      `;
    } else if (order.status === 'cancellation_requested') {
      refundSectionHtml = `
        <div style="background:#fff3cd; border:1px solid #ffeeba; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#856404;">
          <i class="fas fa-clock"></i> <strong>Cancellation & Refund in Progress:</strong> We received your request to cancel this order and refund <strong>\u20B1${downpayment.toLocaleString()}</strong> to your ${order.refundDetails?.wallet || 'E-Wallet'} (${order.refundDetails?.accountNum || ''}). Our bakery team is reviewing and will credit your refund within 24 hours.
        </div>
      `;
    } else if (order.status === 'cancelled') {
      refundSectionHtml = `
        <div style="background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#721c24;">
          <i class="fas fa-check-circle"></i> <strong>Order Cancelled:</strong> This order has been cancelled and the downpayment refund processed.
        </div>
      `;
    } else {
      refundSectionHtml = `
        <div style="background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; padding:0.75rem; margin-top:0.75rem; font-size:0.82rem; color:#721c24;">
          <i class="fas fa-ban"></i> <strong>Cancellation Closed:</strong> This order is already in production/delivery. Per bakery policy for perishable goods, downpayments cannot be refunded once ingredients and dough preparation have commenced.
        </div>
      `;
    }

    resBox.innerHTML = `
      <div style="border:1px solid var(--border); border-radius:8px; padding:1rem; background:#fff; margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span style="font-size:0.75rem; color:var(--gray); text-transform:uppercase; font-weight:700;">Order ID</span>
            <div style="font-size:1.15rem; font-weight:800; color:var(--primary);">${order.orderId}</div>
            <div style="font-size:0.78rem; color:#888;"><i class="far fa-calendar-alt"></i> ${order.date}</div>
          </div>
          <span style="padding:0.25rem 0.65rem; border-radius:20px; font-size:0.78rem; font-weight:700; background:${statusBg}; color:${statusColor};">
            ${statusText}
          </span>
        </div>

        <div style="font-size:0.82rem; color:#555; margin-bottom:0.75rem; padding-bottom:0.5rem; border-bottom:1px solid #eee;">
          <div><strong>Customer:</strong> ${order.customer?.name || 'Customer'} (${order.customer?.contact || ''})</div>
          <div><strong>Delivery Address:</strong> ${order.customer?.address || 'N/A'}</div>
        </div>

        <div style="margin-bottom:0.75rem;">
          ${itemsHtml}
        </div>

        <div style="background:#faf6f3; border:1px dashed #ebd9c8; border-radius:6px; padding:0.65rem 0.85rem; font-size:0.85rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
            <span style="color:#666;">Total Order Value:</span>
            <strong>\u20B1${order.total.toLocaleString()}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:3px; color:#28a745;">
            <span><i class="fas fa-check-circle"></i> 50% Downpayment (${method} ${refNo}):</span>
            <strong>\u20B1${downpayment.toLocaleString()}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--primary); font-weight:700; border-top:1px dashed #ebd9c8; padding-top:4px; margin-top:4px;">
            <span><i class="fas fa-truck"></i> Remaining Balance Upon Delivery:</span>
            <span>\u20B1${balance.toLocaleString()}</span>
          </div>
        </div>

        ${refundSectionHtml}
      </div>
    `;

    resBox.style.display = 'block';

    document.getElementById('btn-toggle-refund-form')?.addEventListener('click', () => {
      const card = document.getElementById('refund-form-card');
      if (card) card.style.display = card.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btn-submit-refund-action')?.addEventListener('click', () => {
      const reason = document.getElementById('refund-select-reason')?.value;
      const wallet = document.getElementById('refund-select-wallet')?.value;
      const accountNum = document.getElementById('refund-input-number')?.value.trim();
      const accountName = document.getElementById('refund-input-name')?.value.trim();

      if (!accountNum) {
        showToast('Please enter your ' + wallet + ' account number for refund.');
        return;
      }

      if (!confirm(`Are you sure you want to request cancellation for order ${order.orderId}?\n\nDownpayment of ₱${downpayment.toLocaleString()} will be refunded to your ${wallet} account (${accountNum}).`)) {
        return;
      }

      const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
      const targetO = allOrders.find(o => o.orderId === order.orderId);
      const refundData = {
        reason: reason,
        wallet: wallet,
        accountNum: accountNum,
        accountName: accountName,
        requestedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      };

      if (targetO) {
        targetO.status = 'cancellation_requested';
        targetO.refundDetails = refundData;
        localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders));
      }

      const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
      let updatedUser = false;
      for (const u of allUsers) {
        if (u.orderHistory) {
          const match = u.orderHistory.find(o => o.orderId === order.orderId);
          if (match) {
            match.status = 'cancellation_requested';
            match.refundDetails = refundData;
            updatedUser = true;
          }
        }
      }
      if (updatedUser) localStorage.setItem('weBakeUsers', JSON.stringify(allUsers));

      order.status = 'cancellation_requested';
      order.refundDetails = refundData;
      showToast('Cancellation & refund request submitted successfully.');
      renderTrackOrderResult(order, resBox);
    });
  }

  function renderTrackPartnerResult(app, resBox) {
    if (!resBox) return;

    let statusText = 'Under Review (Pending)';
    let statusBg = '#fff3cd';
    let statusColor = '#856404';
    let statusIcon = 'fa-clock';

    if (app.status === 'approved' || app.status === 'active') {
      statusText = 'Approved — Wholesale Partner Active';
      statusBg = '#d4edda';
      statusColor = '#155724';
      statusIcon = 'fa-check-circle';
    } else if (app.status === 'rejected' || app.status === 'declined') {
      statusText = 'Application Declined';
      statusBg = '#f8d7da';
      statusColor = '#721c24';
      statusIcon = 'fa-times-circle';
    }

    const details = app.details || {};
    const productsList = (details.products && details.products.length) ? details.products.join(', ') : 'All Products';

    resBox.innerHTML = `
      <div style="border:1px solid var(--border); border-radius:8px; padding:1.25rem; background:#fff; margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span style="font-size:0.75rem; color:var(--gray); text-transform:uppercase; font-weight:700;">Partnership Application ID</span>
            <div style="font-size:1.15rem; font-weight:800; color:var(--primary);">${app.appId}</div>
            <div style="font-size:0.78rem; color:#888;"><i class="far fa-calendar-alt"></i> Submitted: ${app.date || 'Recent'}</div>
          </div>
          <span style="padding:0.25rem 0.65rem; border-radius:20px; font-size:0.78rem; font-weight:700; background:${statusBg}; color:${statusColor}; display:inline-flex; align-items:center; gap:0.35rem;">
            <i class="fas ${statusIcon}"></i> ${statusText}
          </span>
        </div>

        <div style="background:#faf6f0; border:1px solid #ebd9c8; border-radius:6px; padding:0.85rem; font-size:0.83rem; margin-bottom:0.85rem; line-height:1.6;">
          <div><strong>Bakery / Business Name:</strong> ${details['bakery-name'] || 'N/A'}</div>
          <div><strong>Representative:</strong> ${details['owner-name'] || 'N/A'}</div>
          <div><strong>Business Type:</strong> ${details.type || 'Bakery'} (${details.years || '0'} years in operation)</div>
          <div><strong>Business Address:</strong> ${details.address || 'N/A'}</div>
          <div><strong>Contact Info:</strong> ${details.phone || 'N/A'} · ${details.email || 'N/A'}</div>
          <div><strong>Products of Interest:</strong> ${productsList}</div>
          ${details.permit ? `<div><strong>Business Permit:</strong> ${details.permit}</div>` : ''}
          ${details.tin ? `<div><strong>TIN:</strong> ${details.tin}</div>` : ''}
        </div>

        <div style="font-size:0.82rem; color:#555; background:#f9f9f9; border-left:3px solid var(--primary); padding:0.65rem 0.85rem; border-radius:0 4px 4px 0; line-height:1.5;">
          <strong><i class="fas fa-info-circle" style="color:var(--primary);"></i> Next Steps:</strong><br>
          ${app.status === 'approved' || app.status === 'active' 
            ? 'Congratulations! Your wholesale partnership is active. You may now place orders with your partner privileges and bulk terms.' 
            : 'Our bakery management team is reviewing your business profile and location. We will contact you directly within 24–48 hours to finalize supply terms.'}
        </div>
      </div>
    `;

    resBox.style.display = 'block';
  }

  // ---------- Global Click Handler ----------
  document.body.addEventListener('click', e => {
    // Tab switching for Track Transactions modal
    if (e.target.closest('#tab-btn-orders')) {
      e.preventDefault();
      setTrackTab('order');
    }
    if (e.target.closest('#tab-btn-partner')) {
      e.preventDefault();
      setTrackTab('partner');
    }
    // Eye toggle
    const toggle = e.target.closest('.auth-eye-toggle');
    if (toggle) {
      e.preventDefault();
      const input = toggle.parentElement.querySelector('input');
      const icon = toggle.querySelector('i');
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      icon.classList.toggle('fa-eye', !hidden); icon.classList.toggle('fa-eye-slash', hidden);
    }
    // Track Order link clicked
    if (e.target.closest('[data-track-order-open]')) {
      e.preventDefault();
      window.openTrackOrderModal();
    }
    // Open modal
    if (e.target.closest('[data-auth-open]')) { e.preventDefault(); openAuthModal(e.target.closest('[data-auth-open]').getAttribute('data-auth-open')); }
    // Close modal
    if (e.target.matches('[data-auth-close]') || e.target.id === 'auth-overlay') closeAuthModals();
    // OTP resend
    if (e.target.closest('#otp-resend-btn')) { e.preventDefault(); generateOtp(pendingEmail); startOtpTimer(); }
    // Sign In / Register buttons (desktop + mobile)
    const authBtn = e.target.closest('.auth-buttons a, .auth-mobile-btn');
    if (authBtn && (authBtn.textContent.includes('Sign In') || authBtn.textContent.includes('Register'))) {
      e.preventDefault(); 
      openAuthModal(authBtn.textContent.includes('Sign In') ? 'signin-modal' : 'register-modal'); 
    }
    // Log Out
    if (e.target.closest('#logout-btn, #logout-btn-mobile')) {
      e.preventDefault();
      store.clearSession();
      showToast('You\'ve been signed out. See you again! 👋');
      setTimeout(() => { window.location.href = 'home.html'; }, 1500);
    }
  });

  // ---------- Sign In ----------
  document.getElementById('signin-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = e.target.querySelectorAll('input');
    const email = inputs[0].value.trim();
    const pwd = inputs[1].value;
    const user = store.find(email);
    if (!user) { showToast('No account found for this email'); return; }
    if (user.password !== pwd) { showToast('Incorrect password'); return; }
    store.setSession(user);
    showToast(`Welcome back, ${user.name}! 🎉`);
    closeAuthModals(); updateNavState(); autoFillCheckoutForm();
  });

  // ---------- Register ----------
  document.getElementById('register-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const pwd = document.getElementById('reg-pwd').value;
    const cpwd = document.getElementById('reg-cpwd').value;
    const contact = (document.getElementById('reg-contact')?.value || '').trim().replace(/\D/g, '');

    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email)) {
      showToast('Please enter a valid Gmail address (must end with @gmail.com)');
      document.getElementById('reg-email')?.focus();
      return;
    }
    if (contact.length !== 11 || !contact.startsWith('09')) {
      showToast('Contact number must be 11 digits starting with 09 (no letters or characters)');
      document.getElementById('reg-contact')?.focus();
      return;
    }
    if (store.find(email)) { showToast('An account with this email already exists'); return; }
    if (pwd.length < 6) { showToast('Password must be at least 6 characters'); return; }
    if (pwd !== cpwd) { showToast('Passwords do not match'); return; }
    pendingEmail = email; flowMode = 'register';
    generateOtp(email); openAuthModal('otp-modal'); startOtpTimer();
  });

  // ---------- Forgot Password ----------
  document.getElementById('forgot-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value.trim();
    if (!email) { showToast('Please enter your email address'); return; }
    if (!store.find(email)) { showToast('No account found for this email'); return; }
    pendingEmail = email; flowMode = 'forgot';
    generateOtp(email); openAuthModal('otp-modal'); startOtpTimer();
  });

  // ---------- OTP ----------
  document.getElementById('otp-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const entered = Array.from(e.target.querySelectorAll('.otp-input')).map(i => i.value).join('');
    if (entered !== sessionStorage.getItem('tmpOtp')) { showToast('Invalid OTP code'); return; }
    clearInterval(otpInterval); sessionStorage.removeItem('tmpOtp');
    if (flowMode === 'register') {
      const name = document.querySelector('#register-form input[placeholder="Juan Dela Cruz"]').value.trim();
      const pwd = document.getElementById('reg-pwd').value;
      const contact = document.getElementById('reg-contact').value.trim();
      const address = document.getElementById('reg-address').value.trim();
      store.add({ name, email: pendingEmail, password: pwd, contact: contact, address: address, savedCart: [], orderHistory: [], partnerStatus: 'none' });
      showToast('Account created successfully!'); closeAuthModals(); openAuthModal('signin-modal');
    } else if (flowMode === 'forgot') { openAuthModal('reset-modal'); }
  });

  // ---------- Reset Password ----------
  document.getElementById('reset-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const pwd = e.target.querySelectorAll('input')[0].value;
    const cpwd = e.target.querySelectorAll('input')[1].value;
    if (pwd.length < 6) { showToast('Password must be at least 6 characters'); return; }
    if (pwd !== cpwd) { showToast('Passwords do not match'); return; }
    if (store.updatePassword(pendingEmail, pwd)) { showToast('Password updated successfully!'); closeAuthModals(); openAuthModal('signin-modal'); }
    else { showToast('Unexpected error'); }
  });

  function generateOtp(email) {
    const otp = '123456'; // Temporary placeholder for testing
    sessionStorage.setItem('tmpOtp', otp);
    showToast(`Your OTP code is: ${otp}`);
    document.getElementById('otp-email-display').textContent = email;
  }

  function startOtpTimer() {
    clearInterval(otpInterval); let t = 30;
    const wrap = document.getElementById('otp-timer-wrap'), span = document.getElementById('otp-timer'), btn = document.getElementById('otp-resend-btn');
    wrap.style.display = 'inline'; btn.style.display = 'none'; span.textContent = t;
    otpInterval = setInterval(() => { span.textContent = --t; if (t <= 0) { clearInterval(otpInterval); wrap.style.display = 'none'; btn.style.display = 'inline'; } }, 1000);
  }

  // ---------- OTP Auto-Focus Logic ----------
  document.body.addEventListener('input', e => {
    if (e.target.classList.contains('otp-input')) {
      const val = e.target.value;
      if (val && e.target.nextElementSibling) {
        e.target.nextElementSibling.focus();
      }
    }
  });

  document.body.addEventListener('keydown', e => {
    if (e.target.classList.contains('otp-input')) {
      if (e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling) {
        e.target.previousElementSibling.focus();
      }
    }
  });
});
