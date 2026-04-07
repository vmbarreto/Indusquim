/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/archivos.js
 * Objetivo: Gestión de archivos PDF y videos (carga via modal, listado y eliminar).
 *           Categorías: Informes de visita | Capacitaciones (PDF + Video)
 * =========================================================================
 */

let allClients       = [];  // Todos los clientes
let allCommercials   = [];  // Todos los comerciales
let allInformes      = [];  // Documentos tipo 'report'
let allSoporte       = [];  // Documentos tipo 'support'
let allPresentaciones = []; // Documentos tipo 'presentation'
let currentIsCommercial = false;
let openArchGroupId  = null;

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// -------------------------------------------------------------------------
// 1. INICIALIZACIÓN
// -------------------------------------------------------------------------
(async () => {
  const profile = await requireAdminOrCommercial();
  if (!profile) return;

  await initNotifications(profile.id);
  showAdminOnlyContent(profile);

  const isCommercial = profile.role === 'commercial';
  currentIsCommercial = isCommercial;

  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    if (isCommercial) roleEl.style.color = '#c084fc';
  }



  document.getElementById('logoutBtn').onclick = () => logout();
  initAudit(profile);

  // Cargar clientes para el selector del modal
  // Comercial: solo sus clientes asignados (sin opción General)
  // Admin: todos los clientes + opción General
  // Cargar comerciales (para nombres en el acordeón admin)
  if (!isCommercial) {
    const { data: comms } = await sb.from('profiles')
      .select('id, full_name').eq('role', 'commercial').order('full_name', { ascending: true });
    allCommercials = comms || [];
  }

  let clientQuery = sb.from('profiles')
    .select('id, company_name, full_name, client_type, assigned_commercial_id')
    .eq('role', 'client')
    .order('company_name', { ascending: true });

  if (isCommercial) {
    clientQuery = clientQuery.eq('assigned_commercial_id', profile.id);
  }

  const { data } = await clientQuery;
  allClients = data || [];

  const sel = document.getElementById('uploadClient');

  // Guardar en el selector si es comercial, para usarlo al cambiar categoría
  sel.dataset.commercial = isCommercial ? 'true' : 'false';

  if (isCommercial) {
    // Quitar la opción "General" — comerciales deben asignar siempre a un cliente
    const generalOpt = sel.querySelector('option[value=""]');
    if (generalOpt) generalOpt.remove();
    sel.required = true;
    const lbl  = document.getElementById('uploadClientLabel');
    const hint = document.getElementById('uploadClientHint');
    if (lbl)  lbl.innerHTML  = 'Cliente <span style="color:var(--c-brand)">*</span>';
    if (hint) hint.textContent = 'Selecciona el cliente al que pertenece este archivo.';
  }

  allClients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.company_name || c.full_name || 'Sin nombre';
    sel.appendChild(opt);
  });

  await loadInformes();
  await loadSoporte();
  await loadPresentaciones();
  await loadVideos();
})();

// -------------------------------------------------------------------------
// 2. TABS
// -------------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// -------------------------------------------------------------------------
// 3. MODAL DE SUBIDA
// -------------------------------------------------------------------------
const uploadBackdrop = document.getElementById('uploadModalBackdrop');

document.getElementById('openUploadModal').onclick  = () => {
  hideModalError();
  document.getElementById('uploadForm').reset();
  resetDropArea();
  // Disparar la lógica del selector de categoría para que aplique el filtro correcto
  document.getElementById('uploadCategory').dispatchEvent(new Event('change'));
  uploadBackdrop.classList.add('open');
};
document.getElementById('closeUploadModal').onclick  = () => uploadBackdrop.classList.remove('open');
document.getElementById('cancelUploadModal').onclick = () => uploadBackdrop.classList.remove('open');

