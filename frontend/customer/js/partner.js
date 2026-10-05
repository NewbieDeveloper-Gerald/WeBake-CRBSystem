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
      EDIT_ID: 'weBakeEditPartnerId',
      GUEST_APP: 'weBakeGuestPartnerApp'
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

    setEditAppId(id) {
      if (id) {
        sessionStorage.setItem(this.KEYS.EDIT_ID, id);
      } else {
        sessionStorage.removeItem(this.KEYS.EDIT_ID);
      }
    },

    clearEditAppId() {
      sessionStorage.removeItem(this.KEYS.EDIT_ID);
    },

    getGuestApp() {
      try {
        return JSON.parse(localStorage.getItem(this.KEYS.GUEST_APP));
      } catch (e) {
        return null;
      }
    },

    saveGuestApp(app) {
      if (!app) {
        localStorage.removeItem(this.KEYS.GUEST_APP);
      } else {
        localStorage.setItem(this.KEYS.GUEST_APP, JSON.stringify(app));
      }
    },

    clearGuestApp() {
      localStorage.removeItem(this.KEYS.GUEST_APP);
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
    const bakeryEl = document.getElementById('partner-bakery-name');
    if (bakeryEl) {
      const bName = data['bakery-name'] || data['business-name'] || data.businessName || data.business_name || (rootApp && (rootApp.businessName || rootApp['bakery-name']));
      if (bName) bakeryEl.value = bName;
    }
    const ownerEl = document.getElementById('partner-owner-name');
    if (ownerEl) {
      const oName = data['owner-name'] || data.ownerName || data.fullName || data.full_name || (rootApp && (rootApp.name || rootApp.fullName));
      if (oName) ownerEl.value = oName;
    }
    const typeEl = document.getElementById('partner-type');
    if (typeEl) {
      const tVal = data.type || data['business-type'] || data.businessType || data.business_type;
      if (tVal) {
        const opts = Array.from(typeEl.options);
        const matchIdx = opts.findIndex(o => o.value.toLowerCase() === tVal.toLowerCase() || o.value.toLowerCase().includes(tVal.toLowerCase()) || tVal.toLowerCase().includes(o.value.toLowerCase()));
        if (matchIdx >= 0) {
          typeEl.selectedIndex = matchIdx;
        } else {
          typeEl.value = tVal;
        }
      }
    }
    const addrEl = document.getElementById('partner-address');
    if (addrEl) {
      const aVal = data.address || (rootApp && rootApp.address);
      if (aVal) addrEl.value = aVal;
    }
    const notesEl = document.getElementById('partner-notes');
    if (notesEl) {
      const nVal = data.notes || (rootApp && rootApp.notes);
      if (nVal) notesEl.value = nVal;
    }

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

    const yearsVal = data.years || data.yearsInOperation || data.years_in_operation;
    if (yearsVal) {
      PartnerYears.setValue(yearsVal);
    }

    const prodList = data.products || data.products_of_interest;
    if (Array.isArray(prodList)) {
      const partnerForm = document.getElementById('partner-form');
      const checkboxes = partnerForm?.querySelectorAll('input[type="checkbox"]');
      checkboxes?.forEach(cb => {
        cb.checked = prodList.includes(cb.value);
      });
    }
  }

  function setFormFieldsLocked(isLocked, lockedReasonText) {
    const partnerForm = document.getElementById('partner-form');
    if (!partnerForm) return;

    const inputs = partnerForm.querySelectorAll('input:not([type="hidden"]), select, textarea, button[type="submit"]');
    inputs.forEach(el => {
      el.disabled = isLocked;
    });

    let lockNotice = document.getElementById('partner-form-lock-notice');
    if (isLocked) {
      if (!lockNotice) {
        lockNotice = document.createElement('div');
        lockNotice.id = 'partner-form-lock-notice';
        lockNotice.className = 'partner-locked-note';
        lockNotice.style.cssText = 'background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:12px 16px; border-radius:8px; margin-bottom:1.25rem; font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:0.6rem;';
        const formContainer = partnerForm.parentElement;
        if (formContainer) {
          formContainer.insertBefore(lockNotice, partnerForm);
        }
      }
      lockNotice.innerHTML = `<i class="fas fa-lock"></i> ${lockedReasonText || 'Editing is locked while your application is being reviewed.'}`;
      lockNotice.style.display = 'flex';
    } else {
      if (lockNotice) {
        lockNotice.style.display = 'none';
      }
    }
  }

  let originalFormHtml = '';
  let editStatusPollTimer = null;
  let guestStatusPollTimer = null;
  let lastKnownGuestState = { status: null, updatedAt: null, notes: null };

  function stopGuestStatusPolling() {
    if (guestStatusPollTimer) {
      clearInterval(guestStatusPollTimer);
      guestStatusPollTimer = null;
    }
  }

  function startEditStatusPolling(targetCode, targetEmail) {
    if (editStatusPollTimer) clearInterval(editStatusPollTimer);
    if (!targetCode && !targetEmail) return;

    const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000/api'
        : '/api'
    );

    async function checkCurrentEditStatus() {
      if (document.visibilityState === 'hidden') return;
      try {
        const url = `${apiBase}/partner/my-status?code=${encodeURIComponent(targetCode || '')}&email=${encodeURIComponent(targetEmail || '')}`;
        const res = await fetch(url, { headers: { 'x-user-email': targetEmail || '' } });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.success || !data.application) return;

        const curStatus = (data.application.status || '').toLowerCase();
        if (curStatus !== 'pending') {
          // Status changed away from pending! Lock the form immediately
          setFormFieldsLocked(true, 'Editing is locked while your application is being reviewed.');
          toast('Editing is locked while your application is being reviewed.');
          if (editStatusPollTimer) {
            clearInterval(editStatusPollTimer);
            editStatusPollTimer = null;
          }
        }
      } catch (e) {}
    }

    editStatusPollTimer = setInterval(checkCurrentEditStatus, 5000);
  }

  function startGuestStatusPolling(appId, email, phone) {
    stopGuestStatusPolling();
    if (!appId) return;

    const guestApp = PartnerStore.getGuestApp();
    if (guestApp) {
      lastKnownGuestState = {
        status: (guestApp.status || '').toLowerCase(),
        updatedAt: guestApp.updatedAt || '',
        notes: guestApp.adminNotes || guestApp.staffNotes || ''
      };
    }

    async function pollGuestStatus() {
      if (document.visibilityState === 'hidden') return;
      const editingId = PartnerStore.getEditAppId();
      if (editingId) return; // Do not overwrite while customer is editing

      const currentGuestApp = PartnerStore.getGuestApp();
      if (!currentGuestApp || !currentGuestApp.appId) {
        stopGuestStatusPolling();
        return;
      }

      const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
        window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
          ? 'http://localhost:5000/api'
          : '/api'
      );

      try {
        const cleanPhone = (phone || currentGuestApp.phone || '').replace(/\D/g, '');
        const targetEmail = (email || currentGuestApp.email || '').trim().toLowerCase();
        const url = `${apiBase}/partner/my-status?code=${encodeURIComponent(appId)}&email=${encodeURIComponent(targetEmail)}&phone=${encodeURIComponent(cleanPhone)}`;
        const res = await fetch(url, {
          headers: { 'x-user-email': targetEmail }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.success || !data.application) return;

        const current = data.application;
        const st = (current.status || '').toLowerCase();
        const upd = current.updatedAt || current.reviewedAt || current.submittedAt || '';
        const nts = current.adminNotes || current.staffNotes || '';

        if (lastKnownGuestState.status !== st ||
            lastKnownGuestState.updatedAt !== upd ||
            lastKnownGuestState.notes !== nts) {

          lastKnownGuestState = { status: st, updatedAt: upd, notes: nts };

          currentGuestApp.status = st;
          currentGuestApp.updatedAt = upd;
          currentGuestApp.adminNotes = nts;
          currentGuestApp.staffNotes = nts;
          if (current.businessName) currentGuestApp.businessName = current.businessName;
          if (current.applicantName) currentGuestApp.applicantName = current.applicantName;
          PartnerStore.saveGuestApp(currentGuestApp);

          // Synchronize weBakePartnerApplications
          const allApps = PartnerStore.getApplications();
          const targetApp = allApps.find(a => a.appId && a.appId.toUpperCase() === appId.toUpperCase());
          if (targetApp) {
            targetApp.status = st;
            targetApp.staffNotes = nts;
            targetApp.adminNotes = nts;
            targetApp.updatedAt = upd;
            PartnerStore.saveApplications(allApps);
          }

          let label = 'Application Pending for Review';
          if (st === 'under_review') label = 'Under Review / Contacted';
          else if (st === 'approved' || st === 'active') label = 'Approved Wholesale Partner (Priority Partner)';
          else if (st === 'rejected' || st === 'declined') label = 'Application Declined';
          else if (st === 'cancelled') label = 'Cancelled Partnership';

          toast(`Partnership status updated: ${label}`);
          renderGuestLiveStatusView(currentGuestApp);
        }

        if (st === 'rejected' || st === 'declined' || st === 'cancelled') {
          stopGuestStatusPolling();
        }
      } catch (e) {
        // Keep last known state on transient network error
      }
    }

    // Run immediate check (0ms), then poll every 5000ms
    pollGuestStatus();
    guestStatusPollTimer = setInterval(pollGuestStatus, 5000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (editStatusPollTimer) {
        const s = PartnerStore.getSession();
        const editingId = PartnerStore.getEditAppId();
        if (editingId || (s && s.email)) {
          startEditStatusPolling(editingId || s?.partnerAppId, s?.email);
        }
      }
      if (guestStatusPollTimer) {
        const guestApp = PartnerStore.getGuestApp();
        if (guestApp && guestApp.appId) {
          startGuestStatusPolling(guestApp.appId, guestApp.email, guestApp.phone);
        }
      }
    }
  });

  function restorePartnerFormHtml() {
    stopGuestStatusPolling();
    const formContainer = document.querySelector('.partner-form-container');
    if (!formContainer || !originalFormHtml) return;
    formContainer.innerHTML = originalFormHtml;
    initPartnerFormEvents();
    syncPartnerFormState();
  }

  function renderGuestLiveStatusView(appData) {
    const formContainer = document.querySelector('.partner-form-container');
    if (!formContainer) return;

    const esc = (typeof window.escapeHtml === 'function')
      ? window.escapeHtml
      : (str) => String(str || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));

    const appId = esc(appData.appId || appData.applicationCode || 'WB-PRT-00000');
    const appStatus = (appData.status || 'pending').toLowerCase();
    const details = appData.details || {};
    const businessName = esc(details['business-name'] || details['bakery-name'] || details.businessName || appData.businessName || 'Your Business');
    const ownerName = esc(details['owner-name'] || details.ownerName || appData.applicantName || 'Applicant');
    const bType = esc(details['type'] || details['business-type'] || details.businessType || appData.businessType || 'Bakery');
    const years = esc(details.years || details.yearsInOperation || appData.yearsInOperation || '1-2 years');
    const address = esc(details.address || appData.deliveryAddress || 'N/A');
    const phone = esc(details.phone || appData.phone || appData.applicantPhone || 'N/A');
    const email = esc(details.email || appData.email || appData.applicantEmail || 'N/A');
    const notes = esc(details.notes || appData.notes || '');
    const staffNotes = esc(appData.adminNotes || appData.staffNotes || details.adminNotes || details.staffNotes || '');
    const products = Array.isArray(details.products)
      ? details.products.map(p => esc(p)).join(', ')
      : (Array.isArray(appData.products) ? appData.products.map(p => esc(p)).join(', ') : 'All Products');

    let statusBadgeHtml = '';
    let statusBannerHtml = '';
    let actionsHtml = '';

    if (appStatus === 'approved' || appStatus === 'active') {
      statusBadgeHtml = `
        <span class="partner-badge badge-priority-partner partner-status-pulse">
          <i class="fas fa-crown"></i> Approved Wholesale Partner (Priority Partner)
        </span>
      `;
      statusBannerHtml = `
        <div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:1.1rem 1.25rem; border-radius:8px; margin-bottom:1.25rem; color:#92400e; font-size:0.92rem; line-height:1.6;">
          <div style="font-weight:700; font-size:1.05rem; margin-bottom:0.35rem; color:#78350f;">
            <i class="fas fa-crown"></i> Congratulations! Your Wholesale Partnership is Approved
          </div>
          <div>
            You are officially registered as an authorized wholesale reseller for <strong>${businessName}</strong>! As an authorized <strong>Priority Partner</strong>, your orders receive top baking queue priority, guaranteed morning delivery scheduling, priority stock allocation, and 50% reservation terms.
          </div>
        </div>
      `;
      actionsHtml = `
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap; border-top:1px solid #f0e7dc; padding-top:1rem;">
          <button type="button" class="btn btn-outline" id="guest-btn-track-trans" style="padding:0.5rem 1.2rem; font-size:0.88rem;">
            <i class="fas fa-search-dollar"></i> Track Transactions
          </button>
          <button type="button" class="btn btn-primary" id="guest-btn-cancel-partner" style="padding:0.5rem 1.2rem; font-size:0.88rem; background:#dc3545; border-color:#dc3545;">
            <i class="fas fa-ban"></i> Cancel Partnership
          </button>
        </div>
      `;
    } else if (appStatus === 'under_review' || appStatus === 'reviewing' || appStatus === 'contacted') {
      statusBadgeHtml = `
        <span class="partner-badge badge-under_review">
          <i class="fas fa-user-clock"></i> Under Review / Contacted
        </span>
      `;
      statusBannerHtml = `
        <div style="background:#f0f9ff; border-left:4px solid #0284c7; padding:1.1rem 1.25rem; border-radius:8px; margin-bottom:1.25rem; color:#0369a1; font-size:0.92rem; line-height:1.6;">
          <div style="font-weight:700; font-size:1.02rem; margin-bottom:0.35rem;">
            <i class="fas fa-user-clock"></i> Application Under Review / Store Contacted
          </div>
          <div>
            Bakery management is actively reviewing your store location and evaluating delivery logistics. Our team may reach out to you directly via phone or email to confirm weekly order volumes and schedule details.
          </div>
          <div class="partner-locked-note" style="margin-top:0.75rem;">
            <i class="fas fa-lock"></i> Editing is locked while your application is being reviewed.
          </div>
        </div>
      `;
      actionsHtml = `
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap; border-top:1px solid #f0e7dc; padding-top:1rem;">
          <button type="button" class="btn btn-outline" id="guest-btn-track-trans" style="padding:0.5rem 1.2rem; font-size:0.88rem;">
            <i class="fas fa-search-dollar"></i> Track Transactions
          </button>
          <button type="button" class="btn btn-primary" id="guest-btn-cancel-partner" style="padding:0.5rem 1.2rem; font-size:0.88rem; background:#dc3545; border-color:#dc3545;">
            <i class="fas fa-ban"></i> Cancel Request
          </button>
        </div>
      `;
    } else if (appStatus === 'rejected' || appStatus === 'declined') {
      statusBadgeHtml = `
        <span class="partner-badge badge-rejected">
          <i class="fas fa-times-circle"></i> Application Declined
        </span>
      `;
      statusBannerHtml = `
        <div style="background:#f8d7da; border-left:4px solid #dc3545; padding:1.1rem 1.25rem; border-radius:8px; margin-bottom:1.25rem; color:#721c24; font-size:0.92rem; line-height:1.6;">
          <div style="font-weight:700; font-size:1.02rem; margin-bottom:0.35rem;">
            <i class="fas fa-times-circle"></i> Application Notice: Declined
          </div>
          <div>
            Thank you for your interest in partnering with Crumbs N' Rolls Bakery. Unfortunately, your wholesale application was declined at this time. You may review your business profile and submit a revised application below.
          </div>
        </div>
      `;
      actionsHtml = `
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap; border-top:1px solid #f0e7dc; padding-top:1rem;">
          <button type="button" class="btn btn-primary" id="guest-btn-reapply" style="padding:0.5rem 1.4rem; font-size:0.88rem;">
            <i class="fas fa-redo"></i> Apply Again
          </button>
        </div>
      `;
    } else if (appStatus === 'cancelled') {
      statusBadgeHtml = `
        <span class="partner-badge badge-cancelled">
          <i class="fas fa-ban"></i> Cancelled Partnership
        </span>
      `;
      statusBannerHtml = `
        <div style="background:#f8f9fa; border-left:4px solid #6c757d; padding:1.1rem 1.25rem; border-radius:8px; margin-bottom:1.25rem; color:#495057; font-size:0.92rem; line-height:1.6;">
          <div style="font-weight:700; font-size:1.02rem; margin-bottom:0.35rem;">
            <i class="fas fa-ban"></i> Partnership Cancelled
          </div>
          <div>
            This wholesale partnership application has been cancelled. If you wish to apply again, you may submit a new wholesale application at any time.
          </div>
        </div>
      `;
      actionsHtml = `
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap; border-top:1px solid #f0e7dc; padding-top:1rem;">
          <button type="button" class="btn btn-primary" id="guest-btn-reapply" style="padding:0.5rem 1.4rem; font-size:0.88rem;">
            <i class="fas fa-paper-plane"></i> Submit New Application
          </button>
        </div>
      `;
    } else {
      // Default: Pending
      statusBadgeHtml = `
        <span class="partner-badge badge-pending">
          <i class="fas fa-clock"></i> Application Pending for Review
        </span>
      `;
      statusBannerHtml = `
        <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:1.1rem 1.25rem; border-radius:8px; margin-bottom:1.25rem; color:#856404; font-size:0.92rem; line-height:1.6;">
          <div style="font-weight:700; font-size:1.02rem; margin-bottom:0.35rem;">
            <i class="fas fa-clock"></i> Application Pending for Review
          </div>
          <div>
            Your wholesale partnership application has been submitted and is pending initial review by bakery management. Our team usually reviews applications within 24–48 hours. You may edit your submitted details below while pending.
          </div>
        </div>
      `;
      actionsHtml = `
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap; border-top:1px solid #f0e7dc; padding-top:1rem;">
          <button type="button" class="btn btn-outline" id="guest-btn-edit-app" style="padding:0.5rem 1.2rem; font-size:0.88rem;">
            <i class="fas fa-edit"></i> Edit Application
          </button>
          <button type="button" class="btn btn-outline" id="guest-btn-track-trans" style="padding:0.5rem 1.2rem; font-size:0.88rem;">
            <i class="fas fa-search-dollar"></i> Track Transactions
          </button>
          <button type="button" class="btn btn-primary" id="guest-btn-cancel-partner" style="padding:0.5rem 1.2rem; font-size:0.88rem; background:#dc3545; border-color:#dc3545;">
            <i class="fas fa-ban"></i> Cancel Request
          </button>
        </div>
      `;
    }

    const staffNotesHtml = staffNotes ? `
      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:0.85rem 1.15rem; margin-bottom:1.25rem; font-size:0.88rem; color:#0369a1; line-height:1.5;">
        <strong><i class="fas fa-comment-dots"></i> Bakery Staff Remarks:</strong> "${staffNotes}"
      </div>
    ` : '';

    formContainer.innerHTML = `
      <div class="partner-live-card" style="padding:0.5rem 0;">
        <!-- Top Reference & Status Badge Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1.25rem; padding-bottom:1rem; border-bottom:1px solid #eee;">
          <div>
            <span style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#888; display:block; letter-spacing:0.5px;">Application Reference ID</span>
            <div style="display:flex; align-items:center; gap:0.6rem; margin-top:0.2rem;">
              <span style="font-size:1.6rem; font-weight:800; color:var(--primary);" id="guest-ref-id">${appId}</span>
              <button type="button" class="btn btn-sm btn-outline" id="guest-btn-copy-id" style="padding:0.25rem 0.65rem; font-size:0.75rem;">
                <i class="far fa-copy"></i> <span id="guest-copy-txt">Copy</span>
              </button>
            </div>
          </div>
          <div>
            ${statusBadgeHtml}
          </div>
        </div>

        <!-- Live Status Banner -->
        ${statusBannerHtml}

        <!-- Bakery Staff Remarks (if any) -->
        ${staffNotesHtml}

        <!-- Submitted Information Details Box -->
        <div style="background:#faf6f0; border:1px solid #ebd9c8; border-radius:8px; padding:1.15rem 1.25rem; margin-bottom:1rem; font-size:0.86rem; line-height:1.7;">
          <div style="font-weight:700; color:var(--primary); font-size:0.95rem; margin-bottom:0.5rem; border-bottom:1px solid #ebd9c8; padding-bottom:0.35rem;">
            <i class="fas fa-store"></i> Submitted Business Details
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.4rem 1.5rem;">
            <div><strong>Business Name:</strong> ${businessName}</div>
            <div><strong>Representative:</strong> ${ownerName}</div>
            <div><strong>Business Type:</strong> ${bType}</div>
            <div><strong>Years in Operation:</strong> ${years}</div>
            <div><strong>Delivery Address:</strong> ${address}</div>
            <div><strong>Contact Phone:</strong> ${phone}</div>
            <div><strong>Verified Gmail:</strong> ${email}</div>
            <div><strong>Products of Interest:</strong> ${products}</div>
          </div>
          ${notes ? `<div style="margin-top:0.5rem; padding-top:0.35rem; border-top:1px dashed #ebd9c8;"><strong>Additional Notes:</strong> ${notes}</div>` : ''}
        </div>

        <!-- Live Sync Status Indicator -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:#888; margin-top:0.5rem;">
          <span style="display:inline-flex; align-items:center; gap:0.35rem;">
            <i class="fas fa-sync ${appStatus === 'rejected' || appStatus === 'cancelled' ? '' : 'fa-spin'}" style="color:var(--primary);"></i>
            ${appStatus === 'rejected' || appStatus === 'cancelled' ? 'Status Finalized' : 'Near-Real-Time Sync Active (checks every 5s)'}
          </span>
          <span>Submitted: ${esc(appData.submittedAt ? new Date(appData.submittedAt).toLocaleDateString() : 'Recent')}</span>
        </div>

        <!-- Action Buttons -->
        ${actionsHtml}
      </div>
    `;

    // Wire buttons
    document.getElementById('guest-btn-copy-id')?.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(appData.appId || appId).then(() => {
          const txt = document.getElementById('guest-copy-txt');
          if (txt) txt.textContent = 'Copied!';
          toast('Reference ID copied: ' + (appData.appId || appId));
          setTimeout(() => { if (txt) txt.textContent = 'Copy'; }, 2000);
        });
      } else {
        toast('Reference ID: ' + (appData.appId || appId));
      }
    });

    document.getElementById('guest-btn-track-trans')?.addEventListener('click', () => {
      if (window.openTrackOrderModal) {
        window.openTrackOrderModal(appData.appId || appId, email || phone || '', 'partner');
      }
    });

    document.getElementById('guest-btn-edit-app')?.addEventListener('click', () => {
      PartnerStore.setEditAppId(appData.appId || appId);
      restorePartnerFormHtml();
    });

    document.getElementById('guest-btn-reapply')?.addEventListener('click', () => {
      PartnerStore.clearGuestApp();
      PartnerStore.clearEditAppId();
      restorePartnerFormHtml();
      toast('You may now fill out and submit a new application.');
    });

    document.getElementById('guest-btn-cancel-partner')?.addEventListener('click', () => {
      const isApproved = (appStatus === 'approved' || appStatus === 'active');
      const promptMsg = isApproved
        ? 'Are you sure you want to cancel your wholesale partnership? Priority partner privileges will end immediately.'
        : 'Are you sure you want to cancel your partnership request? This action cannot be undone.';

      const doCancel = async () => {
        appData.status = 'cancelled';
        appData.cancelledAt = new Date().toISOString();
        PartnerStore.saveGuestApp(appData);

        const allApps = PartnerStore.getApplications();
        const target = allApps.find(a => a.appId && a.appId.toUpperCase() === (appData.appId || appId).toUpperCase());
        if (target) {
          target.status = 'cancelled';
          target.cancelledAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          PartnerStore.saveApplications(allApps);
        }

        stopGuestStatusPolling();

        const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
          window.location.protocol === 'file:' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api'
            : '/api'
        );

        try {
          await fetch(`${apiBase}/partner/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email,
              appId: appData.appId || appId,
              phone: phone
            })
          });
        } catch (e) {
          console.warn('[Cloud Partner Cancel Network Notice]:', e);
        }

        toast('Partnership request cancelled.');
        renderGuestLiveStatusView(appData);
        window.dispatchEvent(new CustomEvent('weBakePartnerChange'));
      };

      if (window.WeBakeModals && typeof window.WeBakeModals.confirmCancelPartner === 'function') {
        window.WeBakeModals.confirmCancelPartner({ onConfirm: doCancel });
      } else if (confirm(promptMsg)) {
        doCancel();
      }
    });
  }

  function syncPartnerFormState() {
    const s = PartnerStore.getSession();
    const guestApp = PartnerStore.getGuestApp();
    const editPartnerId = PartnerStore.getEditAppId();

    // 1. If guest has active application and not in edit mode, render live status view
    if (!s || !s.email) {
      if (guestApp && guestApp.appId && !editPartnerId) {
        renderGuestLiveStatusView(guestApp);
        startGuestStatusPolling(guestApp.appId, guestApp.email, guestApp.phone);
        return;
      }
    }

    // 2. Form mode (logged-in, guest editing, or blank guest form)
    let partnerForm = document.getElementById('partner-form');
    if (!partnerForm) {
      if (originalFormHtml) {
        restorePartnerFormHtml();
        return;
      }
      return;
    }

    try {
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

        const userPhone = ((u && (u.contact || u.phone)) || s.contact || s.phone || '').replace(/\D/g, '');
        const hasValidPhone = userPhone.length === 11 && userPhone.startsWith('09');

        if (loggedInBadge) {
          loggedInBadge.style.display = 'block';
          const badgeName = document.getElementById('partner-badge-name');
          const badgeEmail = document.getElementById('partner-badge-email');
          const badgePhone = document.getElementById('partner-badge-phone');
          if (badgeName) badgeName.textContent = (u && u.name) || s.name || 'Account Holder';
          if (badgeEmail) badgeEmail.textContent = (u && u.email) || s.email || '';
          if (badgePhone) badgePhone.textContent = hasValidPhone ? userPhone : 'Not provided in profile';
        }

        if (contactSection) {
          if (!hasValidPhone) {
            contactSection.style.display = 'block';
            const emailGroup = partnerEmailEl?.closest('.form-group');
            if (emailGroup) emailGroup.style.display = 'none';
            if (partnerEmailEl) partnerEmailEl.removeAttribute('required');
            if (partnerPhoneEl) {
              partnerPhoneEl.setAttribute('required', '');
              if (userPhone) partnerPhoneEl.value = userPhone;
            }
          } else {
            contactSection.style.display = 'none';
            contactSection.querySelectorAll('input, select').forEach(el => el.removeAttribute('required'));
          }
        }

        // Auto-fill representative name if empty
        if (partnerOwnerEl && !partnerOwnerEl.value && ((u && u.name) || s.name)) {
          partnerOwnerEl.value = (u && u.name) || s.name;
        }

        const effStatus = ((u && u.partnerStatus) || s.partnerStatus || '').toLowerCase();
        const effDetails = (u && u.partnerDetails) || s.partnerDetails;

        if (effStatus === 'active' || effStatus === 'approved' || effStatus === 'accepted') {
          const intro = document.querySelector('.partner-intro');
          if (intro) {
            intro.innerHTML = `<div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:1rem; border-radius:8px; margin-bottom:1rem; color:#92400e; font-weight:600;"><i class="fas fa-crown"></i> <strong>Priority Wholesale Partner Active:</strong> Your wholesale partnership is approved and active! Application details are read-only.</div>`;
          }
          if (effDetails) populatePartnerFields(effDetails, u || s);
          setFormFieldsLocked(true, 'Your wholesale partnership is approved and active. Editing is locked.');
        } else if (effStatus === 'under_review' || effStatus === 'reviewing' || effStatus === 'contacted') {
          const intro = document.querySelector('.partner-intro');
          if (intro) {
            intro.innerHTML = `<div style="background:#e0f2fe; border-left:4px solid #0284c7; padding:1rem; border-radius:8px; margin-bottom:1rem; color:#0369a1; font-weight:600;"><i class="fas fa-user-clock"></i> <strong>Application Under Review / Contacted:</strong> Bakery management is actively reviewing your store application and checking delivery logistics.</div>`;
          }
          if (effDetails) populatePartnerFields(effDetails, u || s);
          setFormFieldsLocked(true, 'Editing is locked while your application is being reviewed.');
        } else if (effStatus === 'pending') {
          const intro = document.querySelector('.partner-intro');
          if (intro) {
            intro.innerHTML = `<div style="background:#fff3cd; border-left:4px solid #ffc107; padding:1rem; border-radius:8px; margin-bottom:1rem; color:#856404; font-weight:600;"><i class="fas fa-clock"></i> <strong>Application Pending for Review:</strong> Your wholesale application has been submitted and is pending initial review by bakery management. You may edit your submitted details below.</div>`;
          }
          if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Application Changes';
          if (effDetails) populatePartnerFields(effDetails, u || s);
          setFormFieldsLocked(false);
          startEditStatusPolling(u?.partnerAppId || s?.partnerAppId, u?.email || s?.email);
        } else if (effStatus === 'rejected' || effStatus === 'declined') {
          const intro = document.querySelector('.partner-intro');
          if (intro) {
            intro.innerHTML = `<div style="background:#f8d7da; border-left:4px solid #dc3545; padding:1rem; border-radius:8px; margin-bottom:1rem; color:#721c24; font-weight:600;"><i class="fas fa-redo"></i> Your previous application was declined. You may update your business information and re-apply below.</div>`;
          }
          if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Re-apply for Partnership';
          if (effDetails) populatePartnerFields(effDetails, u || s);
          setFormFieldsLocked(false);
        } else if (effStatus === 'cancelled') {
          const intro = document.querySelector('.partner-intro');
          if (intro) {
            intro.innerHTML = `<div style="background:#f8f9fa; border-left:4px solid #6c757d; padding:1rem; border-radius:8px; margin-bottom:1rem; color:#495057; font-weight:600;"><i class="fas fa-handshake"></i> Your previous partnership was cancelled. You may submit a new application below.</div>`;
          }
          if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
          setFormFieldsLocked(false);
        } else {
          setFormFieldsLocked(false);
        }
      } else {
        // Guest mode: check if guest has an active application
        const guestApp = PartnerStore.getGuestApp();
        const editPartnerId = PartnerStore.getEditAppId();
        if (guestApp && guestApp.appId && !editPartnerId) {
          renderGuestLiveStatusView(guestApp);
          startGuestStatusPolling(guestApp.appId, guestApp.email, guestApp.phone);
          return;
        }

        // Guest application form view
        if (contactSection) contactSection.style.display = 'block';
        if (loggedInBadge) loggedInBadge.style.display = 'none';
        if (partnerEmailEl) partnerEmailEl.setAttribute('required', '');
        if (partnerPhoneEl) partnerPhoneEl.setAttribute('required', '');
        setFormFieldsLocked(false);
      }

      // Check if user is editing a specific application (e.g. from Track Transaction modal or Guest Live View)
      if (editPartnerId) {
        const guestApp = PartnerStore.getGuestApp();
        const allApps = PartnerStore.getApplications();
        let editApp = (guestApp && guestApp.appId && guestApp.appId.toUpperCase() === editPartnerId.toUpperCase()) ? guestApp : null;
        if (!editApp) {
          editApp = allApps.find(a => a.appId && a.appId.toUpperCase() === editPartnerId.toUpperCase());
        }
        if (editApp && editApp.status !== 'cancelled') {
          populatePartnerFields(editApp.details || {}, editApp);

          if (editApp.status !== 'pending') {
            setFormFieldsLocked(true, 'Editing is locked while your application is being reviewed.');
          } else {
            setFormFieldsLocked(false);
            startEditStatusPolling(editApp.appId, editApp.email || editApp.details?.email);
          }

          if (editBanner) {
            editBanner.style.display = 'flex';
            if (editIdText) editIdText.textContent = editApp.appId;
          }

          if (submitBtn && editApp.status === 'pending') {
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Application Changes';
          }

          if (cancelEditBtn) {
            cancelEditBtn.onclick = function () {
              PartnerStore.clearEditAppId();
              if (editBanner) editBanner.style.display = 'none';
              const currentGuest = PartnerStore.getGuestApp();
              if (currentGuest && currentGuest.appId && (!s || !s.email)) {
                renderGuestLiveStatusView(currentGuest);
                startGuestStatusPolling(currentGuest.appId, currentGuest.email, currentGuest.phone);
                toast('Edit mode cancelled.');
                return;
              }
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
  async function handlePartnerSubmit(e) {
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

    // Synchronize aliases so both frontend & backend conventions match
    details['business-name'] = details['bakery-name'] || '';
    details['business-type'] = details['type'] || 'Bakery';
    details.businessName = details['business-name'];
    details.businessType = details['business-type'];

    // Handle years of operation
    const yearsValue = PartnerYears.getValue();
    if (yearsValue === null) return; // Validation failed inside PartnerYears.getValue()
    details.years = yearsValue;

    // Products of interest
    details.products = Array.from(partnerForm.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    // Validate business fields
    if (!details['business-name']) {
      toast('Please enter your bakery or business name.');
      document.getElementById('partner-bakery-name')?.focus();
      return;
    }
    if (!details['type']) {
      toast('Please select a business type.');
      document.getElementById('partner-type')?.focus();
      return;
    }
    if (!details.address) {
      toast('Please enter your business address.');
      document.getElementById('partner-address')?.focus();
      return;
    }

    if (currentUser) {
      // Logged in: auto-attach verified user account details
      details.email = currentUser.email || s.email;
      let userPhone = ((currentUser.contact || currentUser.phone || s.contact || s.phone || '')).replace(/\D/g, '');
      const phoneInput = document.getElementById('partner-phone');
      const inputPhone = (phoneInput?.value || '').replace(/\D/g, '');

      if (inputPhone.length === 11 && inputPhone.startsWith('09')) {
        userPhone = inputPhone;
        currentUser.contact = userPhone;
        currentUser.phone = userPhone;
        PartnerStore.saveUsers(allUsers);
      }

      if (userPhone.length !== 11 || !userPhone.startsWith('09')) {
        toast('Please enter a valid 11-digit mobile number starting with 09 in the contact field.');
        const contactSection = document.getElementById('partner-contact-section');
        if (contactSection) {
          contactSection.style.display = 'block';
          const emailGroup = document.getElementById('partner-email')?.closest('.form-group');
          if (emailGroup) emailGroup.style.display = 'none';
        }
        phoneInput?.focus();
        return;
      }
      details.phone = userPhone;
      if (!details['owner-name']) {
        details['owner-name'] = currentUser.name || s.name || '';
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

    if (window._isPartnerFormSubmitting) return;
    window._isPartnerFormSubmitting = true;

    const submitBtn = partnerForm.querySelector('button[type="submit"]');
    const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }

    const apiBase = (window.WEBAKE_CONFIG && window.WEBAKE_CONFIG.API_BASE) || window.WEBAKE_API_BASE || (
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000/api'
        : '/api'
    );

    const payload = {
      fullName: details['owner-name'] || (currentUser && currentUser.name) || '',
      email: details.email,
      phone: details.phone,
      businessName: details['bakery-name'] || details['business-name'] || '',
      businessType: details['type'] || details['business-type'] || 'Bakery',
      yearsInOperation: details.years || '1-2 years',
      weeklyVolume: details.volume || '50-100 bundles',
      address: details.address || '',
      products: details.products || [],
      notes: details.notes || ''
    };

    let serverSuccess = false;
    let returnedAppId = null;
    let returnedStatus = 'pending';

    const isPendingEdit = Boolean(editingAppId) || Boolean(currentUser && currentUser.partnerStatus === 'pending' && currentUser.partnerAppId);
    const targetCode = editingAppId || (currentUser && currentUser.partnerAppId);

    try {
      if (isPendingEdit && targetCode) {
        // Send PATCH request to edit existing pending application
        const patchPayload = {
          fullName: payload.fullName,
          phone: payload.phone,
          businessName: payload.businessName,
          businessType: payload.businessType,
          yearsInOperation: payload.yearsInOperation,
          weeklyVolume: payload.weeklyVolume,
          address: payload.address,
          products: payload.products,
          notes: payload.notes,
          email: payload.email
        };

        const res = await fetch(`${apiBase}/partner/${encodeURIComponent(targetCode)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': payload.email
          },
          credentials: 'include',
          body: JSON.stringify(patchPayload)
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.success) {
          if (res.status === 403 || (data && data.message && data.message.includes('locked'))) {
            toast('Editing is locked while your application is being reviewed.');
            setFormFieldsLocked(true, 'Editing is locked while your application is being reviewed.');
          } else {
            toast((data && data.message) || (data && data.error) || 'Failed to update application.');
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnHtml;
          }
          return;
        }

        serverSuccess = true;
        returnedAppId = targetCode;
        returnedStatus = data.status || 'pending';
      } else {
        // Submit new application via POST
        const res = await fetch(`${apiBase}/partner/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.success) {
          const errorMsg = (data && data.message) || (data && data.error) || 'Failed to submit application. Please check your details and try again.';
          toast(errorMsg);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnHtml;
          }
          return;
        }

        serverSuccess = true;
        returnedAppId = data.applicationCode || data.applicationId;
        returnedStatus = data.status || 'pending';
      }
    } catch (netErr) {
      console.warn('[Partner API Network Error, falling back to local save]:', netErr);
      serverSuccess = true;
    } finally {
      window._isPartnerFormSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml;
      }
    }

    if (!serverSuccess) return;

    // Save to global weBakePartnerApplications
    const allApps = PartnerStore.getApplications();
    let targetApp = null;
    if (editingAppId) {
      targetApp = allApps.find(a => a.appId && a.appId.toUpperCase() === editingAppId.toUpperCase());
    }
    if (!targetApp && currentUser && currentUser.partnerAppId) {
      targetApp = allApps.find(a => a.appId && a.appId.toUpperCase() === currentUser.partnerAppId.toUpperCase());
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

    const appId = returnedAppId || (targetApp ? targetApp.appId : ('WB-PRT-' + Math.floor(10000 + Math.random() * 90000)));

    // Fully synchronize root and details properties
    if (targetApp) {
      isUpdate = true;
      targetApp.appId = appId;
      targetApp.email = details.email;
      targetApp.phone = details.phone;
      targetApp.status = returnedStatus || targetApp.status || 'pending';
      targetApp.details = { ...(targetApp.details || {}), ...details, email: details.email, phone: details.phone };
      targetApp.updatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
      allApps.unshift({
        appId: appId,
        email: details.email,
        phone: details.phone,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: returnedStatus || 'pending',
        details: { ...details, email: details.email, phone: details.phone }
      });
    }
    PartnerStore.saveApplications(allApps);

    if (editingAppId) {
      PartnerStore.clearEditAppId();
    }

    // Link to logged-in user if session exists
    if (currentUser) {
      currentUser.partnerStatus = returnedStatus || (currentUser.partnerStatus === 'active' ? 'active' : 'pending');
      currentUser.partnerDetails = { ...details, email: details.email, phone: details.phone };
      currentUser.partnerAppId = appId;
      PartnerStore.saveUsers(allUsers);
    }

    toast(isUpdate ? 'Partnership application updated successfully!' : 'Partnership application submitted successfully!');

    if (currentUser) {
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    } else {
      // Guest applicant: update guest store and render live status view with real-time polling
      const guestApp = {
        appId: appId,
        email: details.email,
        phone: details.phone,
        status: returnedStatus || 'pending',
        adminNotes: '',
        staffNotes: '',
        submittedAt: (targetApp && targetApp.date) ? targetApp.date : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        details: { ...details }
      };
      PartnerStore.saveGuestApp(guestApp);
      PartnerStore.clearEditAppId();

      renderGuestLiveStatusView(guestApp);
      startGuestStatusPolling(appId, details.email, details.phone);
      const formContainer = document.querySelector('.partner-form-container');
      if (formContainer) {
        window.scrollTo({ top: formContainer.offsetTop - 100, behavior: 'smooth' });
      }
    }
  }

  /* --------------------------------------------------------------------------
     8. Initialization & Event Wiring
     -------------------------------------------------------------------------- */
  function initPartnerFormEvents() {
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
  }

  function initPartner() {
    const formContainer = document.querySelector('.partner-form-container');
    if (formContainer && !originalFormHtml) {
      originalFormHtml = formContainer.innerHTML;
    }

    initPartnerFormEvents();

    // Initial sync
    syncPartnerFormState();
  }

  // Cross-tab and external sync listeners
  window.addEventListener('weBakePartnerChange', () => {
    const s = PartnerStore.getSession();
    if (!s || !s.email) {
      const guestApp = PartnerStore.getGuestApp();
      if (guestApp && !PartnerStore.getEditAppId()) {
        renderGuestLiveStatusView(guestApp);
      }
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === PartnerStore.KEYS.GUEST_APP || e.key === PartnerStore.KEYS.APPS) {
      const s = PartnerStore.getSession();
      if (!s || !s.email) {
        const guestApp = PartnerStore.getGuestApp();
        if (guestApp && !PartnerStore.getEditAppId()) {
          renderGuestLiveStatusView(guestApp);
        }
      }
    }
  });

  // Expose global methods for external hooks (tracking.js, auth.js)
  window.syncPartnerFormState = syncPartnerFormState;
  window.addEventListener('weBakeAuthChange', () => {
    restorePartnerFormHtml();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPartner);
  } else {
    initPartner();
  }
})();
