/* ==============================================
   WeBake - Dashboard JavaScript (dashboard.js)
   ============================================== */

document.addEventListener('DOMContentLoaded', () => {
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
  }

  // --- Check Authentication (Guard) ---
  const sessionString = localStorage.getItem('weBakeSession');
  if (!sessionString) {
    // If not logged in, redirect to home
    window.location.href = 'index.html';
    return;
  }
  
  const session = JSON.parse(sessionString);
  const USERS_KEY = 'weBakeUsers';
  const getUsers = () => JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  const users = getUsers();
  const currentUser = users.find(u => u.email === session.email);

  if (!currentUser) {
    localStorage.removeItem('weBakeSession');
    window.location.href = 'index.html';
    return;
  }

  // --- Populate Profile Form ---
  const nameInput = document.getElementById('dash-name');
  const contactInput = document.getElementById('dash-contact');
  const emailInput = document.getElementById('dash-email');
  const addressInput = document.getElementById('dash-address');

  if (nameInput) nameInput.value = currentUser.name || '';
  if (contactInput) contactInput.value = currentUser.contact || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (addressInput) addressInput.value = currentUser.address || '';

  // --- Handle Profile Save ---
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const newName = nameInput.value.trim();
      const newContact = contactInput.value.trim();
      const newAddress = addressInput.value.trim();
      
      // Update in local storage
      const allUsers = getUsers();
      const userIndex = allUsers.findIndex(u => u.email === currentUser.email);
      if (userIndex !== -1) {
        allUsers[userIndex].name = newName;
        allUsers[userIndex].contact = newContact;
        allUsers[userIndex].address = newAddress;
        localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
        
        // Update session name if changed
        session.name = newName;
        localStorage.setItem('weBakeSession', JSON.stringify(session));
        
        // Also update the local currentUser object so other functions see it
        currentUser.name = newName;
        currentUser.contact = newContact;
        currentUser.address = newAddress;
        
        showToast('Profile updated successfully!');
      } else {
        showToast('Error saving profile.');
      }
    });
  }

  // --- Render Saved Cart ---
  const cartContainer = document.getElementById('dash-cart-container');
  function renderCart() {
    if (!cartContainer) return;
    const cart = currentUser.savedCart || [];
    
    if (cart.length === 0) {
      cartContainer.innerHTML = '<div style="text-align:center; padding:1.5rem 0;"><p class="empty-state">Your cart is empty.</p><a href="products.html" class="btn btn-primary" style="margin-top:0.5rem;"><i class="fas fa-shopping-bag"></i> Start Shopping</a></div>';
      return;
    }

    let html = '<table class="cart-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th></th></tr></thead><tbody>';
    let total = 0;

    cart.forEach((item, index) => {
      const itemTotal = item.price * item.qty;
      total += itemTotal;
      html += `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td>
            <input type="number" min="1" value="${item.qty}" class="qty-input" data-index="${index}">
          </td>
          <td>₱${itemTotal.toFixed(2)}</td>
          <td style="text-align:right;">
            <button class="remove-btn" data-index="${index}" title="Remove"><i class="fas fa-times"></i></button>
          </td>
        </tr>
      `;
    });
    
    html += `</tbody></table><div class="cart-total">Total: ₱${total.toFixed(2)}</div>`;
    cartContainer.innerHTML = html;

    // Bind events for qty change and remove
    const qtyInputs = cartContainer.querySelectorAll('.qty-input');
    qtyInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        let newQty = parseInt(e.target.value);
        if (isNaN(newQty) || newQty < 1) newQty = 1;
        const idx = e.target.getAttribute('data-index');
        updateCartItem(idx, newQty);
      });
    });

    const removeBtns = cartContainer.querySelectorAll('.remove-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        removeCartItem(idx);
      });
    });
  }

  function updateCartItem(index, newQty) {
    const allUsers = getUsers();
    const userIndex = allUsers.findIndex(u => u.email === currentUser.email);
    if (userIndex !== -1 && allUsers[userIndex].savedCart) {
      allUsers[userIndex].savedCart[index].qty = newQty;
      localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
      currentUser.savedCart = allUsers[userIndex].savedCart;
      renderCart();
      showToast('Cart updated.');
    }
  }

  function removeCartItem(index) {
    const allUsers = getUsers();
    const userIndex = allUsers.findIndex(u => u.email === currentUser.email);
    if (userIndex !== -1 && allUsers[userIndex].savedCart) {
      allUsers[userIndex].savedCart.splice(index, 1);
      localStorage.setItem(USERS_KEY, JSON.stringify(allUsers));
      currentUser.savedCart = allUsers[userIndex].savedCart;
      renderCart();
      showToast('Item removed from cart.');
    }
  }

  renderCart();

  // --- Render Order History ---
  const ordersContainer = document.getElementById('dash-orders-container');
  function renderOrders() {
    if (!ordersContainer) return;
    const freshUsers = getUsers();
    const freshUser = freshUsers.find(u => u.email === session.email);
    const orders = (freshUser && freshUser.orderHistory) || [];
    if (orders.length === 0) {
      ordersContainer.innerHTML = '<p class="empty-state">You haven\'t placed any orders yet.</p>';
    } else {
      let html = '';
      orders.forEach(order => {
        // order status: completed, pending, cancelled
        let statusClass = 'status-pending';
        let statusText = 'Pending';
        if (order.status === 'completed') { statusClass = 'status-completed'; statusText = 'Completed'; }
        else if (order.status === 'cancelled') { statusClass = 'status-cancelled'; statusText = 'Cancelled'; }
        
        html += `
          <div class="order-item">
            <div>
              <strong>${order.date}</strong> <br>
              <span style="color:var(--gray); font-size:0.8rem;">${order.items.length} items • ₱${order.total.toFixed(2)}</span>
            </div>
            <div class="order-status ${statusClass}">${statusText}</div>
          </div>
        `;
      });
      ordersContainer.innerHTML = html;
    }
  }

  renderOrders();
  window.addEventListener('storage', (e) => {
    if (e.key === USERS_KEY) renderOrders();
  });

  // --- Render Partnership Status ---
  const partnerBadge = document.getElementById('dash-partner-badge');
  const partnerCta = document.getElementById('dash-partner-cta');
  if (partnerBadge && partnerCta) {
    const status = currentUser.partnerStatus || 'none';
    if (status === 'active') {
      partnerBadge.className = 'partner-badge badge-active';
      partnerBadge.innerHTML = '<i class="fas fa-check-circle"></i> Active Partner';
      partnerCta.style.display = 'none';
    } else if (status === 'pending') {
      partnerBadge.className = 'partner-badge badge-pending';
      partnerBadge.innerHTML = '<i class="fas fa-clock"></i> Application Pending';
      partnerCta.innerHTML = 'Your partnership application is currently being reviewed.';
    } else {
      partnerBadge.className = 'partner-badge badge-none';
      partnerBadge.innerHTML = '<i class="fas fa-minus-circle"></i> No Partnership';
      partnerCta.style.display = 'block';
    }
  }

});
