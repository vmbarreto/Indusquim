/**
 * Gestión de Pedidos — Vista Admin / Comercial
 * Admin ve todos los pedidos. Comercial solo ve los de sus clientes asignados.
 */

let allOrders         = [];
let allGroups         = [];
let currentProfile    = null;
let openGroupClientId = null;   // Grupo/empresa expandido en el acordeón
let currentDetailOrder = null;  // { orderId, companyName } — pedido abierto en el modal

const STATUS_LABELS = {
  pending:  { label: 'Pendiente', css: 'status-pending' },
  approved: { label: 'Aprobado',  css: 'status-approved' }
};

// Acciones disponibles según el estado actual
const NEXT_ACTIONS = {
  pending: { label: 'Aprobar', next: 'approved' }
  // 'approved' → estado final
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
    // Comercial ve vista agrupada por cliente; el filtro de estado no aplica
    const sf = document.getElementById('statusFilter');
    if (sf) sf.closest('div').style.display = 'none';
  }

  document.getElementById('logoutBtn').onclick = () => logout();
  initAudit(profile);
  await loadOrders();
})();

// ==========================================
// CARGAR PEDIDOS
// ==========================================
async function loadOrders() {
  const isCommercial = currentProfile.role === 'commercial';

  let query = sb
    .from('orders')
    .select('id, status, notes, delivery_date, created_at, updated_at, client_id, commercial_id, profiles!orders_client_id_fkey(full_name, company_name), comercial:profiles!orders_commercial_id_fkey(full_name), order_items(quantity, catalog_item_id, catalog_items(title))')
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

  if (isCommercial) {
    allGroups = groupByClient(allOrders);
    renderCommercialView(allGroups);
  } else {
    renderAdminView(allOrders);
  }
}

