/**
 * ====================================================================
 * WeBake - Client Security & Utility Helper (utils.js)
 * Provides HTML escaping and sanitization to prevent Cross-Site Scripting (XSS)
 * ====================================================================
 */

(function (window) {
  'use strict';

  /**
   * Escape HTML entities in user-supplied or server-rendered strings
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format currency in Philippine Pesos
   */
  function formatCurrency(amount) {
    const num = parseFloat(amount);
    return isNaN(num) ? '₱0.00' : '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  window.WeBakeUtils = Object.freeze({
    escapeHtml,
    formatCurrency
  });

  // Global exposure for direct template interpolations
  window.escapeHtml = escapeHtml;

})(window);
