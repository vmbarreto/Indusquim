/**
 * Mis Pedidos — Vista Cliente
 * Muestra el historial de pedidos del cliente con estado actual.
 * Si el pedido está 'dispatched', el cliente puede marcarlo como completado.
 */

let allOrders = [];
let currentProfile = null;

const STATUS_LABELS = {
  pending:    { label: 'Pendiente de aprobación', css: 'status-pending' },
  approved:   { label: 'Aprobado',                css: 'status-approved' },
  processing: { label: 'En proceso',              css: 'status-processing' },
  dispatched: { label: 'Despachado',              css: 'status-dispatched' },
  completed:  { label: 'Completado',              css: 'status-completed' }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
(async () => {
  currentProfile = await getProfile();
  if (!currentProfile || currentProfile.role !== 'client') {
    window.location.href = '../login.html';
    return;
  }

  document.getElementById('clientName').textContent    = currentProfile.full_name    || 'Cliente';
  document.getElementById('clientCompany').textContent = currentProfile.company_name || 'Indusquim';
  document.getElementById('homeLink').href = currentProfile.client_type === 'large' ? 'grande.html' : 'pequeno.html';
  document.getElementById('logoutBtn').onclick = () => logout();

  await loadOrders();
})();

// ==========================================
// CARGAR PEDIDOS
// ==========================================
async function loadOrders() {
  const { data, error } = await sb
    .from('orders')
    .select('id, status, notes, created_at, order_items(quantity, catalog_item_id, catalog_items(title))')
    .eq('client_id', currentProfile.id)
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('ordersList').innerHTML =
      '<p style="color:var(--c-muted);">Error al cargar pedidos: ' + error.message + '</p>';
    return;
  }

  allOrders = data || [];
  updateStats(allOrders);
  renderOrders(allOrders);
}

function updateStats(orders) {
  document.getElementById('statTotal').textContent     = orders.length;
  document.getElementById('statPending').textContent   = orders.filter(o => o.status !== 'completed').length;
  document.getElementById('statCompleted').textContent = orders.filter(o => o.status === 'completed').length;
}

// ==========================================
// RENDERIZAR PEDIDOS
// ==========================================
function renderOrders(orders) {
  const list = document.getElementById('ordersList');
  if (!orders.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--c-muted);">'
      + '<p style="font-size:1.5rem;margin-bottom:8px;">📋</p>'
      + '<p>No tienes pedidos todavía.</p>'
      + '<a href="catalogo.html" class="btn btn--primary" style="margin-top:16px;display:inline-flex;">Ir al catálogo</a>'
      + '</div>';
    return;
  }

  list.innerHTML = orders.map((order, i) => {
    const st = STATUS_LABELS[order.status] || { label: order.status, css: '' };
    const fecha = new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const itemCount = (order.order_items || []).reduce((s, i) => s + (i.quantity || 1), 0);

    // Botón "Marcar como recibido" solo si está despachado
    const receivedBtn = order.status === 'dispatched'
      ? '<button class="btn btn--primary btn--sm" style="margin-top:12px;" onclick="markReceived(\'' + order.id + '\')">✓ Marcar como recibido</button>'
      : '';

    // Items del pedido
    const itemsHtml = (order.order_items || []).map(item =>
      '<div class="order-item-row">'
      + '<span>' + (item.catalog_items?.title || 'Producto eliminado') + '</span>'
      + '<span style="color:var(--c-muted);">x' + item.quantity + '</span>'
      + '</div>'
    ).join('');

    return '<div class="order-card">'
      + '<div class="order-card__header" onclick="toggleOrder(' + i + ')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">Pedido #' + order.id.slice(-6).toUpperCase() + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">' + fecha + ' · ' + itemCount + ' producto' + (itemCount !== 1 ? 's' : '') + '</div>'
      + '</div>'
      + '<span class="status-badge ' + st.css + '">' + st.label + '</span>'
      + '</div>'
      + '<div class="order-card__body" id="orderBody' + i + '">'
      + '<div style="padding-top:12px;">'
      + itemsHtml
      + receivedBtn
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

window.toggleOrder = function(i) {
  const body = document.getElementById('orderBody' + i);
  body.classList.toggle('open');
};

// ==========================================
// MARCAR COMO RECIBIDO
// ==========================================
window.markReceived = async function(orderId) {
  const btn = event.target;
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const { error } = await sb.from('orders')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    showError('Error: ' + error.message);
    btn.textContent = '✓ Marcar como recibido'; btn.disabled = false;
    return;
  }

  // Notificar al comercial
  const order = allOrders.find(o => o.id === orderId);
  if (currentProfile.assigned_commercial_id) {
    await sb.from('notifications').insert({
      user_id:          currentProfile.assigned_commercial_id,
      type:             'order_completed',
      message:          (currentProfile.company_name || currentProfile.full_name) + ' confirmó la recepción del pedido #' + orderId.slice(-6).toUpperCase() + '.',
      related_order_id: orderId
    });
  }

  showSuccess('Pedido marcado como recibido. ¡Gracias!');
  await loadOrders();
};

// ==========================================
// FILTRO
// ==========================================
document.getElementById('statusFilter').addEventListener('change', (e) => {
  const val = e.target.value;
  renderOrders(val === 'all' ? allOrders : allOrders.filter(o => o.status === val));
});

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
