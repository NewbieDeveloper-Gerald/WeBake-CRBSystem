/**
 * ====================================================================
 * WeBake Admin Portal — Central API Client (admin-api.js)
 * Connects the Admin frontend to the unified Express / Supabase backend.
 * Uses window.WEBAKE_CONFIG.API_BASE (aligned with customer frontend).
 * ====================================================================
 */

(function (window) {
  'use strict';

  const isLocal = window.location.protocol === 'file:' ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';

  const API_BASE = window.WEBAKE_CONFIG?.API_BASE || (isLocal ? 'http://localhost:5000/api' : '/api');

  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Attach admin session token or user email header if available
    try {
      const sess = JSON.parse(localStorage.getItem('weBakeAdminSession') || 'null');
      if (sess && sess.email) {
        defaultHeaders['X-User-Email'] = sess.email;
        defaultHeaders['X-Admin-Role'] = sess.role || sess.roleName || 'admin';
      } else {
        const cust = JSON.parse(localStorage.getItem('weBakeSession') || 'null');
        if (cust && cust.email) {
          defaultHeaders['X-User-Email'] = cust.email;
          if (cust.role === 'admin' || cust.role === 'staff' || cust.email === 'geraldvelasco550@gmail.com') {
            defaultHeaders['X-Admin-Role'] = 'admin';
          }
        } else {
          defaultHeaders['X-User-Email'] = 'geraldvelasco550@gmail.com';
          defaultHeaders['X-Admin-Role'] = 'owner';
        }
      }
    } catch (e) {}

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(url, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = new Error(data.message || `API Error: ${res.status} ${res.statusText}`);
        error.status = res.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`[AdminAPI Request Failed] ${options.method || 'GET'} ${url}:`, err.message);
      throw err;
    }
  }

  window.WeBakeAdminAPI = Object.freeze({
    BASE: API_BASE,
    get: (endpoint) => request(endpoint, { method: 'GET' }),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
    patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
    del: (endpoint) => request(endpoint, { method: 'DELETE' }),
    request
  });
  window.AdminAPI = window.WeBakeAdminAPI;

})(window);
