/**
 * ====================================================================
 * WeBake Admin Portal — Staff Authentication (admin-auth.js)
 * Connected to unified backend /api/auth/login with Supabase user accounts.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  const AUTH_KEY = 'weBakeAdminSession';

  const DEFAULT_ADMIN = {
    id: 3,
    name: 'Gerald V.',
    email: 'geraldvelasco550@gmail.com'
  };

  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(AUTH_KEY));
      if (s && s.email) return s;

      // Check if logged in through customer auth
      const cust = JSON.parse(localStorage.getItem('weBakeSession'));
      if (cust && cust.email) {
        const mapped = {
          id: cust.id,
          name: cust.name || 'Gerald V.',
          email: cust.email
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(mapped));
        return mapped;
      }

      return DEFAULT_ADMIN;
    } catch (e) {
      return DEFAULT_ADMIN;
    }
  }

  function setSession(user) {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
      updateStaffUI();
    } catch (e) {}
  }

  async function login(email, password) {
    try {
      if (!window.WeBakeAdminAPI) throw new Error('API client not loaded.');
      const res = await window.WeBakeAdminAPI.post('/auth/login', { email, password });
      if (res && res.success && res.user) {
        const u = res.user;
        const sessionUser = {
          id: u.id,
          name: u.name,
          email: u.email
        };
        setSession(sessionUser);
        if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(`Logged in as ${u.name}`, 'success');
        return { success: true, user: sessionUser };
      }
      throw new Error(res.message || 'Login failed.');
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(err.message || 'Authentication error', 'danger');
      return { success: false, message: err.message };
    }
  }

  function updateStaffUI() {
    const s = getSession();
    const nameEl = document.querySelector('.staff-name');
    if (nameEl) nameEl.textContent = s.name;
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateStaffUI();

    const logoutBtn = document.getElementById('btn-admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Sign out of WeBake Admin portal?')) {
          setSession(DEFAULT_ADMIN);
          if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Signed out.');
        }
      });
    }
  });

  window.WeBakeAuth = {
    getSession,
    setSession,
    login
  };

})(window, document);
