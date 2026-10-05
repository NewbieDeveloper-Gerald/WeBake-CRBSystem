/**
 * ====================================================================
 * WeBake Admin Portal — System & Bakery Settings (admin-settings.js)
 * GCash/Maya numbers, QR codes, baking cutoff hours, delivery zones, RBAC.
 * ====================================================================
 */

(function (window, document) {
  'use strict';

  function loadSettings() {
    const settings = window.WeBakeAdmin.getSettings();

    const gcashNumEl = document.getElementById('set-gcash-num');
    const mayaNumEl = document.getElementById('set-maya-num');
    const accNameEl = document.getElementById('set-acc-name');
    const gcashQrEl = document.getElementById('set-gcash-qr');
    const mayaQrEl = document.getElementById('set-maya-qr');
    const storeHoursEl = document.getElementById('set-store-hours');
    const cutoffEl = document.getElementById('set-cutoff-time');
    const deliveryAreasEl = document.getElementById('set-delivery-areas');

    if (gcashNumEl) gcashNumEl.value = settings.gcashNumber || '';
    if (mayaNumEl) mayaNumEl.value = settings.paymayaNumber || '';
    if (accNameEl) accNameEl.value = settings.accountName || '';
    if (gcashQrEl) gcashQrEl.value = settings.gcashQr || '';
    if (mayaQrEl) mayaQrEl.value = settings.paymayaQr || '';
    if (storeHoursEl) storeHoursEl.value = settings.storeHours || '';
    if (cutoffEl) cutoffEl.value = settings.cutoffTime || '';
    if (deliveryAreasEl) deliveryAreasEl.value = settings.deliveryAreas || '';

    // Preview QRs
    updateQrPreviews(settings);
  }

  function updateQrPreviews(settings) {
    const gcashPreview = document.getElementById('preview-gcash-qr');
    const mayaPreview = document.getElementById('preview-maya-qr');
    if (gcashPreview && settings.gcashQr) gcashPreview.src = settings.gcashQr;
    if (mayaPreview && settings.paymayaQr) mayaPreview.src = settings.paymayaQr;
  }

  function saveSettings(e) {
    e.preventDefault();

    const updated = {
      gcashNumber: document.getElementById('set-gcash-num')?.value.trim() || '0917-123-4567',
      paymayaNumber: document.getElementById('set-maya-num')?.value.trim() || '0918-987-6543',
      accountName: document.getElementById('set-acc-name')?.value.trim() || 'Gerald V.',
      gcashQr: document.getElementById('set-gcash-qr')?.value.trim() || '../img/gcash-qr.svg',
      paymayaQr: document.getElementById('set-maya-qr')?.value.trim() || '../img/paymaya-qr.svg',
      storeHours: document.getElementById('set-store-hours')?.value.trim() || '6:00 AM - 8:00 PM',
      cutoffTime: document.getElementById('set-cutoff-time')?.value.trim() || '2:00 PM',
      deliveryAreas: document.getElementById('set-delivery-areas')?.value.trim() || 'Marilao, Bulacan'
    };

    window.WeBakeAdmin.saveSettings(updated);
    updateQrPreviews(updated);
    window.WeBakeAdmin.showToast('Bakery payment credentials and settings saved successfully!', 'success');
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    document.getElementById('form-bakery-settings')?.addEventListener('submit', saveSettings);

    // QR image file input listeners (support direct base64 upload!)
    const gcashFileInput = document.getElementById('file-gcash-qr');
    gcashFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          document.getElementById('set-gcash-qr').value = evt.target.result;
          document.getElementById('preview-gcash-qr').src = evt.target.result;
          window.WeBakeAdmin.showToast('GCash QR uploaded! Click Save to apply.', 'info');
        };
        reader.readAsDataURL(file);
      }
    });

    const mayaFileInput = document.getElementById('file-maya-qr');
    mayaFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          document.getElementById('set-maya-qr').value = evt.target.result;
          document.getElementById('preview-maya-qr').src = evt.target.result;
          window.WeBakeAdmin.showToast('Maya QR uploaded! Click Save to apply.', 'info');
        };
        reader.readAsDataURL(file);
      }
    });
  });

})(window, document);
