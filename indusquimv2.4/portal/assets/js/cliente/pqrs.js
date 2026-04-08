/**
 * PQRS — Vista Cliente
 * El cliente puede crear nuevas PQRS y ver el estado de las existentes.
 */

let allPqrs      = [];
let currentProfile = null;

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
  currentProfile = await getProfile();
  if (!currentProfile || currentProfile.role !== 'client') {
    window.location.href = '../login.html'; return;
  }

  document.getElementById('clientName').textContent    = currentProfile.full_name    || 'Cliente';
  document.getElementById('clientCompany').textContent = currentProfile.company_name || 'Indusquim';
  document.getElementById('homeLink').href = currentProfile.client_type === 'large' ? 'grande.html' : 'pequeno.html';
  document.getElementById('logoutBtn').onclick = () => logout();

  await loadPqrs();

  // Filtro
  document.getElementById('statusFilter').addEventListener('change', () => {
    const val = document.getElementById('statusFilter').value;
    renderPqrs(val === 'all' ? allPqrs : allPqrs.filter(p => p.status === val));
  });

  // Hamburguesa
  const hbg     = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  function toggleSidebar() { sidebar.classList.toggle('open'); hbg.classList.toggle('open'); overlay.classList.toggle('show'); }
  if (hbg)     hbg.addEventListener('click', toggleSidebar);
  if (overlay) overlay.addEventListener('click', toggleSidebar);
})();

// ==========================================
// CARGAR PQRS
// ==========================================
async function loadPqrs() {
  const { data, error } = await sb
    .from('pqrs')
    .select('id, type, subject, description, response, status, support_path, attachment_path, created_at, closed_at')
    .eq('client_id', currentProfile.id)
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('pqrsList').innerHTML =
      '<p style="color:var(--c-muted);">Error al cargar: ' + error.message + '</p>';
    return;
  }

  allPqrs = data || [];
  updateStats(allPqrs);
  renderPqrs(allPqrs);
}

function updateStats(pqrs) {
  document.getElementById('statTotal').textContent   = pqrs.length;
  document.getElementById('statPending').textContent = pqrs.filter(p => p.status === 'pending').length;
  document.getElementById('statClosed').textContent  = pqrs.filter(p => p.status === 'closed').length;
}

// ==========================================
// RENDERIZAR LISTA
// ==========================================
function renderPqrs(pqrs) {
  const list = document.getElementById('pqrsList');
  if (!pqrs.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--c-muted);">'
      + '<p style="font-size:1.5rem;margin-bottom:8px;">💬</p>'
      + '<p>No tienes PQRS registradas.</p>'
      + '<p style="font-size:0.85rem;margin-top:6px;">Usa el botón <strong>+ Nueva PQRS</strong> para radicar una.</p>'
      + '</div>';
    return;
  }

  list.innerHTML = pqrs.map(p => {
    const isPending = p.status === 'pending';
    const fecha     = new Date(p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const typeCss   = TYPE_CSS[p.type] || '';
    return '<div class="pqr-card" onclick="openPqrModal(\'' + p.id + '\')">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">'
      + '<span class="pqr-type-badge ' + typeCss + '">' + (TYPE_LABELS[p.type] || p.type) + '</span>'
      + '<span style="font-weight:600;font-size:0.875rem;">' + escHtml(p.subject) + '</span>'
      + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);">' + fecha + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      + '<span class="status-badge ' + (isPending ? 'pqr-pending' : 'pqr-closed') + '">' + (isPending ? 'Pendiente' : 'Cerrada') + '</span>'
      + '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="color:var(--c-muted);"><polyline points="9 18 15 12 9 6"/></svg>'
      + '</div></div>';
  }).join('');
}

