/**
 * Catálogo Interactivo — Vista Cliente
 * Incluye: tarjetas con descripción corta, modal de detalle,
 * descarga de ficha técnica, carrito y envío de pedido.
 */

let allProducts    = [];
let currentProfile = null;
let cart           = []; // [{ product_id, title, quantity }]
let modalProductIdx = null;
const isClientRole = () => currentProfile && currentProfile.role === 'client';

// ==========================================
// INICIALIZACIÓN
// ==========================================
(async () => {
  currentProfile = await getProfile();
  if (!currentProfile) { window.location.href = '../login.html'; return; }

  document.getElementById('clientName').textContent    = currentProfile.full_name    || 'Cliente';
  document.getElementById('clientCompany').textContent = currentProfile.company_name || 'Indusquim';

  // Ruta dinámica del botón "Mi portal"
  const homeL = document.getElementById('homeLink');
  if (currentProfile.role === 'admin' || currentProfile.role === 'commercial') {
    homeL.href = '../admin/index.html';
  } else {
    homeL.href = currentProfile.client_type === 'large' ? 'grande.html' : 'pequeno.html';
  }

  // Mostrar carrito y link de pedidos solo a clientes
  if (isClientRole()) {
    document.getElementById('cartBtn').style.display    = 'flex';
    document.getElementById('pedidosLink').style.display = 'flex';
  } else {
    document.getElementById('pedidosLink').style.display = 'none';
  }

  document.getElementById('logoutBtn').onclick = () => logout();
  await fetchCatalog();
})();

// ==========================================
// CARGAR CATÁLOGO
// ==========================================
async function fetchCatalog() {
  const { data } = await sb.from('catalog_items').select('*').order('created_at', { ascending: false });
  allProducts = data || [];
  renderCatalog(allProducts);
}

function renderCatalog(items) {
  const grid = document.getElementById('catalogGrid');
  if (!items.length) {
    grid.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">No hay productos en esta categoría.</p>';
    return;
  }

  grid.innerHTML = items.map((p, idx) => {
    const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
    const actionsHtml = isClientRole()
      ? buildRowActions(p.id, idx)
      : '<button class="btn btn--ghost btn--sm" onclick="openProductModal(' + idx + ')">Ver detalles</button>';

    return '<div class="catalog-row" data-pid="' + p.id + '">'
      + '<img src="' + imgUrl + '" class="catalog-row__img" alt="' + p.title + '" loading="lazy" />'
      + '<div class="catalog-row__info">'
      + '<div class="catalog-row__title">' + p.title + '</div>'
      + '<span class="badge badge--large" style="margin-top:3px;display:inline-block;">' + p.category + '</span>'
      + (p.description ? '<div class="catalog-row__desc">' + p.description + '</div>' : '')
      + '</div>'
      + '<div class="catalog-row__actions" id="row-actions-' + p.id + '">' + actionsHtml + '</div>'
      + '</div>';
  }).join('');
}

// ==========================================
// FILTROS Y BÚSQUEDA
// ==========================================
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('categoryFilter').addEventListener('change', applyFilters);

function applyFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const c = document.getElementById('categoryFilter').value;
  const filtered = allProducts.filter(p => {
    const matchQ = p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    const matchC = c === 'all' || p.category === c;
    return matchQ && matchC;
  });
  renderCatalog(filtered);
}

// ==========================================
// MODAL DETALLE DE PRODUCTO
// ==========================================
const productModal = document.getElementById('productModal');

window.openProductModal = function(idx) {
  const p = allProducts[idx];
  modalProductIdx = idx;

  document.getElementById('modalTitle').textContent    = p.title;
  document.getElementById('modalCategory').textContent = p.category;
  document.getElementById('modalDesc').textContent     = p.description || '';

  const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
  document.getElementById('modalImg').src = imgUrl;

  // Botón agregar: solo para clientes
  document.getElementById('modalAddCart').style.display = isClientRole() ? 'inline-flex' : 'none';

  productModal.classList.add('open');
};

document.getElementById('closeModal').onclick = () => productModal.classList.remove('open');
productModal.onclick = (e) => { if (e.target === productModal) productModal.classList.remove('open'); };

document.getElementById('modalAddCart').onclick = () => {
  if (modalProductIdx !== null) {
    addToCart(modalProductIdx);
    productModal.classList.remove('open');
  }
};

// ==========================================
// CARRITO
// ==========================================
document.getElementById('cartBtn').onclick     = openCart;
document.getElementById('closeCart').onclick   = closeCart;
document.getElementById('cartOverlay').onclick = closeCart;
document.getElementById('clearCart').onclick   = () => {
  const ids = cart.map(i => i.product_id);
  cart = [];
  renderCart();
  updateCartBadge();
  ids.forEach(updateRowActions);
};

function openCart()  { document.getElementById('cartPanel').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); }
function closeCart() { document.getElementById('cartPanel').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); }

