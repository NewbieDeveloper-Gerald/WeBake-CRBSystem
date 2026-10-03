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

  // ====================================================================
  // 2. DATA STORE & SESSION SERVICE
  // ====================================================================
  const USERS_KEY = 'weBakeUsers';
  const SESSION_KEY = 'weBakeSession';
  const MIGRATION_KEY = 'weBake_clean_reset_pre_emailer_v1';

  // One-time cleanup for legacy test accounts
  (function cleanAllLegacyAccounts() {
    try {
      if (!localStorage.getItem(MIGRATION_KEY)) {
        localStorage.removeItem(USERS_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('weBakeAllOrders');
        localStorage.removeItem('weBakePartnerApplications');
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
    getAll: () => JSON.parse(localStorage.getItem(USERS_KEY) || '[]'),
    save: arr => localStorage.setItem(USERS_KEY, JSON.stringify(arr)),
    find: email => {
      const target = normalizeEmail(email);
      if (!target) return null;
      return AuthStore.getAll().find(u => normalizeEmail(u.email) === target) || null;
    },
    add: user => {
      const all = AuthStore.getAll();
      const cleanEmail = normalizeEmail(user.email);
      user.email = cleanEmail;
      const existingIdx = all.findIndex(u => normalizeEmail(u.email) === cleanEmail);
      if (existingIdx >= 0) {
        all[existingIdx] = Object.assign(all[existingIdx], user);
      } else {
        all.push(user);
      }
      AuthStore.save(all);
    },
    updatePassword: (email, pwd) => {
      const target = normalizeEmail(email);
      const all = AuthStore.getAll();
      const idx = all.findIndex(u => normalizeEmail(u.email) === target);
      if (idx >= 0) {
        all[idx].password = pwd;
        AuthStore.save(all);
        return true;
      }
      return false;
    },
    updateProfile: (email, data) => {
      const target = normalizeEmail(email);
      const all = AuthStore.getAll();
      const idx = all.findIndex(u => normalizeEmail(u.email) === target);
      if (idx >= 0) {
        Object.assign(all[idx], data);
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
      try { window.dispatchEvent(new CustomEvent('weBakeAuthChange')); } catch (e) {}
    }
  };

  // Expose store globally
  window.WeBakeAuthStore = AuthStore;

  // Flow State
  let pendingEmail = null;
  let flowMode = null; // 'register' or 'forgot'
  let pendingRegistration = null;

  // ====================================================================
  // 3. AUTH MODAL TEMPLATES & INJECTION
  // ====================================================================
  function injectAuthTemplates() {
    if (document.getElementById('auth-overlay')) return;

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
        .track-tab-wrap{display:flex;gap:0.5rem;margin-bottom:1.25rem;background:#f5f0eb;padding:4px;border-radius:8px;width:100%;box-sizing:border-box}
        .track-tab-btn{flex:1 1 0;min-width:0;border-radius:6px;font-weight:600;font-size:0.85rem;padding:0.55rem 0.5rem;border:none;transition:all .2s;cursor:pointer;white-space:normal!important;text-align:center;line-height:1.25;display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;box-sizing:border-box;word-break:normal;overflow-wrap:break-word}
        .track-tab-btn i{flex-shrink:0}
        .track-tab-btn.active{background:var(--primary)!important;color:#fff!important}
        .track-tab-btn:not(.active){background:transparent!important;color:#666!important}
        .track-tab-btn:hover:not(.active){color:var(--primary)!important}
        @media(max-width:520px){
          #track-order-modal{padding:1.5rem 1rem!important;width:95%!important}
          .track-tab-wrap{gap:0.35rem;padding:3px}
          .track-tab-btn{font-size:0.78rem;padding:0.5rem 0.35rem;gap:0.3rem}
          .track-tab-btn i{font-size:0.82rem}
        }
        @media(max-width:380px){
          .track-tab-wrap{flex-direction:column;gap:0.35rem}
          .track-tab-btn{width:100%;padding:0.6rem 0.75rem;font-size:0.82rem}
        }
      </style>
      <div class="overlay" id="auth-overlay" style="z-index:3000"></div>

      <!-- SIGN IN -->
      <div class="modal" id="signin-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Welcome Back</h3>
        <p class="auth-modal-subtitle">Sign in to your WeBake account</p>
        <form id="signin-form">
          <div class="form-group">
            <label>Email</label>
            <div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" required placeholder="Enter your email"></div>
          </div>
          <div class="form-group">
            <label>Password</label>
            <div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required placeholder="Enter your password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div>
          </div>
          <div class="form-group" style="text-align:right;margin-top:-.5rem">
            <a href="#" data-auth-open="forgot-modal" class="auth-link" style="font-size:.85rem;font-weight:500">Forgot Password?</a>
          </div>
          <button type="submit" class="btn btn-primary btn-block"><i class="fas fa-sign-in-alt"></i> Log In</button>
        </form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem">Don't have an account yet? <a href="#" data-auth-open="register-modal" class="auth-link">Create one here</a></p>
      </div>

      <!-- REGISTER -->
      <div class="modal" id="register-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Create Account</h3>
        <p class="auth-modal-subtitle">Join us and enjoy freshly baked goods!</p>
        <form id="register-form">
          <div class="form-group">
            <label>Full Name</label>
            <div class="auth-icon-input"><i class="fas fa-user"></i><input type="text" class="form-input" required placeholder="Juan Dela Cruz"></div>
          </div>
          <div class="form-group">
            <label>Email</label>
            <div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" required id="reg-email" placeholder="juan@gmail.com" pattern="[a-zA-Z0-9._%+\\-]+@[gG][mM][aA][iI][lL]\\.[cC][oO][mM]" title="Must be a valid Gmail address (@gmail.com)"></div>
            <div class="reg-email-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;">Please enter a valid Gmail address (must end with @gmail.com)</div>
          </div>
          <div class="form-group">
            <label>Contact Number</label>
            <div class="auth-icon-input"><i class="fas fa-phone"></i><input type="tel" class="form-input" required id="reg-contact" placeholder="09XXXXXXXXX" pattern="09[0-9]{9}" maxlength="11" inputmode="numeric" title="Must start with 09 and be 11 digits long"></div>
            <div class="reg-contact-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;">Contact number must be 11 digits starting with 09 (no letters/characters)</div>
          </div>
          <div class="form-group">
            <label>Delivery Address</label>
            <div class="auth-icon-input"><i class="fas fa-map-marker-alt"></i><input type="text" class="form-input" required id="reg-address" placeholder="123 Bakery St, City"></div>
          </div>
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
        <form id="forgot-form">
          <div class="form-group">
            <label>Email</label>
            <div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" id="forgot-email" required placeholder="Enter your registered email"></div>
            <div id="forgot-email-error" style="display:none; color:var(--danger); font-size:0.75rem; margin-top:0.25rem;"></div>
          </div>
          <button type="submit" class="btn btn-primary btn-block"><i class="fas fa-paper-plane"></i> Send OTP</button>
        </form>
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
          <div class="invalid-feedback" id="otp-error-modal" style="display:none; color:var(--danger); background:rgba(220,53,69,0.1); padding:0.6rem 0.85rem; border-radius:var(--radius); margin-bottom:1rem; text-align:center; font-size:0.85rem; font-weight:500;"></div>
          <button type="submit" class="btn btn-primary btn-block"><i class="fas fa-check-circle"></i> Verify</button>
        </form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem;color:var(--gray)"><span id="otp-timer-wrap">Resend code in <strong id="otp-timer">60</strong>s</span> <a href="#" id="otp-resend-btn" class="auth-link" style="display:none"><i class="fas fa-redo-alt"></i> Resend OTP</a></p>
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
    `;

    document.body.insertAdjacentHTML('beforeend', authHtml);
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
    document.getElementById('signin-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const inputs = e.target.querySelectorAll('input');
      const email = (inputs[0]?.value || '').trim().toLowerCase();
      const pwd = inputs[1]?.value || '';
      const user = AuthStore.find(email);

      if (!user) {
        showToast('No account found for this email. Please check your spelling or register.');
        if (inputs[0]) inputs[0].focus();
        return;
      }
      if (user.password !== pwd) {
        showToast('Incorrect password. Please try again.');
        if (inputs[1]) inputs[1].focus();
        return;
      }

      AuthStore.setSession(user);
      showToast(`Welcome back, ${user.name}! 🎉`);
      closeAuthModals();
      updateNavState();
      autoFillCheckoutForm();
    });

    // --- Register ---
    document.getElementById('register-form')?.addEventListener('submit', e => {
      e.preventDefault();
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

      // Check if account already exists
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

      if (pwd.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
      }
      if (pwd !== cpwd) {
        showToast('Passwords do not match');
        return;
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
    document.getElementById('forgot-form')?.addEventListener('submit', e => {
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

      const existingUser = AuthStore.find(email);
      if (!existingUser) {
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
        onSuccess: () => {
          if (flowMode === 'register' && pendingRegistration) {
            const registeredUser = { ...pendingRegistration };
            AuthStore.add(registeredUser);
            AuthStore.setSession(registeredUser);
            pendingRegistration = null;
            showToast(`Account created successfully! Welcome, ${registeredUser.name}! 🎉`);
            closeAuthModals();
            updateNavState();
            autoFillCheckoutForm();
          } else if (flowMode === 'forgot') {
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
    document.getElementById('reset-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const pwd = e.target.querySelectorAll('input')[0].value;
      const cpwd = e.target.querySelectorAll('input')[1].value;

      if (pwd.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
      }
      if (pwd !== cpwd) {
        showToast('Passwords do not match');
        return;
      }

      if (AuthStore.updatePassword(pendingEmail, pwd)) {
        showToast('Password updated successfully!');
        closeAuthModals();
        openAuthModal('signin-modal');
      } else {
        showToast('Unexpected error updating password.');
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
      // Password Eye toggle
      const toggle = e.target.closest('.auth-eye-toggle');
      if (toggle) {
        e.preventDefault();
        const input = toggle.parentElement.querySelector('input');
        const icon = toggle.querySelector('i');
        const hidden = input.type === 'password';
        input.type = hidden ? 'text' : 'password';
        icon.classList.toggle('fa-eye', !hidden);
        icon.classList.toggle('fa-eye-slash', hidden);
      }

      // Track Transactions click delegation
      if (e.target.closest('[data-track-order-open]')) {
        e.preventDefault();
        if (typeof window.openTrackOrderModal === 'function') {
          window.openTrackOrderModal();
        } else {
          openAuthModal('track-order-modal');
        }
      }

      // Open Modal via data-auth-open
      if (e.target.closest('[data-auth-open]')) {
        e.preventDefault();
        openAuthModal(e.target.closest('[data-auth-open]').getAttribute('data-auth-open'));
      }

      // Close Modal via data-auth-close or backdrop
      if (e.target.matches('[data-auth-close]') || e.target.id === 'auth-overlay') {
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
  document.addEventListener('DOMContentLoaded', () => {
    injectAuthTemplates();
    setupPasswordStrengthUI('register-form', 'reg-pwd', 'reg-cpwd', 'reg-submit-btn');
    setupPasswordStrengthUI('reset-form', 'reset-pwd', 'reset-cpwd', 'reset-submit-btn');
    setupLiveFormValidation();
    setupAuthFormSubmissions();
    setupGlobalEventListeners();
    updateNavState();
    autoFillCheckoutForm();
  });

})(window, document);
