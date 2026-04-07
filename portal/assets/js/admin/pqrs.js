/**
 * PQRS — Vista Admin / Comercial
 * Admin: accordion Comercial → Empresa → PQRS
 * Comercial: accordion Empresa → PQRS (solo sus clientes)
 */

let allPqrs      = [];
let currentProfile = null;
let openGroupId  = null;
let currentPqrId = null;

const TYPE_LABELS = {
  peticion:   'Petición',
  queja:      'Queja',
  reclamo:    'Reclamo',
  sugerencia: 'Sugerencia'
};

const TYPE_CSS = {
  peticion:   'pqr-type--peticion',
  queja:      'pqr-type--queja',
  reclamo:    'pqr-type--reclamo',
  sugerencia: 'pqr-type--sugerencia'
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
(async () => {
  const profile = await requireAdminOrCommercial();
  if (!profile) return;
  currentProfile = profile;

  await initNotifications(profile.id);
  showAdminOnlyContent(profile);

  const isCommercial = profile.role === 'commercial';

  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    if (isCommercial) roleEl.style.color = '#c084fc';
  }



  document.getElementById('logoutBtn').onclick = () => logout();
  initAudit(profile);
  await loadPqrs();
})();

// ==========================================
// CARGAR PQRS
// ==========================================
async function loadPqrs() {
  const isCommercial = currentProfile.role === 'commercial';

  let query = sb.from('pqrs')
    .select('id, type, subject, description, response, status, support_path, attachment_path, created_at, closed_at, client_id, commercial_id, profiles!pqrs_client_id_fkey(full_name, company_name), comercial:profiles!pqrs_commercial_id_fkey(full_name), closer:profiles!pqrs_closed_by_fkey(full_name)')
    .order('created_at', { ascending: false });

  if (isCommercial) {
    query = query.eq('commercial_id', currentProfile.id);
  }

  const { data, error } = await query;

  if (error) {
    document.getElementById('pqrsList').innerHTML =
      '<p style="color:var(--c-muted);">Error al cargar PQRS: ' + error.message + '</p>';
    return;
  }

  allPqrs = data || [];
  updateStats(allPqrs);
  applyFilters();
}

function updateStats(pqrs) {
  document.getElementById('statTotal').textContent   = pqrs.length;
  document.getElementById('statPending').textContent = pqrs.filter(p => p.status === 'pending').length;
  document.getElementById('statClosed').textContent  = pqrs.filter(p => p.status === 'closed').length;
}

// ==========================================
// FILTROS
// ==========================================
function applyFilters() {
  const q      = (document.getElementById('pqrSearch').value || '').toLowerCase();
  const status = document.getElementById('statusFilter').value;

  let filtered = allPqrs;
  if (q) filtered = filtered.filter(p =>
    (p.subject     || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  );
  if (status !== 'all') filtered = filtered.filter(p => p.status === status);

  if (currentProfile.role === 'commercial') {
    renderCommercialView(groupByClient(filtered));
  } else {
    renderAdminView(filtered);
  }
}

document.getElementById('pqrSearch').addEventListener('input', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);

// ==========================================
// AGRUPACIÓN
// ==========================================
function groupByCommercialAndClient(pqrs) {
  const map = {};
  pqrs.forEach(p => {
    const cid   = p.commercial_id || '__none__';
    const cname = p.comercial?.full_name || 'Sin comercial';
    if (!map[cid]) map[cid] = { commercialId: cid, name: cname, clients: {} };
    const lid   = p.client_id;
    const lname = p.profiles?.company_name || p.profiles?.full_name || 'Cliente';
    if (!map[cid].clients[lid]) map[cid].clients[lid] = { clientId: lid, company: lname, pqrs: [] };
    map[cid].clients[lid].pqrs.push(p);
  });
  return Object.values(map)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(g => ({ ...g, clients: Object.values(g.clients).sort((a, b) => a.company.localeCompare(b.company)) }));
}

function groupByClient(pqrs) {
  const map = {};
  pqrs.forEach(p => {
    const id   = p.client_id;
    const name = p.profiles?.company_name || p.profiles?.full_name || 'Cliente';
    if (!map[id]) map[id] = { clientId: id, company: name, pqrs: [] };
    map[id].pqrs.push(p);
  });
  return Object.values(map).sort((a, b) => a.company.localeCompare(b.company));
}

// ==========================================
// VISTA ADMIN — Comercial → Empresa → PQRS
// ==========================================
function renderAdminView(pqrs) {
  const list = document.getElementById('pqrsList');
  if (!pqrs.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--c-muted);"><p style="font-size:1.5rem;margin-bottom:8px;">💬</p><p>No hay PQRS para mostrar.</p></div>';
    return;
  }

  const groups = groupByCommercialAndClient(pqrs);

  list.innerHTML = groups.map(g => {
    const totalPqrs   = g.clients.reduce((s, c) => s + c.pqrs.length, 0);
    const pendingPqrs = g.clients.reduce((s, c) => s + c.pqrs.filter(p => p.status === 'pending').length, 0);

    const clientsHtml = g.clients.map(c => {
      const pending = c.pqrs.filter(p => p.status === 'pending').length;
      const subId   = 'sub-' + g.commercialId + '-' + c.clientId;
      return '<div style="border-bottom:1px solid var(--c-border);">'
        + '<div onclick="toggleSubGroup(\'' + subId + '\')" '
        + 'style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px 10px 32px;cursor:pointer;gap:12px;"'
        + ' onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:0.85rem;font-weight:600;">' + escHtml(c.company) + '</div>'
        + '<div style="font-size:0.73rem;color:var(--c-muted);margin-top:1px;">'
        + pending + ' pendiente' + (pending !== 1 ? 's' : '') + ' · ' + c.pqrs.length + ' en total'
        + '</div></div>'
        + '<svg id="sub-chevron-' + subId + '" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;color:var(--c-muted);"><polyline points="6 9 12 15 18 9"/></svg>'
        + '</div>'
        + '<div id="sub-body-' + subId + '" style="display:none;">'
        + '<div style="max-height:280px;overflow-y:auto;">' + c.pqrs.map(p => pqrTicketRow(p)).join('') + '</div>'
        + '</div></div>';
    }).join('');

    return '<div class="order-card">'
      + '<div class="order-card__header" onclick="toggleGroup(\'' + g.commercialId + '\')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + escHtml(g.name) + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + g.clients.length + ' empresa' + (g.clients.length !== 1 ? 's' : '')
      + ' · ' + pendingPqrs + ' pendiente' + (pendingPqrs !== 1 ? 's' : '')
      + ' · ' + totalPqrs + ' en total'
      + '</div></div>'
      + '<svg id="grp-chevron-' + g.commercialId + '" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div id="grp-body-' + g.commercialId + '" style="display:none;border-top:1px solid var(--c-border);">' + clientsHtml + '</div>'
      + '</div>';
  }).join('');
}

