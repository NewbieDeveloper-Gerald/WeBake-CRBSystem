/**
 * ====================================================================
 * WeBake - Customer Authentication Module (auth.js)
 * Clean, modular architecture for:
 *   1. User Storage & Session Management
 *   2. Auth Modals (Sign In, Register, Forgot Password, OTP, Reset)
 *   3. Password Strength & Input Form Validation
 *   4. Nav State Synchronization (Guest vs Authenticated User)
 *   5. Real Email OTP Integration via WeBakeOTP
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  // Configurable API Base URL
  const API_BASE = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5000/api'
      : '/api'
  );

  // ====================================================================
  // 1. UI HELPER & NOTIFICATIONS
  // ====================================================================
  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');
      t = document.getElementById('toast');
    }
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  function sanitizeUserData(user) {
    if (!user || typeof user !== 'object') return null;
    const { password, password_hash, ...safe } = user;
    return safe;
  }

  // ====================================================================
  // 2. DATA STORE & SESSION SERVICE
  // ====================================================================
  const USERS_KEY = 'weBakeUsers';
  const SESSION_KEY = 'weBakeSession';
  const MIGRATION_KEY = 'weBake_clean_slate_2026_10_03_v2';

  // Automatic clean slate reset for all devices (laptop, phone, etc.)
  (function cleanAllAccounts() {
    try {
      if (!localStorage.getItem(MIGRATION_KEY)) {
        localStorage.removeItem(USERS_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('weBakeAllOrders');
        localStorage.removeItem('weBakePartnerApplications');
        localStorage.removeItem('_weBakeOtpTimer');
        localStorage.removeItem('weBakeOtpTimer');
        localStorage.setItem(MIGRATION_KEY, 'true');
      }
    } catch (e) {}
  })();

  // Global helper to manually reset accounts anytime
  window.weBakeResetAccounts = function () {
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('weBakeAllOrders');
    localStorage.removeItem('weBakePartnerApplications');
    window.location.reload();
  };

  const AuthStore = {
    getAll: () => {
      try {
        const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        return Array.isArray(users) ? users.map(u => sanitizeUserData(u)).filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    },
    save: arr => {
      const sanitized = (arr || []).map(u => sanitizeUserData(u)).filter(Boolean);
      localStorage.setItem(USERS_KEY, JSON.stringify(sanitized));
    },
    find: email => {
      const target = normalizeEmail(email);
      if (!target) return null;
      return AuthStore.getAll().find(u => normalizeEmail(u.email) === target) || null;
    },
    add: user => {
      if (!user) return;
      const all = AuthStore.getAll();
      const safeUser = sanitizeUserData(user);
      const cleanEmail = normalizeEmail(safeUser.email);
      safeUser.email = cleanEmail;
      const existingIdx = all.findIndex(u => normalizeEmail(u.email) === cleanEmail);
      if (existingIdx >= 0) {
        all[existingIdx] = Object.assign(all[existingIdx], safeUser);
      } else {
        all.push(safeUser);
      }
      AuthStore.save(all);
    },
    updateProfile: (email, data) => {
      const target = normalizeEmail(email);
      const all = AuthStore.getAll();
      const idx = all.findIndex(u => normalizeEmail(u.email) === target);
      if (idx >= 0) {
        const safeData = sanitizeUserData(data) || {};
        Object.assign(all[idx], safeData);
        AuthStore.save(all);
        return true;
      }
      return false;
    },
    setSession: user => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: normalizeEmail(user.email) }));
      try { window.dispatchEvent(new CustomEvent('weBakeAuthChange')); } catch (e) {}
    },
    getSession: () => JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'),
    clearSession: () => {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('weBakeGuestCart');
      try { window.dispatchEvent(new CustomEvent('weBakeAuthChange')); } catch (e) {}
    }
  };

  // Expose store globally
  window.WeBakeAuthStore = AuthStore;

  // Flow State
  let pendingEmail = null;
  let flowMode = null; // 'register' or 'forgot'
  let pendingRegistration = null;
  let resetProofToken = null;

  // ====================================================================
  // 3. AUTH MODAL TEMPLATES & INJECTION
  // ====================================================================
  function injectAuthTemplates() {
    if (window.WeBakeModals && typeof window.WeBakeModals.injectTemplates === 'function') {
      window.WeBakeModals.injectTemplates();
      return;
    }
  }


  // ====================================================================
  // 4. PASSWORD STRENGTH & VALIDATION LOGIC
  // ====================================================================
  function checkPasswordStrength(pwd) {
    let strength = 0;
    if (pwd.length >= 6) strength += 25;
    if (pwd.length >= 10) strength += 25;
    if (/[A-Z]/.test(pwd)) strength += 25;
    if (/[0-9!@#$%^&*]/.test(pwd)) strength += 25;
    return strength;
  }

  function setupPasswordStrengthUI(formId, pwdId, cpwdId, submitId) {
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
      const pwd = pwdInput ? pwdInput.value : '';
      const cpwd = cpwdInput ? cpwdInput.value : '';

      // Strength
      if (pwd) {
        if (strengthWrap) strengthWrap.style.display = 'block';
        if (strengthText) strengthText.style.display = 'block';
        const score = checkPasswordStrength(pwd);
        if (strengthBar) strengthBar.style.width = score + '%';

        if (score <= 25) {
          if (strengthBar) strengthBar.style.background = 'red';
          if (strengthText) { strengthText.textContent = 'Weak'; strengthText.style.color = 'red'; }
        } else if (score <= 50) {
          if (strengthBar) strengthBar.style.background = 'orange';
          if (strengthText) { strengthText.textContent = 'Fair'; strengthText.style.color = 'orange'; }
        } else if (score <= 75) {
          if (strengthBar) strengthBar.style.background = '#e6c200';
          if (strengthText) { strengthText.textContent = 'Good'; strengthText.style.color = '#e6c200'; }
        } else {
          if (strengthBar) strengthBar.style.background = 'green';
          if (strengthText) { strengthText.textContent = 'Strong'; strengthText.style.color = 'green'; }
        }
      } else {
        if (strengthWrap) strengthWrap.style.display = 'none';
        if (strengthText) strengthText.style.display = 'none';
      }

      // Password Input Border
      if (pwdInput) {
        if (pwd.length >= 6) {
          pwdInput.classList.add('is-valid');
          pwdInput.classList.remove('is-invalid');
        } else if (pwd.length > 0) {
          pwdInput.classList.add('is-invalid');
          pwdInput.classList.remove('is-valid');
        } else {
          pwdInput.classList.remove('is-valid', 'is-invalid');
        }
      }

      // Confirm Password Match Validation & Feedback
      if (cpwdInput) {
        if (!cpwd) {
          if (cpwdError) {
            cpwdError.style.display = 'none';
            cpwdError.textContent = '';
          }
          cpwdInput.classList.remove('is-invalid', 'is-valid');
          if (submitBtn) submitBtn.disabled = (pwd.length < 6);
        } else if (pwd !== cpwd) {
          if (cpwdError) {
            cpwdError.style.display = 'block';
            cpwdError.style.color = '#dc3545';
            cpwdError.innerHTML = '<i class="fas fa-times-circle"></i> Passwords do not match';
          }
          cpwdInput.classList.add('is-invalid');
          cpwdInput.classList.remove('is-valid');
          if (submitBtn) submitBtn.disabled = true;
        } else {
          // Passwords Match!
          if (cpwdError) {
            cpwdError.style.display = 'block';
            cpwdError.style.color = '#28a745';
            cpwdError.innerHTML = '<i class="fas fa-check-circle"></i> Passwords match!';
          }
          cpwdInput.classList.remove('is-invalid');
          cpwdInput.classList.add('is-valid');
          if (submitBtn) submitBtn.disabled = (pwd.length < 6);
        }
      }
    }

    if (pwdInput) pwdInput.addEventListener('input', validate);
    if (cpwdInput) cpwdInput.addEventListener('input', validate);
  }

  function setupLiveFormValidation() {
    // Register Email live check
    const regEmailInput = document.getElementById('reg-email');
    const regEmailErr = document.querySelector('.reg-email-error');
    regEmailInput?.addEventListener('input', e => {
      const val = e.target.value.trim();
      const valid = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(val);
      const exists = valid && !!AuthStore.find(val);
      e.target.classList.toggle('is-valid', valid && !exists);
      e.target.classList.toggle('is-invalid', (!valid && val.length > 0) || exists);
      if (regEmailErr) {
        if (exists) {
          regEmailErr.textContent = 'An account with this email is already registered. Please sign in instead.';
          regEmailErr.style.display = 'block';
        } else if (!valid && val.length > 0) {
          regEmailErr.textContent = 'Please enter a valid Gmail address (must end with @gmail.com)';
          regEmailErr.style.display = 'block';
        } else {
          regEmailErr.style.display = 'none';
        }
      }
    });

    // Forgot Password Email live check
    const forgotEmailInput = document.getElementById('forgot-email');
    const forgotEmailErr = document.getElementById('forgot-email-error');
    forgotEmailInput?.addEventListener('input', e => {
      const val = e.target.value.trim();
      if (!val && forgotEmailErr) {
        forgotEmailErr.style.display = 'none';
        e.target.classList.remove('is-invalid');
      }
    });

    // Register Contact Number format check (11 digits, starts with 09)
    const regContactInput = document.getElementById('reg-contact');
    const regContactErr = document.querySelector('.reg-contact-error');
    regContactInput?.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
      const valid = e.target.value.length === 11 && e.target.value.startsWith('09');
      e.target.classList.toggle('is-valid', valid);
      e.target.classList.toggle('is-invalid', !valid && e.target.value.length > 0);
      if (regContactErr) regContactErr.style.display = (!valid && e.target.value.length > 0) ? 'block' : 'none';
    });
  }

  // ====================================================================
  // 5. MODAL LIFECYCLE CONTROLLER
  // ====================================================================
  function openAuthModal(id) {
    const authOverlay = document.getElementById('auth-overlay');
    document.querySelectorAll('#signin-modal,#register-modal,#forgot-modal,#otp-modal,#reset-modal,#track-order-modal')
      .forEach(m => m.classList.remove('active'));

    if (authOverlay) authOverlay.classList.add('active');
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');

    // Auto-focus first input
    setTimeout(() => {
      const firstInput = modal ? modal.querySelector('input') : null;
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function closeAuthModals() {
    const authOverlay = document.getElementById('auth-overlay');
    const modals = document.querySelectorAll('#signin-modal,#register-modal,#forgot-modal,#otp-modal,#reset-modal,#track-order-modal');

    modals.forEach(m => {
      m.classList.remove('active');

      // 1. Reset forms
      m.querySelectorAll('form').forEach(f => f.reset());

      // 2. Remove validation classes
      m.querySelectorAll('.is-invalid, .is-valid').forEach(el => el.classList.remove('is-invalid', 'is-valid'));

      // 3. Hide errors
      m.querySelectorAll('.error-msg, .invalid-feedback, .cpwd-error').forEach(el => {
        el.style.display = 'none';
        el.textContent = '';
      });

      // 4. Reset password strength
      m.querySelectorAll('.pwd-strength-bar').forEach(b => { b.style.width = '0%'; b.style.background = ''; });
      m.querySelectorAll('.pwd-strength, .pwd-strength-text').forEach(t => { t.style.display = 'none'; t.textContent = ''; });

      // 5. Clear OTP inputs
      m.querySelectorAll('.otp-input').forEach(i => i.value = '');
    });

    // 6. Reset Track Transactions container if present
    const trackRes = document.getElementById('track-result-container');
    if (trackRes) { trackRes.style.display = 'none'; trackRes.innerHTML = ''; }
    const trackErr = document.getElementById('track-error-msg');
    if (trackErr) { trackErr.style.display = 'none'; trackErr.textContent = ''; }

    if (authOverlay) authOverlay.classList.remove('active');

    if (window.WeBakeOTP && typeof window.WeBakeOTP.clearCountdown === 'function') {
      window.WeBakeOTP.clearCountdown();
    }
  }

  // Expose globally
  window.openAuthModal = openAuthModal;
  window.closeAuthModals = closeAuthModals;

  // ====================================================================
  // 6. NAVIGATION STATE SYNCHRONIZATION
  // ====================================================================
  function updateNavState() {
    const s = AuthStore.getSession();
    const navLinks = document.getElementById('nav-links');
    const footerTrackLinks = document.querySelectorAll('footer [data-track-order-open]');

    if (s) {
      // LOGGED IN USER: Hide Track Transactions from Header & Footer
      const trackNav = navLinks?.querySelector('#nav-track-order');
      if (trackNav) trackNav.style.display = 'none';

      footerTrackLinks.forEach(link => { link.style.display = 'none'; });

      if (navLinks && !navLinks.querySelector('.nav-auth-mobile')) {
        navLinks.insertAdjacentHTML('beforeend', '<div class="nav-auth-divider"></div><div class="nav-auth-mobile"></div>');
      }

      const db = document.querySelector('.auth-buttons');
      const mb = document.querySelector('.nav-auth-mobile');
      const inner = `<a href="dashboard.html" class="btn btn-outline btn-sm"><i class="fas fa-user-circle"></i> Profile</a><a href="#" id="logout-btn" class="btn btn-danger-outline btn-sm"><i class="fas fa-sign-out-alt"></i> Log Out</a>`;
      if (db) db.innerHTML = inner;
      if (mb) mb.innerHTML = inner.replace('id="logout-btn"', 'id="logout-btn-mobile"');
    } else {
      // GUEST USER: Show Track Transactions in Header & Footer
      if (navLinks) {
        let trackNav = navLinks.querySelector('#nav-track-order');
        if (!trackNav) {
          trackNav = document.createElement('a');
          trackNav.href = 'javascript:void(0)';
          trackNav.id = 'nav-track-order';
          trackNav.innerHTML = '<i class="fas fa-search-dollar"></i> Track Transactions';
          trackNav.setAttribute('data-track-order-open', 'true');
          const mobileDivider = navLinks.querySelector('.nav-auth-divider');
          if (mobileDivider) {
            navLinks.insertBefore(trackNav, mobileDivider);
          } else {
            navLinks.appendChild(trackNav);
          }
        }
        trackNav.style.display = '';

        if (!navLinks.querySelector('.nav-auth-mobile')) {
          navLinks.insertAdjacentHTML('beforeend', '<div class="nav-auth-divider"></div><div class="nav-auth-mobile"></div>');
        }
      }

      footerTrackLinks.forEach(link => { link.style.display = ''; });

      const db = document.querySelector('.auth-buttons');
      const mb = document.querySelector('.nav-auth-mobile');
      if (db) db.innerHTML = `<a href="#" class="btn btn-outline btn-sm">Sign In</a><a href="#" class="btn btn-primary btn-sm">Register</a>`;
      if (mb) mb.innerHTML = `<a href="#" class="btn btn-outline btn-sm auth-mobile-btn">Sign In</a><a href="#" class="btn btn-primary btn-sm auth-mobile-btn">Register</a>`;
    }

    if (typeof window.syncPartnerFormState === 'function') {
      try { window.syncPartnerFormState(); } catch (e) {}
    }
  }

  function autoFillCheckoutForm() {
    const s = AuthStore.getSession();
    if (!s) return;
    const u = AuthStore.find(s.email);
    if (!u) return;
    const f = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    f('cust-name', u.name);
    f('cust-contact', u.contact);
    f('cust-email', u.email);
    f('cust-address', u.address);
  }

  window.updateNavState = updateNavState;

  // ====================================================================
  // 7. FORM HANDLERS (SIGN IN, REGISTER, FORGOT, OTP, RESET)
  // ====================================================================
  function setupAuthFormSubmissions() {
    // --- Sign In ---
    document.getElementById('signin-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const inputs = form.querySelectorAll('input');
      const email = (inputs[0]?.value || '').trim().toLowerCase();
      const pwd = inputs[1]?.value || '';
      const submitBtn = form.querySelector('button[type="submit"]');

      if (!email) {
        showToast('Please enter your email address.');
        if (inputs[0]) inputs[0].focus();
        return;
      }
      if (!pwd) {
        showToast('Please enter your password.');
        if (inputs[1]) inputs[1].focus();
        return;
      }

      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
      }

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pwd })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success && data.user) {
          AuthStore.add(data.user);
          AuthStore.setSession(data.user);

          // Sync order history to local storage registry so dashboard/tracking renders immediately
          if (Array.isArray(data.user.orderHistory) && data.user.orderHistory.length > 0) {
            try {
              const allOrders = JSON.parse(localStorage.getItem('weBakeAllOrders') || '[]');
              data.user.orderHistory.forEach(ord => {
                if (!allOrders.some(existing => existing.orderId === ord.orderId)) {
                  allOrders.unshift(ord);
                }
              });
              localStorage.setItem('weBakeAllOrders', JSON.stringify(allOrders));
            } catch (err) {}
          }

          showToast(`Welcome back, ${data.user.name}! 🎉`);
          closeAuthModals();
          updateNavState();
          autoFillCheckoutForm();
          return;
        } else {
          const errorMsg = data.message || 'No account found for this email. Please check your spelling or register.';
          showToast(errorMsg);
          if (data.error === 'user_not_found') {
            if (inputs[0]) inputs[0].focus();
          } else if (data.error === 'incorrect_password') {
            if (inputs[1]) inputs[1].focus();
          }
        }
      } catch (err) {
        console.warn('[Sign In Server Offline - Fallback to localStorage]:', err);
        const allUsers = JSON.parse(localStorage.getItem('weBakeUsers') || '[]');
        const u = allUsers.find(x => (x.email || '').trim().toLowerCase() === email);
        if (u) {
          if (!u.password || u.password === pwd) {
            AuthStore.setSession(u);
            showToast(`Welcome back, ${u.name}! 🎉`);
            closeAuthModals();
            updateNavState();
            autoFillCheckoutForm();
            return;
          } else {
            showToast('Incorrect password.');
            if (inputs[1]) inputs[1].focus();
            return;
          }
        } else {
          showToast('No account found for this email. Please check your spelling or register.');
          if (inputs[0]) inputs[0].focus();
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    });

    // --- Register ---
    document.getElementById('register-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const email = (document.getElementById('reg-email')?.value || '').trim().toLowerCase();
      const pwd = document.getElementById('reg-pwd')?.value || '';
      const cpwd = document.getElementById('reg-cpwd')?.value || '';
      const contact = (document.getElementById('reg-contact')?.value || '').trim().replace(/\D/g, '');
      const name = (document.querySelector('#register-form input[placeholder="Juan Dela Cruz"]')?.value || '').trim();
      const address = (document.getElementById('reg-address')?.value || '').trim();
      const submitBtn = document.getElementById('reg-submit-btn');

      if (!window.WeBakeOTP || !window.WeBakeOTP.isValidEmail(email)) {
        showToast('Please enter a valid Gmail address (must end with @gmail.com)');
        document.getElementById('reg-email')?.focus();
        return;
      }
      if (contact.length !== 11 || !contact.startsWith('09')) {
        showToast('Contact number must be 11 digits starting with 09 (no letters or characters)');
        document.getElementById('reg-contact')?.focus();
        return;
      }

      if (pwd.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
      }
      if (pwd !== cpwd) {
        showToast('Passwords do not match');
        return;
      }

      // Check if account already exists locally
      if (AuthStore.find(email)) {
        showToast('An account with this email is already registered. Please sign in instead.');
        const regEmailErr = document.querySelector('.reg-email-error');
        if (regEmailErr) {
          regEmailErr.textContent = 'An account with this email is already registered. Please sign in instead.';
          regEmailErr.style.display = 'block';
        }
        document.getElementById('reg-email')?.focus();
        return;
      }

      // Check if email already exists in cloud database
      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking availability...';
      }

      try {
        const checkRes = await fetch(`${API_BASE}/auth/check?email=${encodeURIComponent(email)}`);
        const checkData = await checkRes.json().catch(() => ({}));
        if (checkData.exists) {
          showToast('An account with this email is already registered. Please sign in instead.');
          const regEmailErr = document.querySelector('.reg-email-error');
          if (regEmailErr) {
            regEmailErr.textContent = 'An account with this email is already registered. Please sign in instead.';
            regEmailErr.style.display = 'block';
          }
          document.getElementById('reg-email')?.focus();
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnHtml;
          }
          return;
        }
      } catch (err) {
        console.warn('[Check Email Error]:', err);
      }

      pendingEmail = email;
      flowMode = 'register';
      pendingRegistration = {
        name,
        email,
        password: pwd,
        contact,
        address,
        savedCart: [],
        orderHistory: [],
        partnerStatus: 'none'
      };

      // Reset OTP modal inputs
      document.querySelectorAll('#otp-modal .otp-input').forEach(i => i.value = '');
      const otpError = document.getElementById('otp-error-modal');
      if (otpError) otpError.style.display = 'none';

      // Send real OTP
      window.WeBakeOTP.send({
        email: pendingEmail,
        purpose: 'register',
        buttonEl: submitBtn,
        loadingText: 'Sending verification code...',
        onSuccess: () => {
          showToast('Verification code sent to your email!');
          openAuthModal('otp-modal');
          const emailDisplay = document.getElementById('otp-email-display');
          if (emailDisplay) emailDisplay.textContent = pendingEmail;
          window.WeBakeOTP.startCountdown({
            timerSpanEl: document.getElementById('otp-timer'),
            timerWrapEl: document.getElementById('otp-timer-wrap'),
            resendBtnEl: document.getElementById('otp-resend-btn'),
            duration: 60
          });
        },
        onError: msg => showToast(msg)
      });
    });

    // --- Forgot Password ---
    document.getElementById('forgot-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const emailInput = document.getElementById('forgot-email') || e.target.querySelector('input[type="email"]');
      const email = (emailInput?.value || '').trim().toLowerCase();
      const forgotSubmitBtn = e.target.querySelector('button[type="submit"]');
      const forgotEmailErr = document.getElementById('forgot-email-error');

      if (forgotEmailErr) forgotEmailErr.style.display = 'none';

      if (!window.WeBakeOTP || !window.WeBakeOTP.isValidEmail(email)) {
        showToast('Please enter a valid Gmail address');
        if (emailInput) emailInput.focus();
        return;
      }

      const origBtnHtml = forgotSubmitBtn ? forgotSubmitBtn.innerHTML : '';
      if (forgotSubmitBtn) {
        forgotSubmitBtn.disabled = true;
        forgotSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking account...';
      }

      let accountExists = !!AuthStore.find(email);
      try {
        const checkRes = await fetch(`${API_BASE}/auth/check?email=${encodeURIComponent(email)}`);
        const checkData = await checkRes.json().catch(() => ({}));
        if (checkData.success) {
          accountExists = checkData.exists;
        }
      } catch (err) {}

      if (forgotSubmitBtn) {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.innerHTML = origBtnHtml;
      }

      if (!accountExists) {
        const notFoundMsg = 'No account found with this email. Please check your spelling or register.';
        showToast(notFoundMsg);
        if (forgotEmailErr) {
          forgotEmailErr.textContent = notFoundMsg;
          forgotEmailErr.style.display = 'block';
        }
        if (emailInput) {
          emailInput.classList.add('is-invalid');
          emailInput.focus();
        }
        return;
      }

      pendingEmail = email;
      flowMode = 'forgot';

      document.querySelectorAll('#otp-modal .otp-input').forEach(i => i.value = '');
      const otpError = document.getElementById('otp-error-modal');
      if (otpError) otpError.style.display = 'none';

      window.WeBakeOTP.send({
        email: pendingEmail,
        purpose: 'forgot',
        buttonEl: forgotSubmitBtn,
        loadingText: 'Sending code...',
        onSuccess: () => {
          showToast('6-digit verification code sent to your email!');
          openAuthModal('otp-modal');
          const emailDisplay = document.getElementById('otp-email-display');
          if (emailDisplay) emailDisplay.textContent = pendingEmail;
          window.WeBakeOTP.startCountdown({
            timerSpanEl: document.getElementById('otp-timer'),
            timerWrapEl: document.getElementById('otp-timer-wrap'),
            resendBtnEl: document.getElementById('otp-resend-btn'),
            duration: 60
          });
        },
        onError: msg => showToast(msg)
      });
    });

    // --- OTP Verification Form ---
    document.getElementById('otp-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const entered = Array.from(e.target.querySelectorAll('.otp-input')).map(i => i.value).join('');
      const verifyBtn = e.target.querySelector('button[type="submit"]');
      const otpError = document.getElementById('otp-error-modal');

      window.WeBakeOTP.verify({
        email: pendingEmail,
        code: entered,
        purpose: flowMode,
        buttonEl: verifyBtn,
        errorEl: otpError,
        loadingText: 'Verifying...',
        onSuccess: async (verifyData) => {
          if (flowMode === 'register' && pendingRegistration) {
            const registeredUser = {
              ...pendingRegistration,
              proofToken: verifyData?.proofToken
            };

            if (verifyBtn) {
              verifyBtn.disabled = true;
              verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
            }

            try {
              const regRes = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registeredUser)
              });
              const regData = await regRes.json().catch(() => ({}));

              if (regRes.ok && regData.success && regData.user) {
                const cloudUser = regData.user;
                AuthStore.add(cloudUser);
                AuthStore.setSession(cloudUser);
                pendingRegistration = null;
                showToast(`Account created successfully! Welcome, ${cloudUser.name}! 🎉`);
                closeAuthModals();
                updateNavState();
                autoFillCheckoutForm();
                return;
              } else {
                const errMsg = regData.message || 'Failed to create account. Please try again.';
                if (otpError) {
                  otpError.textContent = errMsg;
                  otpError.style.display = 'block';
                }
                showToast(errMsg);
                if (verifyBtn) {
                  verifyBtn.disabled = false;
                  verifyBtn.innerHTML = 'Verify &amp; Create Account';
                }
                return;
              }
            } catch (err) {
              console.warn('[Cloud Registration Server Offline - Fallback to localStorage]:', err);
              AuthStore.add(registeredUser);
              AuthStore.setSession(registeredUser);
              pendingRegistration = null;
              showToast(`Account created successfully! Welcome, ${registeredUser.name}! 🎉`);
              closeAuthModals();
              updateNavState();
              autoFillCheckoutForm();
              return;
            }
          } else if (flowMode === 'forgot') {
            resetProofToken = verifyData?.proofToken || null;
            closeAuthModals();
            openAuthModal('reset-modal');
          }
        },
        onError: msg => {
          if (otpError) {
            otpError.textContent = msg;
            otpError.style.display = 'block';
          }
          showToast(msg);
        }
      });
    });

    // --- Resend OTP Button ---
    document.getElementById('otp-resend-btn')?.addEventListener('click', e => {
      e.preventDefault();
      if (!pendingEmail) return;

      const resendBtn = document.getElementById('otp-resend-btn');
      const otpError = document.getElementById('otp-error-modal');
      if (otpError) otpError.style.display = 'none';

      document.querySelectorAll('#otp-modal .otp-input').forEach(i => i.value = '');

      window.WeBakeOTP.send({
        email: pendingEmail,
        purpose: flowMode,
        buttonEl: resendBtn,
        loadingText: 'Resending...',
        onSuccess: () => {
          showToast('A new verification code has been sent to your email!');
          window.WeBakeOTP.startCountdown({
            timerSpanEl: document.getElementById('otp-timer'),
            timerWrapEl: document.getElementById('otp-timer-wrap'),
            resendBtnEl: document.getElementById('otp-resend-btn'),
            duration: 60
          });
        },
        onError: msg => showToast(msg)
      });
    });

    // --- Reset Password ---
    document.getElementById('reset-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const pwd = form.querySelectorAll('input')[0].value;
      const cpwd = form.querySelectorAll('input')[1].value;
      const submitBtn = form.querySelector('button[type="submit"]');

      if (pwd.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
      }
      if (pwd !== cpwd) {
        showToast('Passwords do not match');
        return;
      }

      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating password...';
      }

      try {
        const resetRes = await fetch(`${API_BASE}/auth/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingEmail, password: pwd, proofToken: resetProofToken })
        });
        const resetData = await resetRes.json().catch(() => ({}));

        if (resetRes.ok && resetData.success) {
          resetProofToken = null;
          showToast('Password updated successfully! Please sign in with your new password.');
          closeAuthModals();
          openAuthModal('signin-modal');
        } else {
          showToast(resetData.message || 'Failed to update password. Please request a new verification code.');
        }
      } catch (err) {
        showToast('Failed to update password. Please check your network connection.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    });

    // --- OTP Inputs Auto-Focus Navigation ---
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
  }

  // ====================================================================
  // 8. GLOBAL EVENT DELEGATION
  // ====================================================================
  function setupGlobalEventListeners() {
    // Escape key closes modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeAuthModals();
        if (typeof window.closeCheckout === 'function') {
          window.closeCheckout();
        }
      }
    });

    // Global click listener
    document.body.addEventListener('click', e => {
      // Password Eye toggle (delegated to modals.js when present)
      const toggle = e.target.closest('.auth-eye-toggle');
      if (toggle) {
        if (window.WeBakeModals) return;
        e.preventDefault();
        const input = toggle.parentElement?.querySelector('input') || toggle.closest('.form-group')?.querySelector('input');
        const icon = toggle.querySelector('i');
        if (input && icon) {
          const hidden = input.type === 'password';
          input.type = hidden ? 'text' : 'password';
          icon.classList.remove(hidden ? 'fa-eye' : 'fa-eye-slash');
          icon.classList.add(hidden ? 'fa-eye-slash' : 'fa-eye');
        }
        return;
      }

      // Track Transactions click delegation
      if (e.target.closest('[data-track-order-open]')) {
        if (window.WeBakeModals) return;
        e.preventDefault();
        if (typeof window.openTrackOrderModal === 'function') {
          window.openTrackOrderModal();
        } else {
          openAuthModal('track-order-modal');
        }
      }

      // Open Modal via data-auth-open
      if (e.target.closest('[data-auth-open]')) {
        if (window.WeBakeModals) return;
        e.preventDefault();
        openAuthModal(e.target.closest('[data-auth-open]').getAttribute('data-auth-open'));
      }

      // Close Modal via data-auth-close or backdrop
      if (e.target.matches('[data-auth-close]') || e.target.id === 'auth-overlay') {
        if (window.WeBakeModals) return;
        closeAuthModals();
      }

      // Sign In / Register buttons in navbar
      const authBtn = e.target.closest('.auth-buttons a, .auth-mobile-btn');
      if (authBtn && (authBtn.textContent.includes('Sign In') || authBtn.textContent.includes('Register'))) {
        e.preventDefault();
        openAuthModal(authBtn.textContent.includes('Sign In') ? 'signin-modal' : 'register-modal');
      }

      // Log Out
      if (e.target.closest('#logout-btn, #logout-btn-mobile')) {
        e.preventDefault();
        AuthStore.clearSession();
        updateNavState();
        showToast("You've been signed out. See you again! 👋");
        setTimeout(() => { window.location.href = 'home.html'; }, 1500);
      }
    });
  }

  // ====================================================================
  // 9. INITIALIZATION
  // ====================================================================
  function syncSessionWithCloud() {
    const s = AuthStore.getSession();
    if (!s || !s.email) return;
    fetch(`${API_BASE}/auth/sync?email=${encodeURIComponent(s.email)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.user) {
          AuthStore.add(data.user);
          updateNavState();
          autoFillCheckoutForm();
        }
      })
      .catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectAuthTemplates();
    setupPasswordStrengthUI('register-form', 'reg-pwd', 'reg-cpwd', 'reg-submit-btn');
    setupPasswordStrengthUI('reset-form', 'reset-pwd', 'reset-cpwd', 'reset-submit-btn');
    setupLiveFormValidation();
    setupAuthFormSubmissions();
    setupGlobalEventListeners();
    updateNavState();
    autoFillCheckoutForm();
    syncSessionWithCloud();
  });

})(window, document);