// Adaptar formulario según categoría elegida
document.getElementById('uploadCategory').addEventListener('change', () => {
  const cat = document.getElementById('uploadCategory').value;
  const isVideo   = cat === 'video';
  const isInforme = cat === 'report';

  document.getElementById('uploadDescGroup').style.display = isVideo ? 'block' : 'none';

  // Cambiar el tipo de archivo aceptado y el hint
  const fileInput = document.getElementById('uploadFile');
  const hint = document.getElementById('uploadFileHint');
  if (isVideo) {
    fileInput.accept = 'video/*';
    hint.textContent = 'MP4, MOV — Máximo 500 MB';
    document.querySelector('#uploadDropArea .upload-area__icon').textContent = '🎥';
  } else {
    fileInput.accept = '.pdf';
    hint.textContent = 'PDF — Máximo 50 MB';
    document.querySelector('#uploadDropArea .upload-area__icon').textContent = '📄';
  }

  // Informes de visita: solo clientes grandes, campo obligatorio
  const sel  = document.getElementById('uploadClient');
  const lbl  = document.getElementById('uploadClientLabel');
  const hint2 = document.getElementById('uploadClientHint');
  // Reconstruir opciones del selector según la categoría
  while (sel.options.length > 0) sel.remove(0);
  if (isInforme) {
    // Sin opción "General" — siempre asignado a un cliente grande
    sel.required = true;
    if (lbl)  lbl.innerHTML  = 'Cliente grande <span style="color:var(--c-brand)">*</span>';
    if (hint2) hint2.textContent = 'Los informes de visita son exclusivos para clientes grandes.';
    allClients.filter(c => c.client_type === 'large').forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.company_name || c.full_name || 'Sin nombre';
      sel.appendChild(opt);
    });
  } else {
    // Restaurar selector normal
    const isCommercial = document.getElementById('uploadClient').dataset.commercial === 'true';
    if (!isCommercial) {
      const generalOpt = document.createElement('option');
      generalOpt.value = '';
      generalOpt.textContent = '— General (visible para todos) —';
      sel.appendChild(generalOpt);
      sel.required = false;
      if (lbl)  lbl.innerHTML  = 'Asignar a cliente';
      if (hint2) hint2.textContent = 'Deja en blanco para que sea visible para todos los clientes.';
    } else {
      sel.required = true;
      if (lbl)  lbl.innerHTML  = 'Cliente <span style="color:var(--c-brand)">*</span>';
      if (hint2) hint2.textContent = 'Selecciona el cliente al que pertenece este archivo.';
    }
    allClients.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.company_name || c.full_name || 'Sin nombre';
      sel.appendChild(opt);
    });
  }

  // Resetear archivo seleccionado al cambiar categoría
  fileInput.value = '';
  resetDropArea();
  hideModalError();
});

// Drag & Drop del modal
const dropArea = document.getElementById('uploadDropArea');
dropArea.onclick = () => document.getElementById('uploadFile').click();

document.getElementById('uploadFile').onchange = (e) => {
  const file = e.target.files[0];
  if (file) {
    const size = (file.size / 1024 / 1024).toFixed(1);
    dropArea.innerHTML = '<div class="upload-area__icon">✅</div>'
      + '<p><strong>' + file.name + '</strong></p>'
      + '<p style="color:var(--c-muted)">' + size + ' MB listo para subir</p>';
    dropArea.onclick = () => document.getElementById('uploadFile').click();
  } else {
    resetDropArea();
  }
};

function resetDropArea() {
  const cat = document.getElementById('uploadCategory').value;
  const isVideo = cat === 'video';
  dropArea.innerHTML = '<div class="upload-area__icon">' + (isVideo ? '🎥' : '📄') + '</div>'
    + '<p><strong>Haz clic o arrastra</strong> el archivo aquí</p>'
    + '<p style="color:var(--c-muted);font-size:0.8rem;" id="uploadFileHint">'
    + (isVideo ? 'MP4, MOV — Máximo 500 MB' : 'PDF — Máximo 50 MB') + '</p>';
  dropArea.onclick = () => document.getElementById('uploadFile').click();
}

