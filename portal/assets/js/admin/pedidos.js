/**
 * Gestión de Pedidos — Vista Admin / Comercial
 * Admin ve todos los pedidos. Comercial solo ve los de sus clientes asignados.
 */

let allOrders = [];
let currentProfile = null;

const STATUS_LABELS = {
  pending:    { label: 'Pendiente',   css: 'status-pending' },
  approved:   { label: 'Aprobado',    css: 'status-approved' },
  processing: { label: 'En proceso',  css: 'status-processing' },
  dispatched: { label: 'Despachado',  css: 'status-dispatched' },
  completed:  { label: 'Completado',  css: 'status-completed' }
};

// Acciones disponibles según el estado actual (solo para admin/comercial)
const NEXT_ACTIONS = {
  pending:    { label: 'Aprobar',          next: 'approved' },
  approved:   { label: 'Marcar en proceso', next: 'processing' },
  processing: { label: 'Marcar despachado', next: 'dispatched' }
  // 'dispatched' → lo marca el cliente. 'completed' → estado final.
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
(async () => {
  const profile = await requireAdminOrCommercial();
  if (!profile) return;
  currentProfile = profile;

  const isCommercial = profile.role === 'commercial';

  await initNotifications(profile.id);

  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    if (isCommercial) roleEl.style.color = '#c084fc';
  }

  // Ocultar enlaces exclusivos de admin para comerciales
  if (isCommercial) {
    const lu = document.getElementById('linkUsuarios');
    const lc = document.getElementById('linkCatalogo');
    if (lu) lu.style.display = 'none';
    if (lc) lc.style.display = 'none';
  }

  document.getElementById('logoutBtn').onclick = () => logout();
  await loadOrders();
})();

// ==========================================
// CARGAR PEDIDOS
// ==========================================
async function loadOrders() {
  const isCommercial = currentProfile.role === 'commercial';

  let query = sb
    .from('orders')
    .select('id, status, notes, created_at, updated_at, client_id, profiles!orders_client_id_fkey(full_name, company_name), order_items(quantity, catalog_item_id, catalog_items(title))')
    .order('created_at', { ascending: false });

  // Comercial: solo sus clientes
  if (isCommercial) {
    query = query.eq('commercial_id', currentProfile.id);
  }

  const { data, error } = await query;

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
  document.getElementById('statPending').textContent   = orders.filter(o => o.status === 'pending').length;
  document.getElementById('statActive').textContent    = orders.filter(o => ['approved', 'processing', 'dispatched'].includes(o.status)).length;
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
      + '<p>No hay pedidos para mostrar.</p>'
      + '</div>';
    return;
  }

  list.innerHTML = orders.map((order, i) => {
    const st        = STATUS_LABELS[order.status] || { label: order.status, css: '' };
    const fecha     = new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const cliente   = order.profiles;
    const empresa   = cliente?.company_name || cliente?.full_name || 'Cliente desconocido';
    const itemCount = (order.order_items || []).reduce((s, it) => s + (it.quantity || 1), 0);

    // Botón de acción según el estado
    const action = NEXT_ACTIONS[order.status];
    const actionBtn = action
      ? '<button class="btn btn--primary btn--sm" style="margin-top:12px;" onclick="advanceStatus(\'' + order.id + '\',\'' + action.next + '\')">' + action.label + '</button>'
      : (order.status === 'dispatched'
        ? '<span style="font-size:0.82rem;color:#059669;margin-top:12px;display:block;">✓ Despachado — esperando confirmación del cliente</span>'
        : '');

    // Detalle de items
    const itemsHtml = (order.order_items || []).map(item =>
      '<div class="order-item-row">'
      + '<span>' + (item.catalog_items?.title || 'Producto eliminado') + '</span>'
      + '<span style="color:var(--c-muted);">x' + item.quantity + '</span>'
      + '</div>'
    ).join('');

    return '<div class="order-card">'
      + '<div class="order-card__header" onclick="toggleOrder(' + i + ')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + empresa + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + fecha + ' · Pedido #' + order.id.slice(-6).toUpperCase() + ' · ' + itemCount + ' producto' + (itemCount !== 1 ? 's' : '')
      + '</div>'
      + '</div>'
      + '<span class="status-badge ' + st.css + '">' + st.label + '</span>'
      + '</div>'
      + '<div class="order-card__body" id="orderBody' + i + '">'
      + '<div style="padding-top:12px;">'
      + itemsHtml
      + actionBtn
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

window.toggleOrder = function(i) {
  document.getElementById('orderBody' + i).classList.toggle('open');
};

// ==========================================
// AVANZAR ESTADO DEL PEDIDO
// ==========================================
window.advanceStatus = async function(orderId, newStatus) {
  const btn = event.target;
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const { error } = await sb.from('orders')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    showError('Error al actualizar: ' + error.message);
    btn.textContent = NEXT_ACTIONS[allOrders.find(o => o.id === orderId)?.status]?.label || 'Actualizar';
    btn.disabled = false;
    return;
  }

  // Si fue despachado, notificar al cliente
  if (newStatus === 'dispatched') {
    const order = allOrders.find(o => o.id === orderId);
    if (order?.client_id) {
      await sb.from('notifications').insert({
        user_id:          order.client_id,
        type:             'order_dispatched',
        message:          'Tu pedido #' + orderId.slice(-6).toUpperCase() + ' ha sido despachado. ¡Revisa tus pedidos para confirmarlo!',
        related_order_id: orderId
      });
    }
  }

  showSuccess('Estado actualizado correctamente.');
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
// HAMBURGUESA Y ALERTAS
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
  setTimeout(() => el.classList.remove('show'), 4000);
}
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 6000);
}