// ==========================================
// MODAL DETALLE (solo lectura para el cliente)
// ==========================================
window.openPqrModal = async function(pqrId) {
  const p = allPqrs.find(x => x.id === pqrId);
  if (!p) return;

  const isPending = p.status === 'pending';
  const fecha     = new Date(p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  document.getElementById('detailCode').textContent        = 'PQRS #' + pqrId.slice(-6).toUpperCase();
  document.getElementById('detailTypeBadge').textContent   = TYPE_LABELS[p.type] || p.type;
  document.getElementById('detailTypeBadge').className     = 'pqr-type-badge ' + (TYPE_CSS[p.type] || '');
  document.getElementById('detailStatusBadge').textContent = isPending ? 'Pendiente' : 'Cerrada';
  document.getElementById('detailStatusBadge').className   = 'status-badge ' + (isPending ? 'pqr-pending' : 'pqr-closed');
  document.getElementById('detailSubject').textContent     = p.subject;
  document.getElementById('detailDescription').textContent = p.description;
  document.getElementById('detailDate').textContent        = fecha;

  // Anexo del cliente
  const attachWrap = document.getElementById('detailAttachWrap');
  if (p.attachment_path) {
    const { data: attData } = await sb.storage.from('pqrs-support').createSignedUrl(p.attachment_path, 300);
    const attLink = document.getElementById('detailAttachLink');
    if (attData?.signedUrl) { attLink.href = attData.signedUrl; attachWrap.style.display = 'block'; }
    else { attachWrap.style.display = 'none'; }
  } else {
    attachWrap.style.display = 'none';
  }

  // Respuesta del comercial (página 2)
  const responseEl   = document.getElementById('detailResponse');
  const noResponseEl = document.getElementById('detailNoResponse');
  if (p.response) {
    responseEl.textContent    = p.response;
    responseEl.style.display  = 'block';
    noResponseEl.style.display = 'none';
  } else {
    responseEl.textContent    = '';
    responseEl.style.display  = 'none';
    noResponseEl.style.display = 'block';
  }

  const closedInfo = document.getElementById('detailClosedInfo');
  if (!isPending) {
    closedInfo.style.display = 'block';
    document.getElementById('detailClosedDate').textContent =
      p.closed_at ? new Date(p.closed_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const link = document.getElementById('detailSupportLink');
    if (p.support_path) {
      const { data: urlData } = await sb.storage.from('pqrs-support').createSignedUrl(p.support_path, 300);
      if (urlData?.signedUrl) { link.href = urlData.signedUrl; link.style.display = 'inline-flex'; }
      else { link.style.display = 'none'; }
    } else {
      link.style.display = 'none';
    }
  } else {
    closedInfo.style.display = 'none';
  }

  showPqrPage(1);
  document.getElementById('pqrDetailBackdrop').classList.add('open');
};

document.getElementById('closePqrDetail').onclick = () =>
  document.getElementById('pqrDetailBackdrop').classList.remove('open');
document.getElementById('pqrDetailBackdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    document.getElementById('pqrDetailBackdrop').classList.remove('open');
});

window.showPqrPage = function(n) {
  // PROFESOR: Aplicamos el mismo principio aquí para no romper el flexbox del cuerpo del modal.
  const p1 = document.getElementById('pqrModalPage1');
  const p2 = document.getElementById('pqrModalPage2');

  if (n === 1) {
    p1.classList.remove('v-hidden');
    p2.classList.add('v-hidden');
  } else {
    p1.classList.add('v-hidden');
    p2.classList.remove('v-hidden');
  }

  // Estilos de los indicadores (puntos)
  document.getElementById('pqrDot1').style.background = n === 1 ? 'var(--c-brand)' : 'var(--c-bg-alt)';
  document.getElementById('pqrDot1').style.color       = n === 1 ? '#fff' : 'var(--c-muted)';
  document.getElementById('pqrDot2').style.background = n === 2 ? 'var(--c-brand)' : 'var(--c-bg-alt)';
  document.getElementById('pqrDot2').style.color       = n === 2 ? '#fff' : 'var(--c-muted)';
};

// ==========================================
// MODAL NUEVA PQRS — drop area
// ==========================================
const attachDropArea = document.getElementById('pqrAttachDropArea');
attachDropArea.onclick = () => document.getElementById('pqrAttachFile').click();

document.getElementById('pqrAttachFile').onchange = e => {
  const file = e.target.files[0];
  if (file) {
    const size = (file.size / 1024 / 1024).toFixed(1);
    attachDropArea.innerHTML = '<div class="upload-area__icon">✅</div>'
      + '<p><strong>' + escHtml(file.name) + '</strong></p>'
      + '<p style="color:var(--c-muted);font-size:0.8rem;">' + size + ' MB · <span style="cursor:pointer;text-decoration:underline;">Cambiar</span></p>';
    attachDropArea.onclick = () => document.getElementById('pqrAttachFile').click();
  } else {
    resetAttachDropArea();
  }
};

function resetAttachDropArea() {
  attachDropArea.innerHTML = '<div class="upload-area__icon">📎</div>'
    + '<p><strong>Haz clic o arrastra</strong> el archivo aquí</p>'
    + '<p style="color:var(--c-muted);font-size:0.8rem;">JPG, PNG, PDF</p>';
  attachDropArea.onclick = () => document.getElementById('pqrAttachFile').click();
}

document.getElementById('openNewPqrBtn').onclick = () => {
  document.getElementById('pqrType').value        = 'peticion';
  document.getElementById('pqrSubject').value     = '';
  document.getElementById('pqrDescription').value = '';
  document.getElementById('pqrAttachFile').value  = '';
  resetAttachDropArea();
  const errEl = document.getElementById('newPqrError');
  errEl.textContent = ''; errEl.classList.remove('show');
  document.getElementById('newPqrBackdrop').classList.add('open');
};
document.getElementById('closeNewPqrModal').onclick  = () => document.getElementById('newPqrBackdrop').classList.remove('open');
document.getElementById('cancelNewPqrModal').onclick = () => document.getElementById('newPqrBackdrop').classList.remove('open');
document.getElementById('newPqrBackdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('newPqrBackdrop').classList.remove('open');
});