// -------------------------------------------------------------------------
// 4. SUBMIT: SUBIR ARCHIVO
// -------------------------------------------------------------------------
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideModalError();

  const file     = document.getElementById('uploadFile').files[0];
  const category = document.getElementById('uploadCategory').value;
  const title    = document.getElementById('uploadTitle').value.trim();
  const desc     = document.getElementById('uploadDesc').value.trim();
  const clientId = document.getElementById('uploadClient').value || null;

  if (!file) {
    showModalError('Debes seleccionar un archivo antes de subir.');
    return;
  }
  if (!title) {
    showModalError('El título es obligatorio.');
    return;
  }

  const btn = document.getElementById('uploadSubmit');
  const bar = document.getElementById('uploadProgressBar');
  btn.textContent = 'Subiendo…'; btn.disabled = true;
  document.getElementById('uploadProgress').style.display = 'block';
  bar.classList.add('progress-bar--active');

  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = (clientId || 'general') + '/' + Date.now() + '_' + safeName;

  try {
    if (category === 'video') {
      // Subir a bucket 'videos'
      const { error: upErr } = await sb.storage.from('videos').upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await sb.from('videos').insert({ title, description: desc, file_path: path, client_id: clientId });
      if (dbErr) throw dbErr;
      const clientName = clientId ? (allClients.find(c => c.id === clientId)?.company_name || clientId) : 'General';
      await logAudit('Video subido', title + ' → ' + clientName);
    } else {
      // Subir a 'client-files' o 'general-files'
      const bucket = clientId ? 'client-files' : 'general-files';
      const { error: upErr } = await sb.storage.from(bucket).upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await sb.from('documents').insert({ title, type: category, file_path: path, client_id: clientId });
      if (dbErr) throw dbErr;
      const clientName = clientId ? (allClients.find(c => c.id === clientId)?.company_name || clientId) : 'General';
      const typeLabel = category === 'report' ? 'Informe de visita subido'
                     : category === 'support' ? 'Documento soporte subido' : 'Presentación subida';
      await logAudit(typeLabel, title + ' → ' + clientName);
    }

    bar.classList.remove('progress-bar--active');
    bar.style.width = '100%';
    setTimeout(() => { document.getElementById('uploadProgress').style.display = 'none'; bar.style.width = '0%'; }, 700);

    uploadBackdrop.classList.remove('open');
    document.getElementById('uploadForm').reset();
    resetDropArea();

    showSuccess('Archivo subido correctamente.');

    // Recargar la lista correspondiente
    if (category === 'report') await loadInformes();
    else if (category === 'support') await loadSoporte();
    else if (category === 'presentation') await loadPresentaciones();
    else await loadVideos();

  } catch (err) {
    bar.classList.remove('progress-bar--active');
    document.getElementById('uploadProgress').style.display = 'none';
    showModalError('Error al subir: ' + (err.message || 'Error desconocido'));
  }

  btn.textContent = 'Subir archivo'; btn.disabled = false;
});

// -------------------------------------------------------------------------
// 5. CARGAR Y RENDERIZAR LISTAS
// -------------------------------------------------------------------------

async function loadInformes() {
  const { data, error } = await sb.from('documents')
    .select('*').eq('type', 'report').order('created_at', { ascending: false });
  if (error) {
    document.getElementById('informesList').innerHTML =
      '<p style="color:var(--c-danger);font-size:0.875rem;">Error al cargar: ' + error.message + '</p>';
    return;
  }
  allInformes = data || [];
  renderInformes(allInformes);
}

function renderInformes(docs) {
  if (currentIsCommercial) {
    renderInformesComercial(docs);
  } else {
    renderInformesAdmin(docs);
  }
}

