/**
 * Historial de cambios — Vista Admin
 * Muestra todos los registros de audit_log en orden cronológico descendente.
 * Solo lectura: no hay botones de edición ni eliminación.
 */

let allLogs = [];

(async () => {
  const profile = await requireAdminOrCommercial();
  if (!profile) return;

  await initNotifications(profile.id);

  const isCommercial = profile.role === 'commercial';

  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    if (isCommercial) roleEl.style.color = '#c084fc';
  }

  if (isCommercial) {
    const lu = document.getElementById('linkUsuarios');
    const lc = document.getElementById('linkCatalogo');
    if (lu) lu.style.display = 'none';
    if (lc) lc.style.display = 'none';
  }

  document.getElementById('logoutBtn').onclick = () => logout();

  // Comerciales solo ven sus propios registros; admin ve todo
  await loadAuditLog(isCommercial ? profile.id : null);
})();

// ==========================================
// CARGAR HISTORIAL
// ==========================================
async function loadAuditLog(filterUserId) {
  let query = sb
    .from('audit_log')
    .select('id, user_id, user_name, action, details, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (filterUserId) {
    query = query.eq('user_id', filterUserId);
  }

  const { data, error } = await query;

  if (error) {
    document.getElementById('auditTable').innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:var(--c-muted);padding:32px;">Error al cargar el historial: ' + error.message + '</td></tr>';
    return;
  }

  allLogs = data || [];
  populateUserFilter(allLogs);
  renderLogs(allLogs);
}

// ==========================================
// POBLAR FILTRO DE USUARIOS
// ==========================================
function populateUserFilter(logs) {
  const seen  = new Set();
  const sel   = document.getElementById('auditUserFilter');
  // Mantener solo la opción "Todos"
  while (sel.options.length > 1) sel.remove(1);

  logs.forEach(l => {
    if (l.user_id && !seen.has(l.user_id)) {
      seen.add(l.user_id);
      const opt = document.createElement('option');
      opt.value       = l.user_id;
      opt.textContent = l.user_name || 'Desconocido';
      sel.appendChild(opt);
    }
  });
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function badgeClass(action) {
  const a = (action || '').toLowerCase();
  if (a.includes('eliminad'))  return 'audit-badge--delete';
  if (a.includes('cread') || a.includes('subid')) return 'audit-badge--create';
  if (a.includes('estado') || a.includes('aprobad') || a.includes('despachad') || a.includes('proceso')) return 'audit-badge--status';
  if (a.includes('actualizad') || a.includes('reasignad') || a.includes('restablecid') || a.includes('editad')) return 'audit-badge--update';
  return 'audit-badge--other';
}

function renderLogs(logs) {
  const tbody = document.getElementById('auditTable');
  document.getElementById('auditCount').textContent = logs.length + ' registro' + (logs.length !== 1 ? 's' : '');

  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--c-muted);padding:40px;">Sin registros para mostrar.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const fecha = new Date(l.created_at).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) + ' ' + new Date(l.created_at).toLocaleTimeString('es-CO', {
      hour: '2-digit', minute: '2-digit'
    });

    return '<tr>'
      + '<td style="white-space:nowrap;font-size:0.82rem;color:var(--c-muted);">' + fecha + '</td>'
      + '<td style="font-weight:600;font-size:0.875rem;">' + escHtml(l.user_name || '—') + '</td>'
      + '<td><span class="audit-badge ' + badgeClass(l.action) + '">' + escHtml(l.action) + '</span></td>'
      + '<td style="font-size:0.82rem;">' + escHtml(l.details || '—') + '</td>'
      + '</tr>';
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// FILTROS
// ==========================================
function applyFilters() {
  const q    = document.getElementById('auditSearch').value.toLowerCase();
  const user = document.getElementById('auditUserFilter').value;
  const type = document.getElementById('auditTypeFilter').value.toLowerCase();

  const filtered = allLogs.filter(l => {
    const action  = (l.action  || '').toLowerCase();
    const details = (l.details || '').toLowerCase();

    if (q    && !action.includes(q)    && !details.includes(q))    return false;
    if (user && l.user_id !== user)                                 return false;
    if (type && !action.includes(type))                             return false;
    return true;
  });

  renderLogs(filtered);
}

document.getElementById('auditSearch').addEventListener('input', applyFilters);
document.getElementById('auditUserFilter').addEventListener('change', applyFilters);
document.getElementById('auditTypeFilter').addEventListener('change', applyFilters);

// ==========================================
// HAMBURGUESA
// ==========================================
const hbg     = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');
function toggleSidebar() { sidebar.classList.toggle('open'); hbg.classList.toggle('open'); overlay.classList.toggle('show'); }
if (hbg)     hbg.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);
