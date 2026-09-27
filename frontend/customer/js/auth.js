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

  /* ── Data Store (replace this section with MongoDB API calls later) ── */
  const USERS_KEY = 'weBakeUsers';
  const store = {
    getAll: () => JSON.parse(localStorage.getItem(USERS_KEY) || '[]'),
    save: arr => localStorage.setItem(USERS_KEY, JSON.stringify(arr)),
    find: email => store.getAll().find(u => u.email === email),
    add: user => { const all = store.getAll(); all.push(user); store.save(all); },
    updatePassword: (email, pwd) => {
      const all = store.getAll();
      const i = all.findIndex(u => u.email === email);
      if (i >= 0) { all[i].password = pwd; store.save(all); return true; }
      return false;
    }
  };
  /* ── End Data Store ── */

  let otpInterval, pendingEmail = null, flowMode = null;

  if (!document.getElementById('auth-overlay')) {
    const authHtml = `
      <style>
        .auth-icon-input{position:relative}
        .auth-icon-input i.fa-lock,.auth-icon-input i.fa-envelope,.auth-icon-input i.fa-user{position:absolute;left:1rem;top:50%;transform:translateY(-50%);color:var(--gray);font-size:.9rem}
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
        <form id="register-form"><div class="form-group"><label>Full Name</label><div class="auth-icon-input"><i class="fas fa-user"></i><input type="text" class="form-input" required placeholder="Juan Dela Cruz"></div></div><div class="form-group"><label>Email</label><div class="auth-icon-input"><i class="fas fa-envelope"></i><input type="email" class="form-input" required id="reg-email" placeholder="juan@example.com"></div></div><div class="form-group"><label>Password</label><div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required id="reg-pwd" placeholder="Create a strong password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div></div><div class="form-group"><label>Confirm Password</label><div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required id="reg-cpwd" placeholder="Confirm your password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div></div><button type="submit" class="btn btn-primary btn-block"><i class="fas fa-user-plus"></i> Register Account</button></form>
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
        <form id="otp-form"><div class="form-group"><input type="text" class="form-input" placeholder="0 0 0 0 0 0" required style="text-align:center;font-size:1.5rem;letter-spacing:.75rem;font-weight:600" maxlength="6"></div><button type="submit" class="btn btn-primary btn-block"><i class="fas fa-check-circle"></i> Verify</button></form>
        <p style="text-align:center;margin-top:1.5rem;font-size:.9rem;color:var(--gray)"><span id="otp-timer-wrap">Resend code in <strong id="otp-timer">30</strong>s</span> <a href="#" id="otp-resend-btn" class="auth-link" style="display:none"><i class="fas fa-redo-alt"></i> Resend OTP</a></p>
      </div>

      <!-- RESET PASSWORD -->
      <div class="modal" id="reset-modal" style="z-index:3001;padding:2.5rem">
        <button class="modal-close" data-auth-close>&times;</button>
        <h3 class="auth-modal-title">Set New Password</h3>
        <p class="auth-modal-subtitle">Enter and confirm your new password.</p>
        <form id="reset-form"><div class="form-group"><label>New Password</label><div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required placeholder="New password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div></div><div class="form-group"><label>Confirm Password</label><div class="auth-icon-input"><i class="fas fa-lock"></i><input type="password" class="form-input" required placeholder="Confirm password"><button type="button" class="auth-eye-toggle"><i class="fas fa-eye"></i></button></div></div><button type="submit" class="btn btn-primary btn-block"><i class="fas fa-save"></i> Save Password</button></form>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', authHtml);
  }

  const authOverlay = document.getElementById('auth-overlay');

  function openAuthModal(id) {
    document.querySelectorAll('#signin-modal,#register-modal,#forgot-modal,#otp-modal,#reset-modal')
      .forEach(m => m.classList.remove('active'));
    authOverlay.classList.add('active');
    document.getElementById(id).classList.add('active');
  }

  function closeAuthModals() {
    document.querySelectorAll('#signin-modal,#register-modal,#forgot-modal,#otp-modal,#reset-modal')
      .forEach(m => m.classList.remove('active'));
    authOverlay.classList.remove('active');
    clearInterval(otpInterval);
  }

  // ---------- Global Click Handler ----------
  document.body.addEventListener('click', e => {
    // Eye toggle (show/hide password)
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
    // Open modal via data-auth-open
    if (e.target.closest('[data-auth-open]')) {
      e.preventDefault();
      openAuthModal(e.target.closest('[data-auth-open]').getAttribute('data-auth-open'));
    }
    // Close modal
    if (e.target.matches('[data-auth-close]') || e.target.id === 'auth-overlay') closeAuthModals();
    // OTP resend
    if (e.target.closest('#otp-resend-btn')) { e.preventDefault(); generateOtp(pendingEmail); startOtpTimer(); }
    // Sign In / Register buttons (desktop + mobile hamburger)
    const authBtn = e.target.closest('.auth-buttons a, .auth-mobile-btn');
    if (authBtn) {
      e.preventDefault();
      openAuthModal(authBtn.textContent.includes('Sign In') ? 'signin-modal' : 'register-modal');
    }
  });

  // ---------- Sign In (validates credentials) ----------
  document.getElementById('signin-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value.trim();
    const pwd = e.target.querySelector('input[type="password"]').value;
    const user = store.find(email);
    if (!user) { showToast('No account found for this email'); return; }
    if (user.password !== pwd) { showToast('Incorrect password'); return; }
    showToast(`Welcome back, ${user.name}!`); closeAuthModals();
  });

  // ---------- Register (validates before OTP) ----------
  document.getElementById('register-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const pwd = document.getElementById('reg-pwd').value;
    const cpwd = document.getElementById('reg-cpwd').value;
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

  // ---------- OTP Verification ----------
  document.getElementById('otp-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const entered = e.target.querySelector('input').value.trim();
    if (entered !== sessionStorage.getItem('tmpOtp')) { showToast('Invalid OTP code'); return; }
    clearInterval(otpInterval); sessionStorage.removeItem('tmpOtp');
    if (flowMode === 'register') {
      const name = document.querySelector('#register-form input[placeholder="Juan Dela Cruz"]').value.trim();
      const pwd = document.getElementById('reg-pwd').value;
      store.add({ name, email: pendingEmail, password: pwd });
      showToast('Account created successfully!'); closeAuthModals(); openAuthModal('signin-modal');
    } else if (flowMode === 'forgot') {
      openAuthModal('reset-modal');
    }
  });

  // ---------- Reset Password ----------
  document.getElementById('reset-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const pwd = e.target.querySelectorAll('input')[0].value;
    const cpwd = e.target.querySelectorAll('input')[1].value;
    if (pwd.length < 6) { showToast('Password must be at least 6 characters'); return; }
    if (pwd !== cpwd) { showToast('Passwords do not match'); return; }
    if (store.updatePassword(pendingEmail, pwd)) {
      showToast('Password updated successfully!'); closeAuthModals(); openAuthModal('signin-modal');
    } else { showToast('Unexpected error'); }
  });

  // ---------- OTP Utilities ----------
  function generateOtp(email) {
    const otp = '123456'; // Temporary placeholder for testing
    sessionStorage.setItem('tmpOtp', otp);
    showToast(`Your OTP code is: ${otp}`);
    document.getElementById('otp-email-display').textContent = email;
  }

  function startOtpTimer() {
    clearInterval(otpInterval);
    let t = 30;
    const wrap = document.getElementById('otp-timer-wrap'), span = document.getElementById('otp-timer'), btn = document.getElementById('otp-resend-btn');
    wrap.style.display = 'inline'; btn.style.display = 'none'; span.textContent = t;
    otpInterval = setInterval(() => { span.textContent = --t; if (t <= 0) { clearInterval(otpInterval); wrap.style.display = 'none'; btn.style.display = 'inline'; } }, 1000);
  }
});
