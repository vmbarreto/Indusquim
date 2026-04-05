/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/archivos.js
 * Objetivo: Gestión de archivos PDF y videos (carga via modal, listado y eliminar).
 *           Categorías: Informes de visita | Capacitaciones (PDF + Video)
 * =========================================================================
 */

let allClients  = [];  // Todos los clientes (large + small)
let allSoporte  = [];  // Documentos tipo 'support'
let allPresentaciones = []; // Documentos tipo 'presentation'

// -------------------------------------------------------------------------
// 1. INICIALIZACIÓN
// -------------------------------------------------------------------------
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
    const linkUsuarios = document.querySelector('.sidebar__nav a[href="usuarios.html"]');
    if (linkUsuarios) linkUsuarios.style.display = 'none';
    const linkCatalogo = document.querySelector('.sidebar__nav a[href="catalogo.html"]');
    if (linkCatalogo) linkCatalogo.style.display = 'none';
  }

  document.getElementById('logoutBtn').onclick = () => logout();
  initAudit(profile);

  // Cargar TODOS los clientes (large y small) para el selector del modal
  const { data } = await sb.from('profiles')
    .select('id, company_name, full_name')
    .eq('role', 'client')
    .order('company_name', { ascending: true });

  allClients = data || [];

  const sel = document.getElementById('uploadClient');
  allClients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.company_name || c.full_name || 'Sin nombre';
    sel.appendChild(opt);
  });

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
  uploadBackdrop.classList.add('open');
};
document.getElementById('closeUploadModal').onclick  = () => uploadBackdrop.classList.remove('open');
document.getElementById('cancelUploadModal').onclick = () => uploadBackdrop.classList.remove('open');

// Adaptar formulario según categoría elegida
document.getElementById('uploadCategory').addEventListener('change', () => {
  const cat = document.getElementById('uploadCategory').value;
  const isVideo = cat === 'video';
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
      const typeLabel  = category === 'support' ? 'Documento soporte subido' : 'Presentación subida';
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
    if (category === 'support') await loadSoporte();
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
  const doc = [...allSoporte, ...allPresentaciones].find(d => d.id === id);
  await sb.storage.from(bucket).remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await logAudit('Documento eliminado', doc?.title || path.split('/').pop());
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
