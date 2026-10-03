/* ==========================================================================
   WeBake — Wholesale Partner Application Module (partner.js)
   Handles wholesale partnership applications, inline email OTP verification,
   edit mode, real-time validations, and submission state sync.
   ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     1. Storage & State Management
     -------------------------------------------------------------------------- */
  const PartnerStore = {
    KEYS: {
      USERS: 'weBakeUsers',
      SESSION: 'weBakeSession',
      APPS: 'weBakePartnerApplications',
      EDIT_ID: 'weBakeEditPartnerId'
    },

    getUsers() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]');
      } catch (e) {
        return [];
      }
    },

    saveUsers(users) {
      localStorage.setItem(this.KEYS.USERS, JSON.stringify(users));
    },

    getSession() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.SESSION));
      } catch (e) {
        return null;
      }
    },

    getApplications() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.APPS) || '[]');
      } catch (e) {
        return [];
      }
    },

    saveApplications(apps) {
      localStorage.setItem(this.KEYS.APPS, JSON.stringify(apps));
    },

    getEditAppId() {
      return sessionStorage.getItem(this.KEYS.EDIT_ID);
    },

    clearEditAppId() {
      sessionStorage.removeItem(this.KEYS.EDIT_ID);
    }
  };

  /* --------------------------------------------------------------------------
     2. Internal State & Toast Helper
     -------------------------------------------------------------------------- */
  let partnerEmailVerified = false;
  let verifiedPartnerEmail = '';

  function toast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  function validateField(el, isValid) {
    if (!el) return;
    el.classList.toggle('is-valid', isValid);
    el.classList.toggle('is-invalid', !isValid && (el.value || '').length > 0);
  }

  /* --------------------------------------------------------------------------
     3. Years in Operation Selector
     -------------------------------------------------------------------------- */
  const PartnerYears = {
    init() {
      const yearsSelect = document.getElementById('partner-years');
      const yearsCustomWrap = document.getElementById('partner-years-custom-wrap');
      const yearsCustomInput = document.getElementById('partner-years-custom');
      const yearsBackBtn = document.getElementById('partner-years-back-btn');
      const partnerForm = document.getElementById('partner-form');

      // Restrict custom input to numbers only (maximum 2 digits)
      yearsCustomInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
      });

      // Dropdown toggle: when "more" is selected, show text input
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
    },

    getValue() {
      const yearsSelect = document.getElementById('partner-years');
      const yearsCustomWrap = document.getElementById('partner-years-custom-wrap');
      const yearsCustomInput = document.getElementById('partner-years-custom');

      if (yearsCustomWrap && yearsCustomWrap.style.display !== 'none') {
        const customVal = yearsCustomInput?.value.replace(/\D/g, '').slice(0, 2);
        if (!customVal) {
          toast('Please enter the number of years in operation (numbers only, max 2 digits)');
          yearsCustomInput?.focus();
          return null;
        }
        return `${customVal} years`;
      } else if (yearsSelect) {
        return yearsSelect.value;
      }
      return '';
    },

    setValue(val) {
      const yearsSelect = document.getElementById('partner-years');
      const yearsCustomWrap = document.getElementById('partner-years-custom-wrap');
      const yearsCustomInput = document.getElementById('partner-years-custom');
      if (!yearsSelect) return;

      const standardYears = ['Less than 1 year', '1 year', '2 years', '3 years', '4 years', '5 years'];
      if (standardYears.includes(val)) {
        yearsSelect.value = val;
        yearsSelect.style.display = 'block';
        yearsSelect.setAttribute('required', '');
        if (yearsCustomWrap) yearsCustomWrap.style.display = 'none';
        if (yearsCustomInput) {
          yearsCustomInput.removeAttribute('required');
          yearsCustomInput.value = '';
        }
      } else if (val) {
        yearsSelect.style.display = 'none';
        yearsSelect.removeAttribute('required');
        if (yearsCustomWrap) yearsCustomWrap.style.display = 'block';
        if (yearsCustomInput) {
          yearsCustomInput.setAttribute('required', '');
          const numStr = (val.match(/\d{1,2}/) || [''])[0];
          yearsCustomInput.value = numStr;
        }
      }
    }
  };

  /* --------------------------------------------------------------------------
     4. OTP Verification Handlers
     -------------------------------------------------------------------------- */
  const PartnerOTP = {
    triggerSend() {
      const emailEl = document.getElementById('partner-email');
      const emailVal = (emailEl?.value || '').trim().toLowerCase();
      const feedback = document.getElementById('partner-email-feedback');
      const allUsers = PartnerStore.getUsers();

      if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(emailVal)) {
        toast('Please enter a valid Gmail address (must end with @gmail.com)');
        validateField(emailEl, false);
        if (feedback) {
          feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
          feedback.style.display = 'block';
        }
        emailEl?.focus();
        return;
      }

      // 1. Check if email belongs to registered user
      const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === emailVal);
      if (isRegistered) {
        toast('This Gmail address is already registered. Please sign in or use another email.');
        validateField(emailEl, false);
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
      const editingAppId = PartnerStore.getEditAppId();
      const allApps = PartnerStore.getApplications();
      const existingApp = allApps.find(a =>
        a.status !== 'cancelled' &&
        ((a.details?.email && (a.details.email || '').trim().toLowerCase() === emailVal) ||
         (a.email && (a.email || '').trim().toLowerCase() === emailVal))
      );
      if (existingApp && (!editingAppId || existingApp.appId.toUpperCase() !== editingAppId.toUpperCase())) {
        toast(`This Gmail address has an active application (ID: ${existingApp.appId}). Guests can only apply once.`);
        validateField(emailEl, false);
        if (feedback) {
          feedback.textContent = `This Gmail address has an active application (ID: ${existingApp.appId}). Guests can only apply once. Track it via Track Transactions.`;
          feedback.style.display = 'block';
        }
        emailEl?.focus();
        return;
      }

      validateField(emailEl, true);
      if (feedback) feedback.style.display = 'none';

      const vBtn = document.getElementById('btn-partner-verify-email');
      const otpContainer = document.getElementById('partner-otp-container');
      const emailDisplay = document.getElementById('partner-otp-email-display');
      const otpError = document.getElementById('partner-otp-error');
      const timerSpan = document.getElementById('partner-otp-timer');
      const timerWrap = document.getElementById('partner-otp-timer-wrap');
      const resendBtn = document.getElementById('partner-otp-resend-btn');

      document.querySelectorAll('#partner-otp-inputs .otp-input').forEach(i => i.value = '');
      if (otpError) {
        otpError.style.display = 'none';
        otpError.textContent = '';
      }
      if (emailDisplay) emailDisplay.textContent = emailVal;

      if (!window.WeBakeOTP) {
        toast('Verification service is initializing. Please try again.');
        return;
      }

      window.WeBakeOTP.send({
        email: emailVal,
        purpose: 'partner_verification',
        buttonEl: vBtn,
        loadingText: 'Sending...',
        onSuccess: () => {
          toast('Verification code sent to ' + emailVal);
          if (otpContainer) otpContainer.style.display = 'block';
          window.WeBakeOTP.startCountdown({
            timerSpanEl: timerSpan,
            timerWrapEl: timerWrap,
            resendBtnEl: resendBtn,
            duration: 60
          });
          const firstInput = document.querySelector('#partner-otp-inputs .otp-input');
          if (firstInput) firstInput.focus();
        },
        onError: (errMsg) => {
          toast(errMsg);
          if (otpError) {
            otpError.textContent = errMsg;
            otpError.style.display = 'block';
          }
        }
      });
    },

    triggerResend(e) {
      if (e) e.preventDefault();
      const emailEl = document.getElementById('partner-email');
      const emailVal = (emailEl?.value || '').trim().toLowerCase();
      const resendBtn = document.getElementById('partner-otp-resend-btn');
      const timerSpan = document.getElementById('partner-otp-timer');
      const timerWrap = document.getElementById('partner-otp-timer-wrap');
      const otpError = document.getElementById('partner-otp-error');

      if (!window.WeBakeOTP) return;

      window.WeBakeOTP.send({
        email: emailVal,
        purpose: 'partner_verification',
        buttonEl: resendBtn,
        errorEl: otpError,
        loadingText: 'Resending...',
        onSuccess: () => {
          toast('New verification code sent to ' + emailVal);
          window.WeBakeOTP.startCountdown({
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
    },

    triggerVerify() {
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

      if (!window.WeBakeOTP) return;

      window.WeBakeOTP.verify({
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
          toast('Email verified successfully!');
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
    }
  };

  /* --------------------------------------------------------------------------
     5. Real-Time Guest Validation
     -------------------------------------------------------------------------- */
  function checkPartnerEmailRealtime(isBlur = false) {
    const partnerEmailEl = document.getElementById('partner-email');
    const feedback = document.getElementById('partner-email-feedback');
    const vBadge = document.getElementById('partner-email-verified-badge');
    const vBtn = document.getElementById('btn-partner-verify-email');
    const otpContainer = document.getElementById('partner-otp-container');
    if (!partnerEmailEl) return true;

    const s = PartnerStore.getSession();
    if (s && s.email) return true;

    const curVal = (partnerEmailEl.value || '').trim().toLowerCase();

    if (curVal && curVal === verifiedPartnerEmail) {
      partnerEmailVerified = true;
      if (vBadge) vBadge.style.display = 'inline-block';
      if (vBtn) vBtn.style.display = 'none';
      if (otpContainer) otpContainer.style.display = 'none';
      validateField(partnerEmailEl, true);
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
      const allUsers = PartnerStore.getUsers();
      const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === curVal);
      if (isRegistered) {
        validateField(partnerEmailEl, false);
        if (feedback) {
          if (!feedback.querySelector('#partner-inline-signin-link')) {
            feedback.innerHTML = `This Gmail address is already registered. Please <a href="#" data-auth-open="signin-modal" id="partner-inline-signin-link" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or use another email.`;
          }
          feedback.style.display = 'block';
        }
        return false;
      }

      // Check active application
      const editingAppId = PartnerStore.getEditAppId();
      const allApps = PartnerStore.getApplications();
      const existingApp = allApps.find(a =>
        a.status !== 'cancelled' &&
        ((a.details?.email && (a.details.email || '').trim().toLowerCase() === curVal) ||
         (a.email && (a.email || '').trim().toLowerCase() === curVal))
      );
      if (existingApp && (!editingAppId || existingApp.appId.toUpperCase() !== editingAppId.toUpperCase())) {
        validateField(partnerEmailEl, false);
        if (feedback) {
          feedback.textContent = `This Gmail address has an active application (ID: ${existingApp.appId}). Guests can only apply once. Track it via Track Transactions.`;
          feedback.style.display = 'block';
        }
        return false;
      }

      // Valid & available
      validateField(partnerEmailEl, true);
      if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = 'Please enter a valid Gmail address (must end with @gmail.com).';
      }
      return true;
    } else {
      const afterAt = curVal.includes('@') ? curVal.split('@')[1] : '';
      const isTypingGmail = 'gmail.com'.startsWith(afterAt);
      if (isBlur || (curVal.includes('@') && !isTypingGmail)) {
        validateField(partnerEmailEl, false);
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

  /* --------------------------------------------------------------------------
     6. Form State Synchronization (Logged In vs Guest vs Edit Mode)
     -------------------------------------------------------------------------- */
  function populatePartnerFields(data, rootApp) {
    if (!data) return;
    ['bakery-name', 'owner-name', 'type', 'address', 'notes'].forEach(key => {
      const el = document.getElementById(`partner-${key}`);
      if (el && data[key] !== undefined) el.value = data[key];
    });

    // Populate Contact Details for Guest Edit mode
    const savedEmail = (data.email || (rootApp && rootApp.email) || '').trim();
    const savedPhone = (data.phone || (rootApp && rootApp.phone) || '').trim();
    const emailEl = document.getElementById('partner-email');
    const phoneEl = document.getElementById('partner-phone');
    if (emailEl && savedEmail) {
      emailEl.value = savedEmail;
      partnerEmailVerified = true;
      verifiedPartnerEmail = savedEmail.toLowerCase();
      const vBadge = document.getElementById('partner-email-verified-badge');
      if (vBadge) vBadge.style.display = 'inline-block';
      const vBtn = document.getElementById('btn-partner-verify-email');
      if (vBtn) vBtn.style.display = 'none';
    }
    if (phoneEl && savedPhone) {
      phoneEl.value = savedPhone;
    }

    if (data.years) {
      PartnerYears.setValue(data.years);
    }

    if (Array.isArray(data.products)) {
      const partnerForm = document.getElementById('partner-form');
      const checkboxes = partnerForm?.querySelectorAll('input[type="checkbox"]');
      checkboxes?.forEach(cb => {
        cb.checked = data.products.includes(cb.value);
      });
    }
  }

  function syncPartnerFormState() {
    const partnerForm = document.getElementById('partner-form');
    if (!partnerForm) return;

    try {
      const s = PartnerStore.getSession();
      const contactSection = document.getElementById('partner-contact-section');
      const loggedInBadge = document.getElementById('partner-logged-in-badge');
      const partnerEmailEl = document.getElementById('partner-email');
      const partnerPhoneEl = document.getElementById('partner-phone');
      const partnerOwnerEl = document.getElementById('partner-owner-name');
      const editBanner = document.getElementById('partner-edit-banner');
      const editIdText = document.getElementById('partner-edit-id-text');
      const cancelEditBtn = document.getElementById('partner-cancel-edit-btn');
      const submitBtn = partnerForm.querySelector('button[type="submit"]');

      if (s && s.email) {
        // Logged-in user mode
        const all = PartnerStore.getUsers();
        const sEmail = (s.email || '').trim().toLowerCase();
        const u = all.find(u => (u.email || '').trim().toLowerCase() === sEmail);

        partnerEmailVerified = true;
        verifiedPartnerEmail = ((u && u.email) || s.email || '').trim().toLowerCase();

        // Hide contact input section and ensure NO hidden inputs retain required
        if (contactSection) {
          contactSection.style.display = 'none';
          contactSection.querySelectorAll('input, select').forEach(el => el.removeAttribute('required'));
        }

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
          if (intro) {
            intro.innerHTML = `<div style="background:#e3f2fd; color:#0c5460; padding:1rem; border-radius:8px; margin-bottom:1rem; font-weight:bold;"><i class="fas fa-info-circle"></i> You have already submitted an application. You can update your existing details below.</div>`;
          }
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
      const editPartnerId = PartnerStore.getEditAppId();
      if (editPartnerId) {
        const allApps = PartnerStore.getApplications();
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
            cancelEditBtn.onclick = function () {
              PartnerStore.clearEditAppId();
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
              toast('Edit mode cancelled.');
            };
          }
        } else {
          PartnerStore.clearEditAppId();
          if (editBanner) editBanner.style.display = 'none';
        }
      } else {
        if (editBanner) editBanner.style.display = 'none';
      }
    } catch (e) {
      console.warn('[Partner Form State Sync Notice]:', e);
    }
  }

  /* --------------------------------------------------------------------------
     7. Form Submission Handler
     -------------------------------------------------------------------------- */
  function handlePartnerSubmit(e) {
    e.preventDefault();
    const partnerForm = document.getElementById('partner-form');
    if (!partnerForm) return;

    let isUpdate = false;
    const editingAppId = PartnerStore.getEditAppId();

    // Check if user is logged in
    const s = PartnerStore.getSession();
    const allUsers = PartnerStore.getUsers();
    const sEmail = s ? (s.email || '').trim().toLowerCase() : '';
    const currentUser = s ? allUsers.find(u => (u.email || '').trim().toLowerCase() === sEmail) : null;

    // Gather details from form
    const details = {};
    ['bakery-name', 'owner-name', 'type', 'address', 'notes'].forEach(key => {
      const el = document.getElementById(`partner-${key}`);
      if (el) details[key] = el.value.trim();
    });

    // Handle years of operation
    const yearsValue = PartnerYears.getValue();
    if (yearsValue === null) return; // Validation failed inside PartnerYears.getValue()
    details.years = yearsValue;

    // Products of interest
    details.products = Array.from(partnerForm.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    if (currentUser) {
      // Logged in: auto-attach verified user account details
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
        toast('Please enter a valid Gmail address (must end with @gmail.com)');
        validateField(partnerEmailEl, false);
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
        toast('Contact number must be 11 digits starting with 09 (no letters or characters)');
        validateField(partnerPhoneEl, false);
        partnerPhoneEl?.focus();
        return;
      }
      details.phone = cleanPhone;

      // 1. If email belongs to registered user, prompt inline
      const isRegistered = allUsers.some(u => (u.email || '').trim().toLowerCase() === emailVal);
      if (isRegistered) {
        toast('This Gmail address is already registered. Please sign in or use another email.');
        validateField(partnerEmailEl, false);
        if (feedback) {
          if (!feedback.querySelector('#partner-inline-signin-link2')) {
            feedback.innerHTML = `This Gmail address is already registered. Please <a href="#" data-auth-open="signin-modal" id="partner-inline-signin-link2" class="inline-signin-trigger" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;">sign in</a> or use another email.`;
          }
          feedback.style.display = 'block';
        }
        partnerEmailEl?.focus();
        return;
      }

      // 2. Guest Gmail address or phone can only apply ONCE (active/pending)
      const allApps = PartnerStore.getApplications();
      const existingApp = allApps.find(a =>
        (a.status !== 'cancelled') &&
        ((a.details?.email && (a.details.email || '').trim().toLowerCase() === emailVal) ||
         (a.email && (a.email || '').trim().toLowerCase() === emailVal) ||
         (a.details?.phone && (a.details.phone || '').replace(/\D/g, '') === cleanPhone) ||
         (a.phone && (a.phone || '').replace(/\D/g, '') === cleanPhone))
      );
      if (existingApp && (!editingAppId || existingApp.appId.toUpperCase() !== editingAppId.toUpperCase())) {
        toast(`This Gmail address or phone has an active application (ID: ${existingApp.appId}). Guests can only apply once.`);
        if (partnerEmailEl) {
          validateField(partnerEmailEl, false);
          if (feedback) {
            feedback.textContent = `This Gmail address has an active application (${existingApp.appId}). Guests can only apply once. Track it via Track Transactions.`;
            feedback.style.display = 'block';
          }
          partnerEmailEl.focus();
        }
        return;
      }

      // 3. Guest must verify Gmail via OTP
      if (!partnerEmailVerified || emailVal !== verifiedPartnerEmail) {
        toast('Please verify your Gmail address with the OTP code before submitting.');
        PartnerOTP.triggerSend();
        return;
      }
    }

    // Save to global weBakePartnerApplications
    const allApps = PartnerStore.getApplications();
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

    const appId = targetApp ? targetApp.appId : ('WB-PRT-' + Math.floor(10000 + Math.random() * 90000));

    // Fully synchronize root and details properties
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
    PartnerStore.saveApplications(allApps);

    if (editingAppId) {
      PartnerStore.clearEditAppId();
    }

    // Link to logged-in user if session exists
    if (currentUser) {
      currentUser.partnerStatus = currentUser.partnerStatus === 'active' ? 'active' : 'pending';
      currentUser.partnerDetails = details;
      currentUser.partnerAppId = appId;
      PartnerStore.saveUsers(allUsers);
    }

    // Asynchronously dispatch application to Supabase backend API
    const apiBase = window.WEBAKE_API_BASE || (
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000/api'
        : 'https://webake-crbsystem-backend.onrender.com/api'
    );
    fetch(`${apiBase}/partner/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: details['owner-name'] || (currentUser && currentUser.name) || '',
        email: details.email,
        phone: details.phone,
        businessName: details['business-name'] || '',
        businessType: details['business-type'] || 'sari_sari',
        yearsInOperation: details.years || '1-2 years',
        weeklyVolume: details.volume || '50-100 bundles',
        address: details.address || '',
        products: details.products || [],
        notes: details.notes || ''
      })
    }).catch(e => console.warn('[Partner API Sync]:', e.message));

    toast(isUpdate ? 'Partnership application updated successfully!' : 'Partnership application submitted successfully!');

    if (currentUser) {
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
    } else {
      // Guest applicant: Render confirmation card with Reference ID & direct Track link
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
              toast('Application ID copied: ' + appId);
              setTimeout(() => { if (txt) txt.textContent = 'Copy Reference ID'; }, 2000);
            });
          } else {
            toast('Application ID: ' + appId);
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
  }

  /* --------------------------------------------------------------------------
     8. Initialization & Event Wiring
     -------------------------------------------------------------------------- */
  function initPartner() {
    const partnerForm = document.getElementById('partner-form');
    if (!partnerForm) return;

    PartnerYears.init();

    // Verify & OTP buttons
    document.getElementById('btn-partner-verify-email')?.addEventListener('click', PartnerOTP.triggerSend);
    document.getElementById('partner-otp-resend-btn')?.addEventListener('click', PartnerOTP.triggerResend);
    document.getElementById('btn-partner-submit-otp')?.addEventListener('click', PartnerOTP.triggerVerify);

    // Real-time input validation
    const partnerEmailInput = document.getElementById('partner-email');
    partnerEmailInput?.addEventListener('input', () => checkPartnerEmailRealtime(false));
    partnerEmailInput?.addEventListener('blur', () => checkPartnerEmailRealtime(true));

    const partnerPhoneInput = document.getElementById('partner-phone');
    partnerPhoneInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
      const valid = e.target.value.length === 11 && e.target.value.startsWith('09');
      validateField(e.target, valid);
    });

    // Clear form handler
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
      if (PartnerStore.getEditAppId()) {
        PartnerStore.clearEditAppId();
        const editBanner = document.getElementById('partner-edit-banner');
        if (editBanner) editBanner.style.display = 'none';
        const submitBtn = partnerForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
        toast('Form cleared. Edit mode cancelled.');
      }
    });

    // Form submit listener
    partnerForm.addEventListener('submit', handlePartnerSubmit);

    // Initial sync
    syncPartnerFormState();
  }

  // Expose global methods for external hooks (tracking.js, auth.js)
  window.syncPartnerFormState = syncPartnerFormState;
  window.addEventListener('weBakeAuthChange', syncPartnerFormState);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPartner);
  } else {
    initPartner();
  }
})();
