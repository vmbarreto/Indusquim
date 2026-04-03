/**
 * Módulo de Notificaciones — Portal Indusquim
 *
 * Uso: incluir este script en cualquier página del portal DESPUÉS de
 * supabase-client.js y auth.js. El HTML de la página debe tener en el topbar:
 *
 *   <div class="notif-wrap" id="notifWrap" style="position:relative;">
 *     <button class="btn btn--ghost btn--sm" id="notifBtn" style="position:relative;padding:8px 12px;" title="Notificaciones">
 *       <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
 *         <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
 *         <path d="M13.73 21a2 2 0 01-3.46 0"/>
 *       </svg>
 *       <span class="notif-badge" id="notifBadge" style="display:none;">0</span>
 *     </button>
 *     <div class="notif-panel" id="notifPanel">
 *       <div class="notif-panel__header">
 *         <span>Notificaciones</span>
 *         <button id="markAllRead">Marcar todas leídas</button>
 *       </div>
 *       <div id="notifList"></div>
 *     </div>
 *   </div>
 *
 * Llamar initNotifications() después de obtener el perfil del usuario.
 */

async function initNotifications(userId) {
  if (!userId) return;
  await loadNotifications(userId);

  // Abrir/cerrar panel
  const btn = document.getElementById('notifBtn');
  if (btn) {
    btn.onclick = (e) => {
      e.stopPropagation();
      document.getElementById('notifPanel').classList.toggle('open');
    };
  }

  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const wrap  = document.getElementById('notifWrap');
    if (panel && wrap && !wrap.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // Marcar todas como leídas
  const markAllBtn = document.getElementById('markAllRead');
  if (markAllBtn) {
    markAllBtn.onclick = async () => {
      await sb.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
      await loadNotifications(userId);
    };
  }
}

async function loadNotifications(userId) {
  const { data } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const notifications = data || [];
  const unread = notifications.filter(n => !n.read).length;

  // Badge
  const badge = document.getElementById('notifBadge');
  if (badge) {
    if (unread > 0) {
      badge.style.display = 'flex';
      badge.textContent = unread > 9 ? '9+' : unread;
    } else {
      badge.style.display = 'none';
    }
  }

  // Lista
  const list = document.getElementById('notifList');
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">No tienes notificaciones.</div>';
    return;
  }

  list.innerHTML = notifications.map(n => {
    const fecha = new Date(n.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const link  = n.related_order_id ? getOrderLink(n.type) : '#';
    return '<div class="notif-item' + (n.read ? '' : ' notif-item--unread') + '" onclick="handleNotifClick(\'' + n.id + '\',\'' + (n.related_order_id || '') + '\',\'' + n.type + '\')">'
      + '<div class="notif-item__icon">' + getNotifIcon(n.type) + '</div>'
      + '<div class="notif-item__body">'
      + '<p class="notif-item__msg">' + n.message + '</p>'
      + '<span class="notif-item__date">' + fecha + '</span>'
      + '</div>'
      + '</div>';
  }).join('');
}

function getNotifIcon(type) {
  if (type === 'new_order')        return '🛒';
  if (type === 'order_dispatched') return '🚚';
  if (type === 'order_completed')  return '✅';
  return '🔔';
}

function getOrderLink(type) {
  // Comercial/admin va a pedidos admin, cliente va a sus pedidos
  return type === 'new_order' || type === 'order_completed' ? 'pedidos.html' : '../cliente/pedidos.html';
}

window.handleNotifClick = async function(notifId, orderId, type) {
  // Marcar como leída
  await sb.from('notifications').update({ read: true }).eq('id', notifId);

  // Navegar según contexto
  if (orderId) {
    if (type === 'new_order' || type === 'order_completed') {
      window.location.href = 'pedidos.html';
    } else {
      window.location.href = '../cliente/pedidos.html';
    }
  }
};