function buildRowActions(productId, idx) {
  const qty = (cart.find(i => i.product_id === productId) || {}).quantity || 0;
  if (qty > 0) {
    return '<div class="qty-selector">'
      + '<button class="qty-btn" onclick="changeRowQty(\'' + productId + '\', -1)">−</button>'
      + '<span class="qty-num">' + qty + '</span>'
      + '<button class="qty-btn" onclick="changeRowQty(\'' + productId + '\', 1)">+</button>'
      + '</div>';
  }
  const idxVal = allProducts.findIndex(p => p.id === productId);
  return '<button class="btn btn--ghost btn--sm" onclick="openProductModal(' + idxVal + ')">Detalles</button>'
    + '<button class="btn btn--primary btn--sm" onclick="addToCart(' + idxVal + ')">+ Agregar</button>';
}

function updateRowActions(productId) {
  const div = document.getElementById('row-actions-' + productId);
  if (div) div.innerHTML = buildRowActions(productId);
}

window.addToCart = function(idx) {
  const p = allProducts[idx];
  const existing = cart.find(i => i.product_id === p.id);
  if (existing) { existing.quantity++; } else { cart.push({ product_id: p.id, title: p.title, quantity: 1 }); }
  renderCart();
  updateCartBadge();
  updateRowActions(p.id);
};

window.changeRowQty = function(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(i => i.product_id !== productId);
  renderCart();
  updateCartBadge();
  updateRowActions(productId);
};

window.changeQty = function(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(i => i.product_id !== productId);
  renderCart();
  updateCartBadge();
  updateRowActions(productId);
};

window.removeFromCart = function(productId) {
  cart = cart.filter(i => i.product_id !== productId);
  renderCart();
  updateCartBadge();
  updateRowActions(productId);
};

function renderCart() {
  const body = document.getElementById('cartItems');
  if (!cart.length) {
    body.innerHTML = '<div class="cart-panel__empty">Tu pedido está vacío.<br>Agrega productos del catálogo.</div>';
    return;
  }
  body.innerHTML = cart.map(item =>
    '<div class="cart-item">'
    + '<div class="cart-item__name">' + item.title + '</div>'
    + '<div class="cart-item__qty">'
    + '<button onclick="changeQty(\'' + item.product_id + '\', -1)">−</button>'
    + '<span>' + item.quantity + '</span>'
    + '<button onclick="changeQty(\'' + item.product_id + '\', 1)">+</button>'
    + '</div>'
    + '<button class="cart-item__remove" onclick="removeFromCart(\'' + item.product_id + '\')" title="Quitar">✕</button>'
    + '</div>'
  ).join('');
}

function updateCartBadge() {
  const total = cart.reduce((sum, i) => sum + i.quantity, 0);
  const badge = document.getElementById('cartBadge');
  if (total > 0) {
    badge.style.display = 'flex';
    badge.textContent = total > 9 ? '9+' : total;
  } else {
    badge.style.display = 'none';
  }
}

// ==========================================
// ENVIAR PEDIDO
// ==========================================
document.getElementById('sendOrderBtn').onclick = async () => {
  if (!cart.length) { showError('Agrega al menos un producto antes de enviar.'); return; }

  const btn = document.getElementById('sendOrderBtn');
  btn.textContent = 'Enviando…'; btn.disabled = true;

  // Crear orden
  const { data: order, error: orderErr } = await sb.from('orders').insert({
    client_id:     currentProfile.id,
    commercial_id: currentProfile.assigned_commercial_id || null,
    status:        'pending'
  }).select().single();

  if (orderErr) {
    showError('Error al enviar pedido: ' + orderErr.message);
    btn.textContent = 'Enviar pedido'; btn.disabled = false;
    return;
  }

  // Insertar items de la orden
  const orderItems = cart.map(i => ({
    order_id:        order.id,
    catalog_item_id: i.product_id,
    quantity:        i.quantity
  }));
  await sb.from('order_items').insert(orderItems);

  // Notificar al comercial asignado
  if (currentProfile.assigned_commercial_id) {
    await sb.from('notifications').insert({
      user_id:          currentProfile.assigned_commercial_id,
      type:             'new_order',
      message:          'Nueva orden de ' + (currentProfile.company_name || currentProfile.full_name || 'un cliente') + '. Revisar pedidos.',
      related_order_id: order.id
    });
  }

  cart = [];
  renderCart();
  updateCartBadge();
  closeCart();
  showSuccess('¡Pedido enviado! Tu comercial lo revisará pronto.');
  btn.textContent = 'Enviar pedido'; btn.disabled = false;
};

// ==========================================
// HAMBURGUESA
// ==========================================
const hbg     = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');
function toggleSidebar() { sidebar.classList.toggle('open'); hbg.classList.toggle('open'); overlay.classList.toggle('show'); }
if (hbg)     hbg.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);

function showSuccess(msg) {
  const el = document.getElementById('successMsg');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 6000);
}
