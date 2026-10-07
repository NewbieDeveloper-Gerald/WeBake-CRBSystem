/* ==========================================================================
   WeBake — Centralized Customer Modals Module (modals.js)
   Houses all modal templates (Auth, Tracking, Order Cancellation, Confirmation)
   and standardizes lifecycle methods (open, close, Escape handling, backdrops).
   ========================================================================== */

(function (window, document) {
  'use strict';

  /* --------------------------------------------------------------------------
     1. Modal HTML Templates & Styles
     -------------------------------------------------------------------------- */
  const MODAL_STYLES = `
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
  `;

  const BASE_MODALS_HTML = `
    <!-- AUTH & GLOBAL OVERLAY -->
    <div class="overlay" id="auth-overlay" style="z-index:3000"></div>

    <!-- SIGN IN MODAL -->
    <div class="modal" id="signin-modal" style="z-index:3001;padding:2.5rem">
      <button class="modal-close" data-auth-close>&times;</button>
      <div style="text-align:center;margin-bottom:0.75rem;"><img src="../img/webake-logo.png" alt="WeBake" style="height:38px;width:auto;object-fit:contain;"></div>
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

    <!-- REGISTER MODAL -->
    <div class="modal" id="register-modal" style="z-index:3001;padding:2.5rem">
      <button class="modal-close" data-auth-close>&times;</button>
      <div style="text-align:center;margin-bottom:0.75rem;"><img src="../img/webake-logo.png" alt="WeBake" style="height:38px;width:auto;object-fit:contain;"></div>
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

    <!-- FORGOT PASSWORD MODAL -->
    <div class="modal" id="forgot-modal" style="z-index:3001;padding:2.5rem">
      <button class="modal-close" data-auth-close>&times;</button>
      <div style="text-align:center;margin-bottom:0.75rem;"><img src="../img/webake-logo.png" alt="WeBake" style="height:38px;width:auto;object-fit:contain;"></div>
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

    <!-- OTP VERIFICATION MODAL -->
    <div class="modal" id="otp-modal" style="z-index:3001;padding:2.5rem">
      <button class="modal-close" data-auth-close>&times;</button>
      <div style="text-align:center;margin-bottom:0.75rem;"><img src="../img/webake-logo.png" alt="WeBake" style="height:38px;width:auto;object-fit:contain;"></div>
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

    <!-- RESET PASSWORD MODAL -->
    <div class="modal" id="reset-modal" style="z-index:3001;padding:2.5rem">
      <button class="modal-close" data-auth-close>&times;</button>
      <div style="text-align:center;margin-bottom:0.75rem;"><img src="../img/webake-logo.png" alt="WeBake" style="height:38px;width:auto;object-fit:contain;"></div>
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

    <!-- TRACK ORDERS MODAL -->
    <div class="modal" id="track-order-modal" style="z-index:3001;padding:2rem;max-width:540px;width:92%;max-height:90vh;overflow-y:auto;">
      <button class="modal-close" data-auth-close>&times;</button>
      <div style="text-align:center;margin-bottom:0.75rem;"><img src="../img/webake-logo.png" alt="WeBake" style="height:36px;width:auto;object-fit:contain;"></div>
      <h3 class="auth-modal-title" style="margin-bottom:0.25rem;"><i class="fas fa-truck-fast"></i> Track Your Order</h3>
      <p class="auth-modal-subtitle" style="margin-bottom:1.25rem;">Enter your Order Reference ID and phone/email to check real-time baking and delivery status.</p>

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

  /* --------------------------------------------------------------------------
     2. Core Modal Manager Object
     -------------------------------------------------------------------------- */
  const WeBakeModals = {
    _injected: false,

    // Inject base modal markup into document.body
    injectTemplates() {
      if (this._injected || document.getElementById('auth-overlay')) {
        this._injected = true;
        return;
      }
      const styleEl = document.createElement('style');
      styleEl.textContent = MODAL_STYLES;
      document.head ? document.head.appendChild(styleEl) : document.body.appendChild(styleEl);

      document.body.insertAdjacentHTML('beforeend', BASE_MODALS_HTML);
      this._injected = true;
    },

    // Open any modal by ID
    open(modalId) {
      this.injectTemplates();
      const overlay = document.getElementById('auth-overlay');

      // Hide all other base modals first
      const allModals = document.querySelectorAll(
        '#signin-modal, #register-modal, #forgot-modal, #otp-modal, #reset-modal, #track-order-modal'
      );
      allModals.forEach(m => m.classList.remove('active'));

      if (overlay) overlay.classList.add('active');
      const target = document.getElementById(modalId);
      if (target) {
        target.classList.add('active');
        // Auto-focus first visible text/email input
        setTimeout(() => {
          const firstInput = target.querySelector('input:not([type="hidden"])');
          if (firstInput) firstInput.focus();
        }, 50);
      }
    },

    // Close a specific modal or all base modals
    close(modalId) {
      if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
      }
      const overlay = document.getElementById('auth-overlay');
      const anyActive = document.querySelector(
        '#signin-modal.active, #register-modal.active, #forgot-modal.active, #otp-modal.active, #reset-modal.active, #track-order-modal.active'
      );
      if (!anyActive && overlay) {
        overlay.classList.remove('active');
      }
    },

    // Close all base modals and overlays
    closeAll() {
      const overlay = document.getElementById('auth-overlay');
      const modals = document.querySelectorAll(
        '#signin-modal, #register-modal, #forgot-modal, #otp-modal, #reset-modal, #track-order-modal'
      );
      modals.forEach(m => {
        m.classList.remove('active');
        const form = m.querySelector('form');
        if (form && m.id !== 'track-order-modal' && typeof form.reset === 'function') {
          form.reset();
        }
      });

      // Clear any validation state messages
      document.querySelectorAll('.is-invalid, .is-valid').forEach(el => el.classList.remove('is-invalid', 'is-valid'));
      const forgotErr = document.getElementById('forgot-email-error');
      if (forgotErr) forgotErr.style.display = 'none';
      const otpErr = document.getElementById('otp-error-modal');
      if (otpErr) otpErr.style.display = 'none';

      if (overlay) overlay.classList.remove('active');
    },

    // Open tracking modal helper
    openTracking(id = '', contact = '') {
      this.open('track-order-modal');
      const idInput = document.getElementById('track-input-id');
      const contactInput = document.getElementById('track-input-contact');
      const errorMsg = document.getElementById('track-error-msg');
      const resultContainer = document.getElementById('track-result-container');

      if (errorMsg) errorMsg.style.display = 'none';
      if (resultContainer) {
        resultContainer.style.display = 'none';
        resultContainer.innerHTML = '';
      }

      if (id && idInput) idInput.value = id;
      if (contact && contactInput) contactInput.value = contact;

      if (id && contact) {
        const form = document.getElementById('track-order-form');
        if (form) form.dispatchEvent(new Event('submit'));
      }
    },

    /* ------------------------------------------------------------------------
       3. Reusable In-Page Confirmation Dialogs
       ------------------------------------------------------------------------ */
    confirm({
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      confirmText = 'Yes, Confirm',
      cancelText = 'Cancel',
      isDanger = false,
      onConfirm = () => {}
    }) {
      document.getElementById('webake-confirm-modal')?.remove();

      const modalHtml = `
        <div id="webake-confirm-modal" class="overlay active" style="z-index:999999;">
          <div class="modal active" style="max-width:440px; text-align:center; padding: 2rem; background:#fff; border-radius:12px; box-shadow:0 12px 35px rgba(0,0,0,0.25);">
            <div style="font-size:2.8rem; color:${isDanger ? '#dc3545' : 'var(--primary)'}; margin-bottom:0.75rem;">
              <i class="fas ${isDanger ? 'fa-exclamation-triangle' : 'fa-question-circle'}"></i>
            </div>
            <h3 style="color:#2E1A14; font-size:1.25rem; font-weight:700; margin-bottom:0.5rem;">${title}</h3>
            <p style="color:#666; font-size:0.88rem; line-height:1.6; margin-bottom:1.25rem;">${message}</p>
            <div style="display:flex; justify-content:center; gap:0.75rem;">
              <button type="button" id="webake-confirm-no" class="btn btn-outline" style="padding:0.55rem 1.25rem; font-size:0.85rem;">${cancelText}</button>
              <button type="button" id="webake-confirm-yes" class="btn btn-primary" style="padding:0.55rem 1.35rem; font-size:0.85rem; ${isDanger ? 'background:#dc3545; border-color:#dc3545;' : ''}">${confirmText}</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const modalWrap = document.getElementById('webake-confirm-modal');
      const closeDialog = () => modalWrap?.remove();

      document.getElementById('webake-confirm-no')?.addEventListener('click', closeDialog);
      modalWrap?.addEventListener('click', (e) => {
        if (e.target === modalWrap) closeDialog();
      });

      document.getElementById('webake-confirm-yes')?.addEventListener('click', () => {
        closeDialog();
        onConfirm();
      });
    },

    // Confirm Downpayment Refund Prompt (Preserves #confirm-refund-modal ID for tests & callers)
    confirmRefund({ orderDate, downpayment, wallet, accNum, onConfirm }) {
      document.getElementById('confirm-refund-modal')?.remove();

      const confirmModalHtml = `
        <div id="confirm-refund-modal" class="overlay active" style="z-index:100000;">
          <div class="modal active" style="max-width:440px; text-align:center; padding: 2rem; background:#fff; border-radius:12px; box-shadow:0 12px 35px rgba(0,0,0,0.25);">
            <div style="font-size:2.8rem; color:#dc3545; margin-bottom:0.75rem;">
              <i class="fas fa-exclamation-circle"></i>
            </div>
            <h3 style="color:#2E1A14; font-size:1.25rem; font-weight:700; margin-bottom:0.5rem;">Confirm Cancellation & Refund</h3>
            <p style="color:#666; font-size:0.88rem; line-height:1.6; margin-bottom:1.25rem;">
              Are you sure you want to request cancellation for this order placed on <strong>${orderDate}</strong>?<br>
              A 50% downpayment refund of <strong style="color:#28a745;">\u20B1${(downpayment || 0).toLocaleString()}</strong> will be credited to your <strong>${wallet}</strong> account (<strong>${accNum}</strong>).
            </p>
            <div style="display:flex; justify-content:center; gap:0.75rem;">
              <button type="button" id="confirm-refund-no" class="btn btn-outline" style="padding:0.55rem 1.25rem; font-size:0.85rem;">No, Keep Order</button>
              <button type="button" id="confirm-refund-yes" class="btn btn-primary" style="padding:0.55rem 1.35rem; font-size:0.85rem; background:#dc3545; border-color:#dc3545;">
                <i class="fas fa-undo-alt"></i> Yes, Request Refund
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', confirmModalHtml);

      const confirmWrap = document.getElementById('confirm-refund-modal');
      const closeConfirm = () => confirmWrap?.remove();

      document.getElementById('confirm-refund-no')?.addEventListener('click', closeConfirm);
      confirmWrap?.addEventListener('click', (e) => {
        if (e.target === confirmWrap) closeConfirm();
      });

      document.getElementById('confirm-refund-yes')?.addEventListener('click', () => {
        closeConfirm();
        if (typeof onConfirm === 'function') onConfirm();
      });
    }
  };

  /* --------------------------------------------------------------------------
     4. Delegated Event Handlers
     -------------------------------------------------------------------------- */
  function initModalDelegation() {
    // Escape key closes open modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        WeBakeModals.closeAll();
        document.getElementById('webake-confirm-modal')?.remove();
        document.getElementById('confirm-refund-modal')?.remove();
        document.getElementById('cancel-order-modal-wrap')?.remove();
      }
    });

    document.addEventListener('click', (e) => {
      // Password eye toggle
      const eyeBtn = e.target.closest('.auth-eye-toggle');
      if (eyeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const input = eyeBtn.parentElement?.querySelector('input') || eyeBtn.closest('.form-group')?.querySelector('input');
        const icon = eyeBtn.querySelector('i');
        if (input && icon) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          icon.classList.remove(isPassword ? 'fa-eye' : 'fa-eye-slash');
          icon.classList.add(isPassword ? 'fa-eye-slash' : 'fa-eye');
        }
        return;
      }

      // Open Tracking Modal via [data-track-order-open]
      const trackTrigger = e.target.closest('[data-track-order-open]');
      if (trackTrigger) {
        e.preventDefault();
        WeBakeModals.openTracking();
        return;
      }

      // Open Modal via [data-auth-open]
      const openTrigger = e.target.closest('[data-auth-open]');
      if (openTrigger) {
        e.preventDefault();
        const targetModal = openTrigger.getAttribute('data-auth-open');
        if (targetModal) WeBakeModals.open(targetModal);
        return;
      }

      // Close Modal via [data-auth-close] or clicking overlay backdrop
      if (e.target.matches('[data-auth-close]') || e.target.id === 'auth-overlay') {
        WeBakeModals.closeAll();
      }
    });
  }

  /* --------------------------------------------------------------------------
     5. Export Globals & Lifecycle Bindings
     -------------------------------------------------------------------------- */
  window.WeBakeModals = WeBakeModals;
  window.openAuthModal = (id) => WeBakeModals.open(id);
  window.closeAuthModals = () => WeBakeModals.closeAll();
  window.openTrackOrderModal = (id, contact) => WeBakeModals.openTracking(id, contact);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      WeBakeModals.injectTemplates();
      initModalDelegation();
    });
  } else {
    WeBakeModals.injectTemplates();
    initModalDelegation();
  }

})(window, document);
