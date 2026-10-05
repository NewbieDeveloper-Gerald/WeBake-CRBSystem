/**
 * ====================================================================
 * WeBake Admin Portal — Staff Auth & Role Access Control (admin-auth.js)
 * Supports Owner/Admin (Gerald V.) & Cashier/Counter Staff roles.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  const AUTH_KEY = 'weBakeAdminSession';

  const DEFAULT_ADMIN = {
    id: 'ADM-01',
    name: 'Gerald V.',
    role: 'owner', // 'owner' or 'cashier'
    email: 'gerald@crumbsnrolls.com'
  };

  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(AUTH_KEY));
      return s || DEFAULT_ADMIN;
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

  function switchRole() {
    const current = getSession();
    const newRole = current.role === 'owner' ? 'cashier' : 'owner';
    const newName = newRole === 'owner' ? 'Gerald V.' : 'Counter Cashier';
    const updated = {
      ...current,
      name: newName,
      role: newRole
    };
    setSession(updated);
    if (window.WeBakeAdmin && window.WeBakeAdmin.showToast) {
      window.WeBakeAdmin.showToast(`Switched active role to: ${newRole === 'owner' ? 'Owner / Admin' : 'Cashier'}`);
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
          if (window.WeBakeAdmin) window.WeBakeAdmin.showToast('Logged out.');
        }
      });
    }
  });

  window.WeBakeAuth = {
    getSession,
    setSession,
    switchRole
  };

})(window, document);
