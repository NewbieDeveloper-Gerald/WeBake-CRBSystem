/**
 * ====================================================================
 * WeBake Admin Portal — Staff Auth & Role Access Control (admin-auth.js)
 * Connected to unified backend /api/auth/login with Supabase user accounts.
 * Supports Owner/Admin (Gerald V.) & Cashier/Counter Staff roles.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  const AUTH_KEY = 'weBakeAdminSession';

  const DEFAULT_ADMIN = {
    id: 3,
    name: 'Gerald V.',
    role: 'owner', // 'owner' or 'cashier'
    roleName: 'admin',
    email: 'geraldvelasco550@gmail.com'
  };

  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(AUTH_KEY));
      if (s && s.email) return s;

      // Check if logged in through customer auth with admin role
      const cust = JSON.parse(localStorage.getItem('weBakeSession'));
      if (cust && (cust.role === 'admin' || cust.role === 'staff' || cust.email === 'geraldvelasco550@gmail.com')) {
        const mapped = {
          id: cust.id,
          name: cust.name || 'Gerald V.',
          role: (cust.role === 'admin' || cust.email === 'geraldvelasco550@gmail.com') ? 'owner' : 'cashier',
          roleName: cust.role || 'admin',
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
        const role = (u.role === 'admin' || u.email === 'geraldvelasco550@gmail.com') ? 'owner' : 'cashier';
        const sessionUser = {
          id: u.id,
          name: u.name,
          role: role,
          roleName: u.role || 'admin',
          email: u.email
        };
        setSession(sessionUser);
        if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(`Logged in as ${u.name} (${u.roleTitle || 'Admin'})`, 'success');
        return { success: true, user: sessionUser };
      }
      throw new Error(res.message || 'Login failed.');
    } catch (err) {
      if (window.WeBakeAdmin) window.WeBakeAdmin.showToast(err.message || 'Authentication error', 'danger');
      return { success: false, message: err.message };
    }
  }

  function switchRole() {
    const current = getSession();
    const newRole = current.role === 'owner' ? 'cashier' : 'owner';
    const newName = newRole === 'owner' ? (current.name || 'Gerald V.') : 'Counter Cashier';
    const updated = {
      ...current,
      name: newName,
      role: newRole
    };
    setSession(updated);
    if (window.WeBakeAdmin && window.WeBakeAdmin.showToast) {
      window.WeBakeAdmin.showToast(`Switched active role to: ${newRole === 'owner' ? 'Owner / Admin' : 'Cashier Staff'}`);
    }
    applyRolePermissions();
  }

  function updateStaffUI() {
    const s = getSession();
    const nameEl = document.querySelector('.staff-name');
    const roleEl = document.querySelector('.staff-role-badge');
    const roleSwitchBtnText = document.getElementById('role-switch-text');

    if (nameEl) nameEl.textContent = s.name;
    if (roleEl) roleEl.textContent = s.role === 'owner' ? 'Owner / Admin' : 'Cashier Staff';
    if (roleSwitchBtnText) {
      roleSwitchBtnText.textContent = s.role === 'owner' ? 'Role: Owner (Admin)' : 'Role: Cashier Staff';
    }
  }

  function applyRolePermissions() {
    const s = getSession();
    const isCashier = s.role === 'cashier';

    // Disable settings and refund approvals if cashier
    const restrictedLinks = document.querySelectorAll('.restricted-owner');
    restrictedLinks.forEach(el => {
      if (isCashier) {
        el.classList.add('disabled-feature');
        el.setAttribute('title', 'Restricted to Owner/Admin');
      } else {
        el.classList.remove('disabled-feature');
        el.removeAttribute('title');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateStaffUI();
    applyRolePermissions();

    const roleBtn = document.getElementById('btn-switch-role');
    if (roleBtn) {
      roleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchRole();
      });
    }

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
    login,
    switchRole
  };

})(window, document);
