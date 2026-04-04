/**
 * Mis Pedidos — Vista Cliente
 * Lista plana de pedidos. Clic → modal de detalle con historial (solo lectura).
 * Si el pedido está 'dispatched', el cliente puede marcarlo como completado.
 */

let allOrders      = [];
let currentProfile = null;

const STATUS_LABELS = {
  pending:  { label: 'Pendiente de aprobación', css: 'status-pending' },
  approved: { label: 'Aprobado',                css: 'status-approved' }
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

  document.getElementById('closeOrderDetail').onclick = closeModal;
  document.getElementById('orderDetailBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
})();

// ==========================================
// CARGAR PEDIDOS
// ==========================================
async function loadOrders() {
  const { data, error } = await sb
    .from('orders')
    .select('id, status, notes, created_at, updated_at, order_items(quantity, catalog_item_id, catalog_items(title))')
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
  document.getElementById('statPending').textContent   = orders.filter(o => o.status === 'pending').length;
  document.getElementById('statCompleted').textContent = orders.filter(o => o.status === 'approved').length;
}

// ==========================================
// RENDERIZAR LISTA
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

  list.innerHTML = orders.map(order => {
    const st        = STATUS_LABELS[order.status] || { label: order.status, css: '' };
    const fecha     = new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const itemCount = (order.order_items || []).reduce((s, i) => s + (i.quantity || 1), 0);

    return '<div class="order-card" style="cursor:pointer;" onclick="openOrderModal(\'' + order.id + '\')">'
      + '<div class="order-card__header" style="pointer-events:none;">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">Pedido #' + order.id.slice(-6).toUpperCase() + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + fecha + ' · ' + itemCount + ' producto' + (itemCount !== 1 ? 's' : '')
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      + '<span class="status-badge ' + st.css + '">' + st.label + '</span>'
      + '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

// ==========================================
// MODAL DE DETALLE (solo lectura para el cliente)
// ==========================================
window.openOrderModal = async function(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const st = STATUS_LABELS[order.status] || { label: order.status, css: '' };

  // Cabecera: empresa del cliente + ticket
  document.getElementById('detailCompany').textContent = currentProfile.company_name || currentProfile.full_name || 'Mi empresa';
  document.getElementById('detailTicket').textContent  = '#' + orderId.slice(-6).toUpperCase();
  const badge = document.getElementById('detailStatusBadge');
  badge.textContent = st.label;
  badge.className   = 'status-badge ' + st.css;

  // Productos
  const items = order.order_items || [];
  document.getElementById('detailItems').innerHTML = items.length
    ? items.map(it =>
        '<div class="order-item-row">'
        + '<span>' + (it.catalog_items?.title || 'Producto eliminado') + '</span>'
        + '<span style="color:var(--c-muted);">×' + it.quantity + '</span>'
        + '</div>'
      ).join('')
    : '<p style="color:var(--c-muted);font-size:0.875rem;">Sin productos.</p>';

  // Abrir modal mientras se carga el historial
  document.getElementById('detailHistory').innerHTML = '<p style="color:var(--c-muted);font-size:0.8rem;">Cargando historial…</p>';
  document.getElementById('orderDetailBackdrop').classList.add('open');

  // Sin acciones disponibles para el cliente con el flujo actual
  document.getElementById('detailActionWrap').style.display = 'none';

  // Cargar historial
  const { data: logs } = await sb
    .from('order_status_log')
    .select('status, changed_at')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: true });

  document.getElementById('detailHistory').innerHTML = buildTimeline(order, logs);
};

// ==========================================
// HELPERS COMPARTIDOS
// ==========================================
function fmtDateTime(iso) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function timelineItem(label, dateIso) {
  return '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">'
    + '<div style="width:8px;height:8px;border-radius:50%;background:var(--c-brand);margin-top:4px;flex-shrink:0;"></div>'
    + '<div>'
    + '<div style="font-size:0.78rem;font-weight:600;color:var(--c-text);">' + label + '</div>'
    + '<div style="font-size:0.72rem;color:var(--c-muted);">' + fmtDateTime(dateIso) + '</div>'
    + '</div>'
    + '</div>';
}

function buildTimeline(order, logs) {
  let html = timelineItem('Pedido creado — Pendiente', order.created_at);
  if (logs && logs.length) {
    html += logs.map(e => timelineItem(STATUS_LABELS[e.status]?.label || e.status, e.changed_at)).join('');
  } else if (order.status !== 'pending') {
    const st = STATUS_LABELS[order.status];
    html += timelineItem(st?.label || order.status, order.updated_at || order.created_at);
  }
  return html;
}

function closeModal() {
  document.getElementById('orderDetailBackdrop').classList.remove('open');
}

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