// ── Acordeón Admin: Comercial → Cliente → Informe ──────────────────────────
function renderInformesAdmin(docs) {
  const list = document.getElementById('informesList');
  if (!docs.length) {
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin informes de visita aún.</p>';
    return;
  }

  // Agrupar por comercial → cliente
  const map = {};
  docs.forEach(d => {
    const client  = allClients.find(c => c.id === d.client_id);
    const commId  = client?.assigned_commercial_id || '__none__';
    const commName = allCommercials.find(c => c.id === commId)?.full_name || 'Sin comercial';
    if (!map[commId]) map[commId] = { name: commName, clients: {} };
    const clientId   = d.client_id || '__none__';
    const clientName = client?.company_name || client?.full_name || 'Cliente';
    if (!map[commId].clients[clientId]) map[commId].clients[clientId] = { name: clientName, docs: [] };
    map[commId].clients[clientId].docs.push(d);
  });

  list.innerHTML = Object.entries(map).map(([commId, comm]) => {
    const totalDocs = Object.values(comm.clients).reduce((s, c) => s + c.docs.length, 0);

    const clientsHtml = Object.entries(comm.clients).map(([clientId, client]) => {
      const subId = 'ai-sub-' + commId + '-' + clientId;
      return '<div style="border-bottom:1px solid var(--c-border);">'
        + '<div onclick="toggleArchSubGroup(\'' + subId + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px 10px 32px;cursor:pointer;gap:12px;" onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:0.85rem;font-weight:600;">' + escHtml(client.name) + '</div>'
        + '<div style="font-size:0.73rem;color:var(--c-muted);margin-top:1px;">' + client.docs.length + ' informe' + (client.docs.length !== 1 ? 's' : '') + '</div>'
        + '</div>'
        + '<svg id="arch-sub-chev-' + subId + '" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;color:var(--c-muted);"><polyline points="6 9 12 15 18 9"/></svg>'
        + '</div>'
        + '<div id="arch-sub-body-' + subId + '" style="display:none;">'
        + client.docs.map(d => informeRowHTML(d)).join('')
        + '</div></div>';
    }).join('');

    return '<div class="order-card" style="margin-bottom:12px;">'
      + '<div class="order-card__header" onclick="toggleArchGroup(\'' + commId + '\')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + escHtml(comm.name) + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + Object.keys(comm.clients).length + ' empresa' + (Object.keys(comm.clients).length !== 1 ? 's' : '')
      + ' · ' + totalDocs + ' informe' + (totalDocs !== 1 ? 's' : '')
      + '</div></div>'
      + '<svg id="arch-grp-chev-' + commId + '" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div id="arch-grp-body-' + commId + '" style="display:none;border-top:1px solid var(--c-border);">' + clientsHtml + '</div>'
      + '</div>';
  }).join('');
}

// ── Acordeón Comercial: Cliente → Informe ─────────────────────────────────
function renderInformesComercial(docs) {
  const list = document.getElementById('informesList');
  if (!docs.length) {
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin informes de visita aún.</p>';
    return;
  }

  // Agrupar por cliente
  const map = {};
  docs.forEach(d => {
    const client     = allClients.find(c => c.id === d.client_id);
    const clientId   = d.client_id || '__none__';
    const clientName = client?.company_name || client?.full_name || 'Cliente';
    if (!map[clientId]) map[clientId] = { name: clientName, docs: [] };
    map[clientId].docs.push(d);
  });

  list.innerHTML = Object.entries(map).map(([clientId, client]) => {
    return '<div class="order-card" style="margin-bottom:12px;">'
      + '<div class="order-card__header" onclick="toggleArchGroup(\'' + clientId + '\')">'
      + '<div>'
      + '<div style="font-weight:700;font-size:0.9rem;">' + escHtml(client.name) + '</div>'
      + '<div style="font-size:0.78rem;color:var(--c-muted);margin-top:2px;">'
      + client.docs.length + ' informe' + (client.docs.length !== 1 ? 's' : '')
      + '</div></div>'
      + '<svg id="arch-grp-chev-' + clientId + '" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>'
      + '</div>'
      + '<div id="arch-grp-body-' + clientId + '" style="display:none;border-top:1px solid var(--c-border);">'
      + client.docs.map(d => informeRowHTML(d)).join('')
      + '</div></div>';
  }).join('');
}