document.getElementById('submitNewPqrBtn').onclick = async () => {
  const type        = document.getElementById('pqrType').value;
  const subject     = document.getElementById('pqrSubject').value.trim();
  const description = document.getElementById('pqrDescription').value.trim();
  const attachFile  = document.getElementById('pqrAttachFile').files[0] || null;
  const errEl       = document.getElementById('newPqrError');

  if (!subject) {
    errEl.textContent = 'El asunto es obligatorio.';
    errEl.classList.add('show'); return;
  }
  if (!description) {
    errEl.textContent = 'La descripción es obligatoria.';
    errEl.classList.add('show'); return;
  }
  if (attachFile && attachFile.size > 10 * 1024 * 1024) {
    errEl.textContent = 'El anexo supera el límite de 10 MB.';
    errEl.classList.add('show'); return;
  }

  const btn = document.getElementById('submitNewPqrBtn');
  btn.textContent = 'Enviando…'; btn.disabled = true;
  errEl.classList.remove('show');

  // 1. Insertar PQRS para obtener el ID
  const { data: newPqr, error } = await sb.from('pqrs').insert({
    client_id:     currentProfile.id,
    commercial_id: currentProfile.assigned_commercial_id || null,
    type,
    subject,
    description
  }).select('id').single();

  if (error) {
    errEl.textContent = 'Error al enviar: ' + error.message;
    errEl.classList.add('show');
    btn.textContent = 'Enviar PQRS'; btn.disabled = false;
    return;
  }

  // 2. Si hay anexo, subirlo y guardar la ruta
  if (attachFile) {
    const safeName = attachFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = newPqr.id + '/attachment_' + Date.now() + '_' + safeName;
    const { error: upErr } = await sb.storage.from('pqrs-support').upload(path, attachFile);
    if (!upErr) {
      await sb.from('pqrs').update({ attachment_path: path }).eq('id', newPqr.id);
    }
  }

  document.getElementById('newPqrBackdrop').classList.remove('open');
  btn.textContent = 'Enviar PQRS'; btn.disabled = false;
  showSuccess('PQRS enviada correctamente. Tu comercial la revisará pronto.');
  await loadPqrs();
};

// ==========================================
// ALERTAS
// ==========================================
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
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
