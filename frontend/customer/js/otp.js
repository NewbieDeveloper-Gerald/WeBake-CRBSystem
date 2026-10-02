/**
 * ====================================================================
 * WeBake - Standalone OTP Verification Module (otp.js)
 * Clean, secure client interface for sending & verifying real OTP codes
 * ZERO browser storage or client-side code generation.
 * ====================================================================
 */

(function (window) {
  'use strict';

  // Configurable API Base URL (defaults to localhost:5000 for local dev or relative /api when hosted)
  const API_BASE = window.WEBAKE_API_BASE || (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5000/api'
      : '/api'
  );

  const OTP_TIMER_KEY = '_weBakeOtpTimer';

  const WeBakeOTP = {
    /**
     * Validates email format strictly
     */
    isValidEmail: function (email) {
      if (!email || typeof email !== 'string') return false;
      const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return re.test(email.trim());
    },

    /**
     * Toggles button state with loading indicator
     */
    setButtonState: function (buttonEl, isLoading, loadingText) {
      if (!buttonEl) return;
      if (isLoading) {
        buttonEl.disabled = true;
        if (!buttonEl.dataset.originalHtml) {
          buttonEl.dataset.originalHtml = buttonEl.innerHTML;
        }
        buttonEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText || 'Please wait...'}`;
      } else {
        buttonEl.disabled = false;
        if (buttonEl.dataset.originalHtml) {
          buttonEl.innerHTML = buttonEl.dataset.originalHtml;
        }
      }
    },

    /**
     * Sends OTP request to the backend service
     */
    send: async function (options) {
      const {
        email,
        purpose = 'verification',
        buttonEl = null,
        errorEl = null,
        successEl = null,
        loadingText = 'Sending code...',
        onStart = null,
        onSuccess = null,
        onError = null
      } = options || {};

      // Clear previous messages
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
      if (successEl) { successEl.style.display = 'none'; successEl.textContent = ''; }

      // 1. Email format validation
      if (!this.isValidEmail(email)) {
        const msg = 'Please enter a valid email address.';
        if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
        if (typeof onError === 'function') onError(msg, 'invalid_email');
        return false;
      }

      // UI Loading state
      if (typeof onStart === 'function') onStart();
      this.setButtonState(buttonEl, true, loadingText);

      try {
        const response = await fetch(`${API_BASE}/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), purpose })
        });

        const data = await response.json().catch(() => ({}));

        this.setButtonState(buttonEl, false);

        if (!response.ok || !data.success) {
          let errorMsg = data.message || 'Sending failed. Please try again.';
          if (data.error === 'cooldown') {
            errorMsg = data.message || 'Please wait before requesting another code.';
          } else if (data.error === 'sending_failed') {
            errorMsg = data.message || 'Sending failed. Please check mailer settings.';
          }

          if (errorEl) { errorEl.textContent = errorMsg; errorEl.style.display = 'block'; }
          if (typeof onError === 'function') onError(errorMsg, data.error || 'request_failed', data);
          return false;
        }

        const successMsg = data.message || 'Verification code sent to your email!';
        if (successEl) { successEl.textContent = successMsg; successEl.style.display = 'block'; }
        if (typeof onSuccess === 'function') onSuccess(data);
        return true;

      } catch (err) {
        this.setButtonState(buttonEl, false);
        console.error('[WeBakeOTP] Network error sending OTP:', err);
        const networkErrorMsg = 'Cannot reach verification server. Please make sure the backend is running.';
        if (errorEl) { errorEl.textContent = networkErrorMsg; errorEl.style.display = 'block'; }
        if (typeof onError === 'function') onError(networkErrorMsg, 'network_error');
        return false;
      }
    },

    /**
     * Verifies 6-digit OTP code against backend service
     */
    verify: async function (options) {
      const {
        email,
        code,
        purpose = 'verification',
        buttonEl = null,
        errorEl = null,
        loadingText = 'Verifying...',
        onStart = null,
        onSuccess = null,
        onError = null
      } = options || {};

      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

      const cleanCode = (code || '').toString().trim().replace(/\D/g, '');
      if (cleanCode.length !== 6) {
        const msg = 'Please enter the complete 6-digit verification code.';
        if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
        if (typeof onError === 'function') onError(msg, 'invalid_code');
        return false;
      }

      if (typeof onStart === 'function') onStart();
      this.setButtonState(buttonEl, true, loadingText);

      try {
        const response = await fetch(`${API_BASE}/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), code: cleanCode, purpose })
        });

        const data = await response.json().catch(() => ({}));

        this.setButtonState(buttonEl, false);

        if (!response.ok || !data.success) {
          let errorMsg = data.message || 'Verification failed.';
          if (data.error === 'expired') {
            errorMsg = 'Verification code has expired. Please request a new code.';
          } else if (data.error === 'too_many_attempts') {
            errorMsg = 'Too many incorrect attempts. Please request a new code.';
          } else if (data.error === 'wrong_code') {
            errorMsg = data.message || 'Incorrect verification code. Please try again.';
          }

          if (errorEl) { errorEl.textContent = errorMsg; errorEl.style.display = 'block'; }
          if (typeof onError === 'function') onError(errorMsg, data.error || 'verification_failed', data);
          return false;
        }

        if (typeof onSuccess === 'function') onSuccess(data);
        return true;

      } catch (err) {
        this.setButtonState(buttonEl, false);
        console.error('[WeBakeOTP] Network error verifying OTP:', err);
        const networkErrorMsg = 'Cannot reach verification server. Please make sure the backend is running.';
        if (errorEl) { errorEl.textContent = networkErrorMsg; errorEl.style.display = 'block'; }
        if (typeof onError === 'function') onError(networkErrorMsg, 'network_error');
        return false;
      }
    },

    /**
     * Standardized Resend Countdown Timer
     */
    startCountdown: function (options) {
      const {
        timerSpanEl,
        timerWrapEl,
        resendBtnEl,
        duration = 60,
        onTick = null,
        onComplete = null
      } = options || {};

      let remaining = duration;

      if (timerWrapEl) timerWrapEl.style.display = 'inline';
      if (resendBtnEl) resendBtnEl.style.display = 'none';
      if (timerSpanEl) timerSpanEl.textContent = remaining;

      // Clear any existing active timer
      if (window[OTP_TIMER_KEY]) clearInterval(window[OTP_TIMER_KEY]);

      window[OTP_TIMER_KEY] = setInterval(() => {
        remaining -= 1;
        if (timerSpanEl) timerSpanEl.textContent = remaining;
        if (typeof onTick === 'function') onTick(remaining);

        if (remaining <= 0) {
          clearInterval(window[OTP_TIMER_KEY]);
          window[OTP_TIMER_KEY] = null;
          if (timerWrapEl) timerWrapEl.style.display = 'none';
          if (resendBtnEl) resendBtnEl.style.display = 'inline';
          if (typeof onComplete === 'function') onComplete();
        }
      }, 1000);

      return window[OTP_TIMER_KEY];
    },

    /**
     * Clears any active countdown timer immediately
     */
    clearCountdown: function () {
      if (window[OTP_TIMER_KEY]) {
        clearInterval(window[OTP_TIMER_KEY]);
        window[OTP_TIMER_KEY] = null;
      }
    }
  };

  // Expose to window
  window.WeBakeOTP = WeBakeOTP;

})(window);