// ==========================================
// VISTA COMERCIAL — Empresa → PQRS
// ==========================================
function renderCommercialView(groups) {
  const list = document.getElementById('pqrsList');
  if (!groups.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--c-muted);"><p style="font-size:1.5rem;margin-bottom:8px;">💬</p><p>No hay PQRS para mostrar.</p></div>';
    return;
  }

  list.innerHTML = groups.map(g => {
    const pending = g.pqrs.filter(p => p.status === 'pending').length;
    return '<div class="order-card">'
      + '<div class="order-card__header" onclick="toggleGroup(\'' + g.clientId + '\')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + escHtml(g.company) + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + pending + ' pendiente' + (pending !== 1 ? 's' : '') + ' · ' + g.pqrs.length + ' en total'
      + '</div></div>'
      + '<svg id="grp-chevron-' + g.clientId + '" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div id="grp-body-' + g.clientId + '" style="display:none;border-top:1px solid var(--c-border);">'
      + '<div style="max-height:280px;overflow-y:auto;">' + g.pqrs.map(p => pqrTicketRow(p)).join('') + '</div>'
      + '</div></div>';
  }).join('');
}

function pqrTicketRow(p) {
  const isPending = p.status === 'pending';
  const fecha     = new Date(p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  const typeCss   = TYPE_CSS[p.type] || '';
  return '<div onclick="openPqrModal(\'' + p.id + '\')"'
    + ' style="display:flex;justify-content:space-between;align-items:center;gap:12px;'
    + 'padding:12px 20px;cursor:pointer;user-select:none;border-bottom:1px solid var(--c-border);"'
    + ' onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:0.83rem;font-weight:600;">'
    + '<span class="pqr-type-badge ' + typeCss + '">' + (TYPE_LABELS[p.type] || p.type) + '</span>'
    + ' <span style="margin-left:4px;">' + escHtml(p.subject) + '</span>'
    + '</div>'
    + '<div style="font-size:0.73rem;color:var(--c-muted);margin-top:3px;">' + fecha + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
    + '<span class="status-badge ' + (isPending ? 'pqr-pending' : 'pqr-closed') + '">' + (isPending ? 'Pendiente' : 'Cerrada') + '</span>'
    + '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="color:var(--c-muted);"><polyline points="9 18 15 12 9 6"/></svg>'
    + '</div></div>';
}

// ==========================================
// ACORDEÓN
// ==========================================
window.toggleGroup = function(id) {
  if (openGroupId && openGroupId !== id) {
    const prev = document.getElementById('grp-body-' + openGroupId);
    const prevC = document.getElementById('grp-chevron-' + openGroupId);
    if (prev)  prev.style.display  = 'none';
    if (prevC) prevC.style.transform = '';
  }
  const body    = document.getElementById('grp-body-'    + id);
  const chevron = document.getElementById('grp-chevron-' + id);
  if (!body) return;
  const isOpen       = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  openGroupId = isOpen ? null : id;
};

window.toggleSubGroup = function(subId) {
  const body    = document.getElementById('sub-body-'    + subId);
  const chevron = document.getElementById('sub-chevron-' + subId);
  if (!body) return;
  const isOpen       = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// ==========================================
// MODAL DETALLE
// ==========================================
window.openPqrModal = async function(pqrId) {
  const p = allPqrs.find(x => x.id === pqrId);
  if (!p) return;
  currentPqrId = pqrId;

  const isPending = p.status === 'pending';
  const fecha     = new Date(p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  document.getElementById('detailCompany').textContent        = p.profiles?.company_name || p.profiles?.full_name || 'Cliente';
  document.getElementById('detailCode').textContent           = '#' + pqrId.slice(-6).toUpperCase();
  document.getElementById('detailTypeBadge').textContent      = TYPE_LABELS[p.type] || p.type;
  document.getElementById('detailTypeBadge').className        = 'pqr-type-badge ' + (TYPE_CSS[p.type] || '');
  document.getElementById('detailStatusBadge').textContent    = isPending ? 'Pendiente' : 'Cerrada';
  document.getElementById('detailStatusBadge').className      = 'status-badge ' + (isPending ? 'pqr-pending' : 'pqr-closed');
  document.getElementById('detailSubject').textContent        = p.subject;
  document.getElementById('detailDescription').textContent    = p.description;
  document.getElementById('detailDate').textContent           = fecha;

  // Anexo del cliente
  const attachWrap = document.getElementById('detailAttachWrap');
  if (attachWrap) {
    if (p.attachment_path) {
      const { data: attData } = await sb.storage.from('pqrs-support').createSignedUrl(p.attachment_path, 300);
      const attLink = document.getElementById('detailAttachLink');
      if (attData?.signedUrl) { attLink.href = attData.signedUrl; attachWrap.style.display = 'block'; }
      else { attachWrap.style.display = 'none'; }
    } else {
      attachWrap.style.display = 'none';
    }
  }

  const closeSection  = document.getElementById('pqrCloseSection');
  const closedSection = document.getElementById('pqrClosedSection');
  const errEl         = document.getElementById('pqrCloseError');

  if (isPending) {
    closeSection.style.display  = 'block';
    closedSection.style.display = 'none';
    resetCloseDropArea();
    document.getElementById('closeFile').value = '';
    errEl.textContent = ''; errEl.classList.remove('show');
    document.getElementById('closeProgress').style.display = 'none';
    document.getElementById('closeProgressBar').style.width = '0%';
    const btn = document.getElementById('confirmClosePqrBtn');
    btn.textContent = 'Confirmar cierre'; btn.disabled = false;
    btn.style.display = 'inline-block';
  } else {
    closeSection.style.display  = 'none';
    const btn = document.getElementById('confirmClosePqrBtn');
    if (btn) btn.style.display = 'none';
    closedSection.style.display = 'block';
    document.getElementById('detailClosedDate').textContent =
      p.closed_at ? new Date(p.closed_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    document.getElementById('detailClosedBy').textContent = p.closer?.full_name || '—';

    const link = document.getElementById('detailSupportLink');
    if (p.support_path) {
      const { data: urlData } = await sb.storage.from('pqrs-support').createSignedUrl(p.support_path, 300);
      if (urlData?.signedUrl) { link.href = urlData.signedUrl; link.style.display = 'inline-flex'; }
      else { link.style.display = 'none'; }
    } else {
      link.style.display = 'none';
    }
  }

  document.getElementById('detailResponse').value = p.response || '';
  document.getElementById('responseSavedMsg').textContent = '';
  document.getElementById('responseSavedMsg').classList.remove('show');
  showPqrPage(1);

  document.getElementById('pqrDetailBackdrop').classList.add('open');
};

document.getElementById('closePqrDetail').onclick = closePqrDetailModal;
document.getElementById('pqrDetailBackdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closePqrDetailModal();
});

window.showPqrPage = function(n) {
  document.getElementById('pqrModalPage1').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('pqrModalPage2').style.display = n === 2 ? 'block' : 'none';
  const stepText = document.getElementById('pqrStepText');
  if (stepText) stepText.textContent = n + ' / 2';
};

document.getElementById('saveResponseBtn').onclick = async () => {
  const response = document.getElementById('detailResponse').value.trim();
  const btn      = document.getElementById('saveResponseBtn');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  const { error } = await sb.from('pqrs').update({ response }).eq('id', currentPqrId);
  btn.textContent = 'Guardar respuesta'; btn.disabled = false;
  const msgEl = document.getElementById('responseSavedMsg');
  if (error) {
    msgEl.textContent = 'Error al guardar: ' + error.message;
    msgEl.classList.add('show');
  } else {
    const pqr = allPqrs.find(x => x.id === currentPqrId);
    if (pqr) pqr.response = response;
    const company = pqr?.profiles?.company_name || pqr?.profiles?.full_name || 'Cliente';
    await logAudit('PQRS respondida', '#' + currentPqrId.slice(-6).toUpperCase() + ' — ' + (pqr?.subject || '') + ' (' + company + ')');
    msgEl.textContent = 'Respuesta guardada correctamente.';
    msgEl.classList.add('show');
    setTimeout(() => msgEl.classList.remove('show'), 3000);
  }
};

function closePqrDetailModal() {
  document.getElementById('pqrDetailBackdrop').classList.remove('open');
  currentPqrId = null;
}

// ==========================================
// CERRAR PQR — upload soporte obligatorio
// ==========================================
const closeDropArea = document.getElementById('closeDropArea');
closeDropArea.onclick = () => document.getElementById('closeFile').click();

document.getElementById('closeFile').onchange = e => {
  const file = e.target.files[0];
  if (file) {
    const size = (file.size / 1024 / 1024).toFixed(1);
    closeDropArea.innerHTML = '<div class="upload-area__icon">✅</div>'
      + '<p><strong>' + escHtml(file.name) + '</strong></p>'
      + '<p style="color:var(--c-muted);font-size:0.8rem;">' + size + ' MB listo para subir</p>';
    closeDropArea.onclick = () => document.getElementById('closeFile').click();
  } else {
    resetCloseDropArea();
  }
};

function resetCloseDropArea() {
  closeDropArea.innerHTML = '<div class="upload-area__icon">📎</div>'
    + '<p><strong>Haz clic o arrastra</strong> el archivo aquí</p>'
    + '<p style="color:var(--c-muted);font-size:0.8rem;">Imagen (JPG, PNG) o PDF — Máximo 10 MB</p>';
  closeDropArea.onclick = () => document.getElementById('closeFile').click();
}

document.getElementById('confirmClosePqrBtn').onclick = async () => {
  const file  = document.getElementById('closeFile').files[0];
  const errEl = document.getElementById('pqrCloseError');

  if (!file) {
    errEl.textContent = 'Debes cargar el soporte antes de cerrar la PQRS.';
    errEl.classList.add('show'); return;
  }
  if (file.size > 10 * 1024 * 1024) {
    errEl.textContent = 'El archivo supera el límite de 10 MB.';
    errEl.classList.add('show'); return;
  }

  errEl.classList.remove('show');
  const btn = document.getElementById('confirmClosePqrBtn');
  btn.textContent = 'Cerrando…'; btn.disabled = true;
  document.getElementById('closeProgress').style.display = 'block';
  document.getElementById('closeProgressBar').classList.add('progress-bar--active');

  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path     = currentPqrId + '/' + Date.now() + '_' + safeName;

  const { error: upErr } = await sb.storage.from('pqrs-support').upload(path, file);
  if (upErr) {
    errEl.textContent = 'Error al subir el soporte: ' + upErr.message;
    errEl.classList.add('show');
    document.getElementById('closeProgress').style.display = 'none';
    btn.textContent = 'Confirmar cierre'; btn.disabled = false;
    return;
  }

  const { error: dbErr } = await sb.from('pqrs').update({
    status:       'closed',
    support_path: path,
    closed_at:    new Date().toISOString(),
    closed_by:    currentProfile.id
  }).eq('id', currentPqrId);

  if (dbErr) {
    errEl.textContent = 'Error al cerrar: ' + dbErr.message;
    errEl.classList.add('show');
    document.getElementById('closeProgress').style.display = 'none';
    btn.textContent = 'Confirmar cierre'; btn.disabled = false;
    return;
  }

  document.getElementById('closeProgressBar').classList.remove('progress-bar--active');
  document.getElementById('closeProgressBar').style.width = '100%';
  setTimeout(() => {
    document.getElementById('closeProgress').style.display = 'none';
    document.getElementById('closeProgressBar').style.width = '0%';
  }, 600);

  const pqr     = allPqrs.find(x => x.id === currentPqrId);
  const company = pqr?.profiles?.company_name || pqr?.profiles?.full_name || 'Cliente';
  await logAudit('PQRS cerrada', '#' + currentPqrId.slice(-6).toUpperCase() + ' — ' + (pqr?.subject || '') + ' (' + company + ')');

  closePqrDetailModal();
  btn.textContent = 'Confirmar cierre'; btn.disabled = false;
  showSuccess('PQRS cerrada correctamente.');
  await loadPqrs();
};

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
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