// ── Fila individual de informe ─────────────────────────────────────────────
function informeRowHTML(d) {
  const bucket = d.client_id ? 'client-files' : 'general-files';
  const fecha  = new Date(d.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  return '<div class="file-item" style="padding-left:40px;">'
    + '<div class="file-item__icon">📄</div>'
    + '<div class="file-item__info">'
    + '<div class="file-item__name">' + escHtml(d.title) + '</div>'
    + '<div class="file-item__meta">' + fecha + '</div>'
    + '</div>'
    + '<div class="file-item__actions">'
    + '<button class="btn btn--ghost btn--sm" onclick="downloadFile(\'' + d.file_path + '\',\'' + bucket + '\')">Descargar</button>'
    + '<button class="btn btn--danger btn--sm" onclick="deleteDoc(\'' + d.id + '\',\'' + d.file_path + '\',\'' + bucket + '\')">Eliminar</button>'
    + '</div></div>';
}

// ── Controles del acordeón ─────────────────────────────────────────────────
window.toggleArchGroup = function(id) {
  if (openArchGroupId && openArchGroupId !== id) {
    const prev  = document.getElementById('arch-grp-body-' + openArchGroupId);
    const prevC = document.getElementById('arch-grp-chev-' + openArchGroupId);
    if (prev)  prev.style.display   = 'none';
    if (prevC) prevC.style.transform = '';
  }
  const body    = document.getElementById('arch-grp-body-' + id);
  const chevron = document.getElementById('arch-grp-chev-' + id);
  if (!body) return;
  const isOpen       = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  openArchGroupId = isOpen ? null : id;
};

window.toggleArchSubGroup = function(subId) {
  const body    = document.getElementById('arch-sub-body-' + subId);
  const chevron = document.getElementById('arch-sub-chev-' + subId);
  if (!body) return;
  const isOpen       = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
};

async function loadSoporte() {
  const { data } = await sb.from('documents')
    .select('*').eq('type', 'support').order('created_at', { ascending: false });
  allSoporte = data || [];
  renderSoporte(allSoporte);
}

async function loadPresentaciones() {
  const { data } = await sb.from('documents')
    .select('*').eq('type', 'presentation').order('created_at', { ascending: false });
  allPresentaciones = data || [];
  renderPresentaciones(allPresentaciones);
}

function getClientName(clientId) {
  if (!clientId) return '<em>General</em>';
  const c = allClients.find(c => c.id === clientId);
  return c ? '<strong>' + (c.company_name || c.full_name) + '</strong>' : '<em>General</em>';
}

function renderSoporte(docs) {
  const list = document.getElementById('soporteList');
  if (!docs.length) {
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin documentos de soporte aún.</p>';
    return;
  }
  list.innerHTML = docs.map(d => fileItemHTML(d, d.client_id ? 'client-files' : 'general-files')).join('');
}

function renderPresentaciones(docs) {
  const list = document.getElementById('presentacionesList');
  if (!docs.length) {
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin presentaciones aún.</p>';
    return;
  }
  list.innerHTML = docs.map(d => fileItemHTML(d, d.client_id ? 'client-files' : 'general-files')).join('');
}

function fileItemHTML(d, bucket) {
  return '<div class="file-item">'
    + '<div class="file-item__icon">📄</div>'
    + '<div class="file-item__info">'
    + '<div class="file-item__name">' + d.title + '</div>'
    + '<div class="file-item__meta">' + getClientName(d.client_id) + ' · ' + new Date(d.created_at).toLocaleDateString('es-CO') + '</div>'
    + '</div>'
    + '<div class="file-item__actions">'
    + '<button class="btn btn--ghost btn--sm" onclick="downloadFile(\'' + d.file_path + '\', \'' + bucket + '\')">Descargar</button>'
    + '<button class="btn btn--danger btn--sm" onclick="deleteDoc(\'' + d.id + '\', \'' + d.file_path + '\', \'' + bucket + '\')">Eliminar</button>'
    + '</div>'
    + '</div>';
}

async function loadVideos() {
  const { data } = await sb.from('videos').select('*').order('created_at', { ascending: false });
  const list = document.getElementById('videoList');
  if (!data || !data.length) {
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin videos aún.</p>';
    return;
  }
  const signedUrls = await Promise.all(
    data.map(v => sb.storage.from('videos').createSignedUrl(v.file_path, 3600))
  );
  list.innerHTML = data.map((v, i) => {
    const videoUrl = signedUrls[i].data?.signedUrl || '';
    return '<div class="video-card">'
      + '<video controls src="' + videoUrl + '" preload="metadata"></video>'
      + '<div class="video-card__body">'
      + '<h3 class="video-card__title">' + v.title + '</h3>'
      + '<p class="video-card__desc">' + (v.description || 'Sin descripción') + '</p>'
      + '<p style="font-size:0.75rem;color:var(--c-muted);margin-top:8px;">'
      + getClientName(v.client_id) + ' · ' + new Date(v.created_at).toLocaleDateString('es-CO')
      + '</p>'
      + '<button class="btn btn--danger btn--sm" style="margin-top:12px;width:100%" onclick="deleteVideo(\'' + v.id + '\', \'' + v.file_path + '\')">Eliminar</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

// -------------------------------------------------------------------------
// 6. BÚSQUEDAS EN TIEMPO REAL
// -------------------------------------------------------------------------
document.getElementById('informesSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderInformes(allInformes.filter(d => d.title.toLowerCase().includes(q)));
});

document.getElementById('soporteSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderSoporte(allSoporte.filter(d => d.title.toLowerCase().includes(q)));
});

document.getElementById('presentacionesSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderPresentaciones(allPresentaciones.filter(d => d.title.toLowerCase().includes(q)));
});

// -------------------------------------------------------------------------
// 7. ACCIONES GLOBALES (DESCARGAR / ELIMINAR)
// -------------------------------------------------------------------------
window.downloadFile = async function(path, bucket) {
  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 60);
  if (data) {
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

window.deleteDoc = async function(id, path, bucket) {
  if (!confirm('¿Eliminar este documento?')) return;
  const doc = [...allInformes, ...allSoporte, ...allPresentaciones].find(d => d.id === id);
  await sb.storage.from(bucket).remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await logAudit('Documento eliminado', doc?.title || path.split('/').pop());
  await loadInformes();
  await loadSoporte();
  await loadPresentaciones();
  showSuccess('Documento eliminado.');
};

window.deleteVideo = async function(id, path) {
  if (!confirm('¿Eliminar este video?')) return;
  await sb.storage.from('videos').remove([path]);
  await sb.from('videos').delete().eq('id', id);
  await logAudit('Video eliminado', path.split('/').pop());
  await loadVideos();
  showSuccess('Video eliminado.');
};

// -------------------------------------------------------------------------
// 8. ALERTAS
// -------------------------------------------------------------------------
function showModalError(msg) {
  const el = document.getElementById('uploadModalError');
  el.textContent = msg;
  el.classList.add('show');
}

function hideModalError() {
  const el = document.getElementById('uploadModalError');
  if (el) el.classList.remove('show');
}

function showSuccess(msg) {
  const el = document.getElementById('successMsg');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 6000);
}

// -------------------------------------------------------------------------
// 9. MENÚ MÓVIL
// -------------------------------------------------------------------------
const hbg     = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');

function toggleSidebar() {
  sidebar.classList.toggle('open');
  hbg.classList.toggle('open');
  overlay.classList.toggle('show');
}
hbg.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);