function updateStats(orders) {
  document.getElementById('statTotal').textContent   = orders.length;
  document.getElementById('statPending').textContent = orders.filter(o => o.status === 'pending').length;
  document.getElementById('statActive').textContent  = orders.filter(o => o.status === 'approved').length;
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
// VISTA ADMIN — ACORDEÓN POR COMERCIAL → EMPRESA
// ==========================================

/**
 * Agrupa pedidos en árbol: Comercial → Empresa → Pedidos
 */
function groupByCommercialAndClient(orders) {
  const map = {};
  orders.forEach(o => {
    const cid   = o.commercial_id || '__none__';
    const cname = o.comercial?.full_name || 'Sin comercial';
    if (!map[cid]) map[cid] = { commercialId: cid, name: cname, clients: {} };

    const lid   = o.client_id || '__noclient__';
    const lname = o.profiles?.company_name || o.profiles?.full_name || 'Cliente desconocido';
    if (!map[cid].clients[lid]) map[cid].clients[lid] = { clientId: lid, company: lname, orders: [] };
    map[cid].clients[lid].orders.push(o);
  });

  return Object.values(map)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(g => ({
      ...g,
      clients: Object.values(g.clients).sort((a, b) => a.company.localeCompare(b.company))
    }));
}

/**
 * Fila de ticket dentro de la sub-lista de empresa.
 * Muestra código, fecha, estado. Hover → tooltip flotante. Clic → modal.
 */
function ticketRowHTML(o) {
  const st      = STATUS_LABELS[o.status] || { label: o.status, css: '' };
  const fecha   = new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  const empresa = (o.profiles?.company_name || o.profiles?.full_name || 'Cliente')
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return '<div class="ticket-row" '
    + 'onclick="openOrderModal(\'' + o.id + '\',\'' + empresa + '\')" '
    + 'onmouseenter="showOrderTooltip(event,\'' + o.id + '\')" '
    + 'onmouseleave="hideOrderTooltip()" '
    + 'style="display:flex;justify-content:space-between;align-items:center;gap:12px;'
    + 'padding:10px 20px 10px 40px;cursor:pointer;user-select:none;border-bottom:1px solid var(--c-border);"'
    + ' onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:0.82rem;font-weight:700;letter-spacing:0.03em;">'
    + '#' + o.id.slice(-6).toUpperCase()
    + '</div>'
    + '<div style="font-size:0.73rem;color:var(--c-muted);margin-top:2px;">' + fecha + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
    + '<span class="status-badge ' + st.css + '">' + st.label + '</span>'
    + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"'
    + ' style="color:var(--c-muted);flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>'
    + '</div>'
    + '</div>';
}

/**
 * Tooltip flotante: aparece al hacer hover sobre un ticket (solo en dispositivos con mouse).
 * Muestra empresa, código, fecha, productos y estado del pedido.
 */
window.showOrderTooltip = function(event, orderId) {
  if (window.matchMedia('(hover: none)').matches) return; // sin hover en touch
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const tooltip = document.getElementById('orderTooltip');
  const items   = order.order_items || [];
  const st      = STATUS_LABELS[order.status] || { label: order.status, css: '' };
  const empresa = order.profiles?.company_name || order.profiles?.full_name || 'Cliente';
  const fecha   = new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  const itemsHtml = items.length
    ? items.map(it =>
        '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:5px;">'
        + '<span>' + (it.catalog_items?.title || 'Producto eliminado') + '</span>'
        + '<span style="color:var(--c-muted);flex-shrink:0;">×' + it.quantity + '</span>'
        + '</div>'
      ).join('')
    : '<div style="color:var(--c-muted);">Sin productos</div>';

  tooltip.innerHTML =
    '<div style="font-size:0.7rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">'
    + empresa + '</div>'
    + '<div style="font-size:0.88rem;font-weight:700;margin-bottom:1px;">#' + orderId.slice(-6).toUpperCase() + '</div>'
    + '<div style="font-size:0.75rem;color:var(--c-muted);margin-bottom:10px;">' + fecha + '</div>'
    + '<div style="border-top:1px solid var(--c-border);padding-top:8px;margin-bottom:8px;font-size:0.78rem;">'
    + itemsHtml + '</div>'
    + '<span class="status-badge ' + st.css + '">' + st.label + '</span>';

  // Posicionar a la derecha de la fila (o a la izquierda si no hay espacio)
  const rect = event.currentTarget.getBoundingClientRect();
  const tipW = 240;
  let left = rect.right + 10;
  if (left + tipW > window.innerWidth - 12) left = rect.left - tipW - 10;
  let top  = rect.top - 8;
  tooltip.style.display = 'block';
  const tipH = tooltip.offsetHeight || 180;
  if (top + tipH > window.innerHeight - 12) top = window.innerHeight - tipH - 12;
  if (top < 8) top = 8;
  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
};

window.hideOrderTooltip = function() {
  const t = document.getElementById('orderTooltip');
  if (t) t.style.display = 'none';
};

function renderAdminView(orders) {
  const list = document.getElementById('ordersList');
  if (!orders.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--c-muted);">'
      + '<p style="font-size:1.5rem;margin-bottom:8px;">📋</p>'
      + '<p>No hay pedidos para mostrar.</p>'
      + '</div>';
    return;
  }

  const groups = groupByCommercialAndClient(orders);

  list.innerHTML = groups.map(g => {
    const totalActive = g.clients.reduce((s, c) => s + c.orders.filter(o => o.status !== 'completed').length, 0);
    const totalOrders = g.clients.reduce((s, c) => s + c.orders.length, 0);

    // Sub-acordeones por empresa
    const clientsHtml = g.clients.map(c => {
      const cActive       = c.orders.filter(o => o.status !== 'completed').length;
      const activeOrds    = c.orders.filter(o => o.status !== 'completed')
                                     .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const completedOrds = c.orders.filter(o => o.status === 'completed')
                                     .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      let rowsHtml = activeOrds.map(o => ticketRowHTML(o)).join('');
      if (completedOrds.length) {
        rowsHtml += '<div style="padding:6px 20px 4px 40px;font-size:0.72rem;font-weight:700;color:var(--c-muted);'
          + 'text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid var(--c-border);">Completadas</div>';
        rowsHtml += completedOrds.map(o => ticketRowHTML(o)).join('');
      }

      const subId = 'sub-' + g.commercialId + '-' + c.clientId;
      return '<div style="border-bottom:1px solid var(--c-border);">'
        + '<div onclick="toggleSubGroup(\'' + subId + '\')" '
        + 'style="display:flex;justify-content:space-between;align-items:center;'
        + 'padding:10px 20px 10px 32px;cursor:pointer;gap:12px;"'
        + ' onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:0.85rem;font-weight:600;">' + c.company + '</div>'
        + '<div style="font-size:0.73rem;color:var(--c-muted);margin-top:1px;">'
        + cActive + ' activo' + (cActive !== 1 ? 's' : '') + ' · ' + c.orders.length + ' en total'
        + '</div>'
        + '</div>'
        + '<svg id="sub-chevron-' + subId + '" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"'
        + ' viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;color:var(--c-muted);">'
        + '<polyline points="6 9 12 15 18 9"/></svg>'
        + '</div>'
        + '<div id="sub-body-' + subId + '" style="display:none;">'
        + '<div style="max-height:272px;overflow-y:auto;">' + rowsHtml + '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="order-card">'
      + '<div class="order-card__header" onclick="toggleGroup(\'' + g.commercialId + '\')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + g.name + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + g.clients.length + ' empresa' + (g.clients.length !== 1 ? 's' : '')
      + ' · ' + totalActive + ' pedido' + (totalActive !== 1 ? 's' : '') + ' activo' + (totalActive !== 1 ? 's' : '')
      + ' · ' + totalOrders + ' en total'
      + '</div>'
      + '</div>'
      + '<svg id="grp-chevron-' + g.commercialId + '" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"'
      + ' viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div id="grp-body-' + g.commercialId + '" style="display:none;border-top:1px solid var(--c-border);">'
      + clientsHtml
      + '</div>'
      + '</div>';
  }).join('');
}

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

  // Registrar el cambio de estado en el historial
  await sb.from('order_status_log').insert({
    order_id:   orderId,
    status:     newStatus,
    changed_by: currentProfile.id
  });

  const statusLabel = STATUS_LABELS[newStatus]?.label || newStatus;
  const order = allOrders.find(o => o.id === orderId);
  const empresa = order?.profiles?.company_name || order?.profiles?.full_name || 'Cliente';
  await logAudit('Estado de pedido actualizado', 'Pedido #' + orderId.slice(-6).toUpperCase() + ' (' + empresa + ') → ' + statusLabel);
  showSuccess('Estado actualizado correctamente.');
  await loadOrders();
};

// ==========================================
// FILTROS (estado + búsqueda por ticket)
// ==========================================
function applyFilters() {
  const isCommercial = currentProfile?.role === 'commercial';
  const search = (document.getElementById('ticketSearch')?.value || '').trim().toUpperCase();
  const status = isCommercial ? 'all' : (document.getElementById('statusFilter')?.value || 'all');

  let filtered = allOrders;

  if (search) {
    filtered = filtered.filter(o => o.id.slice(-6).toUpperCase().includes(search));
  }

  if (status && status !== 'all') {
    filtered = filtered.filter(o => o.status === status);
  }

  if (isCommercial) {
    allGroups = groupByClient(filtered);
    renderCommercialView(allGroups);
  } else {
    renderAdminView(filtered);
  }
}

document.getElementById('statusFilter').addEventListener('change', () => {
  if (currentProfile?.role === 'commercial') return;
  applyFilters();
});

document.getElementById('ticketSearch').addEventListener('input', () => {
  applyFilters();
});

// ==========================================
// VISTA COMERCIAL — ACORDEÓN IN-PAGE
// ==========================================
function groupByClient(orders) {
  const map = {};
  orders.forEach(o => {
    const id = o.client_id;
    if (!map[id]) {
      map[id] = {
        clientId: id,
        company:  o.profiles?.company_name || o.profiles?.full_name || 'Cliente desconocido',
        orders:   []
      };
    }
    map[id].orders.push(o);
  });
  return Object.values(map).sort((a, b) => a.company.localeCompare(b.company));
}

function renderCommercialView(groups) {
  const list = document.getElementById('ordersList');
  if (!groups.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--c-muted);">'
      + '<p style="font-size:1.5rem;margin-bottom:8px;">📋</p>'
      + '<p>No hay pedidos para mostrar.</p>'
      + '</div>';
    return;
  }

  list.innerHTML = groups.map(g => {
    const active = g.orders.filter(o => o.status !== 'completed').length;
    const compEsc = g.company.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const activeOrds    = g.orders.filter(o => o.status !== 'completed')
                                   .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const completedOrds = g.orders.filter(o => o.status === 'completed')
                                   .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    let rowsHtml = activeOrds.map(o => orderRowHTML(o, compEsc)).join('');
    if (completedOrds.length) {
      rowsHtml += '<div style="padding:8px 20px 6px;font-size:0.72rem;font-weight:700;color:var(--c-muted);'
        + 'text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid var(--c-border);">Completadas</div>';
      rowsHtml += completedOrds.map(o => orderRowHTML(o, compEsc)).join('');
    }

    return '<div class="order-card">'
      + '<div class="order-card__header" onclick="toggleGroup(\'' + g.clientId + '\')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + g.company + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + active + ' pedido' + (active !== 1 ? 's' : '') + ' activo' + (active !== 1 ? 's' : '')
      + ' · ' + g.orders.length + ' en total'
      + '</div>'
      + '</div>'
      + '<svg id="grp-chevron-' + g.clientId + '" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"'
      + ' viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div id="grp-body-' + g.clientId + '" style="display:none;border-top:1px solid var(--c-border);">'
      + '<div style="max-height:244px;overflow-y:auto;">' + rowsHtml + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

// Fila de pedido dentro del acordeón — clic abre modal de detalle
function orderRowHTML(o, companyName) {
  const st       = STATUS_LABELS[o.status] || { label: o.status, css: '' };
  const fecha    = new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  const items    = (o.order_items || []).map(it =>
    (it.catalog_items?.title || 'Producto') + ' ×' + it.quantity
  ).join(', ');
  const itemCount = (o.order_items || []).reduce((s, it) => s + (it.quantity || 1), 0);

  return '<div onclick="openOrderModal(\'' + o.id + '\',\'' + companyName + '\')"'
    + ' style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;'
    + 'padding:12px 20px;cursor:pointer;user-select:none;border-bottom:1px solid var(--c-border);"'
    + ' onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:0.82rem;font-weight:600;">#' + o.id.slice(-6).toUpperCase() + ' · ' + fecha + '</div>'
    + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
    + (items || itemCount + ' producto' + (itemCount !== 1 ? 's' : ''))
    + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
    + '<span class="status-badge ' + st.css + '">' + st.label + '</span>'
    + '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"'
    + ' style="color:var(--c-muted);flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>'
    + '</div>'
    + '</div>';
}

// Acordeón exclusivo nivel 1: solo un comercial abierto a la vez
window.toggleGroup = function(clientId) {
  if (openGroupClientId && openGroupClientId !== clientId) {
    const prevBody    = document.getElementById('grp-body-'    + openGroupClientId);
    const prevChevron = document.getElementById('grp-chevron-' + openGroupClientId);
    if (prevBody)    prevBody.style.display = 'none';
    if (prevChevron) prevChevron.style.transform = '';
  }
  const body    = document.getElementById('grp-body-'    + clientId);
  const chevron = document.getElementById('grp-chevron-' + clientId);
  if (!body) return;
  const isOpen        = body.style.display !== 'none';
  body.style.display  = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  openGroupClientId   = isOpen ? null : clientId;
};

// Acordeón nivel 2 (empresa dentro de comercial) — múltiples abiertos permitidos
window.toggleSubGroup = function(subId) {
  const body    = document.getElementById('sub-body-'    + subId);
  const chevron = document.getElementById('sub-chevron-' + subId);
  if (!body) return;
  const isOpen       = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// ==========================================
// HELPERS DE TIEMPO E HISTORIAL
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

// ==========================================
// MODAL DE DETALLE DE PEDIDO (COMERCIAL)
// ==========================================
window.openOrderModal = async function(orderId, companyName) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  currentDetailOrder = { orderId, companyName };

  const st = STATUS_LABELS[order.status] || { label: order.status, css: '' };

  document.getElementById('detailCompany').textContent = companyName;
  document.getElementById('detailTicket').textContent  = '#' + orderId.slice(-6).toUpperCase();
  const badge = document.getElementById('detailStatusBadge');
  badge.textContent = st.label;
  badge.className   = 'status-badge ' + st.css;

  const items = order.order_items || [];
  document.getElementById('detailItems').innerHTML = items.length
    ? items.map(it =>
        '<div class="order-item-row">'
        + '<span>' + (it.catalog_items?.title || 'Producto eliminado') + '</span>'
        + '<span style="color:var(--c-muted);">×' + it.quantity + '</span>'
        + '</div>'
      ).join('')
    : '<p style="color:var(--c-muted);font-size:0.875rem;">Sin productos.</p>';

  // Fecha de entrega y observaciones
  const detailMeta = document.getElementById('detailMeta');
  if (detailMeta) {
    const deliveryStr = order.delivery_date
      ? new Date(order.delivery_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    detailMeta.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:6px;font-size:0.82rem;">'
      + '<div><span style="color:var(--c-muted);">Fecha de entrega: </span><strong>' + deliveryStr + '</strong></div>'
      + (order.notes ? '<div><span style="color:var(--c-muted);">Observaciones: </span>' + order.notes + '</div>' : '')
      + '</div>';
  }

  document.getElementById('detailHistory').innerHTML = '<p style="color:var(--c-muted);font-size:0.8rem;">Cargando historial…</p>';
  document.getElementById('orderDetailBackdrop').classList.add('open');

  const action     = NEXT_ACTIONS[order.status];
  const actionWrap = document.getElementById('detailActionWrap');
  const actionBtn  = document.getElementById('detailActionBtn');
  actionBtn.disabled = false;

  if (action) {
    actionBtn.textContent = action.label;
    actionBtn.onclick = () => advanceStatusFromModal(orderId, action.next, companyName);
    actionWrap.style.display = 'block';
  } else {
    actionWrap.style.display = 'none';
  }

  const { data: logs } = await sb
    .from('order_status_log')
    .select('status, changed_at')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: true });

  document.getElementById('detailHistory').innerHTML = buildTimeline(order, logs);
};

async function advanceStatusFromModal(orderId, newStatus, companyName) {
  const btn = document.getElementById('detailActionBtn');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const { error } = await sb.from('orders')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    showError('Error al actualizar: ' + error.message);
    btn.disabled = false;
    const action = NEXT_ACTIONS[allOrders.find(o => o.id === orderId)?.status];
    if (action) btn.textContent = action.label;
    return;
  }

  await sb.from('order_status_log').insert({
    order_id:   orderId,
    status:     newStatus,
    changed_by: currentProfile.id
  });

  const statusLabelModal = STATUS_LABELS[newStatus]?.label || newStatus;
  await logAudit('Estado de pedido actualizado', 'Pedido #' + orderId.slice(-6).toUpperCase() + ' (' + companyName + ') → ' + statusLabelModal);
  showSuccess('Estado actualizado correctamente.');
  await loadOrders();
  openOrderModal(orderId, companyName);  // refresca el modal con el nuevo estado
}

document.getElementById('closeOrderDetail').onclick = () => {
  document.getElementById('orderDetailBackdrop').classList.remove('open');
  currentDetailOrder = null;
};
document.getElementById('orderDetailBackdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('orderDetailBackdrop').classList.remove('open');
    currentDetailOrder = null;
  }
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
