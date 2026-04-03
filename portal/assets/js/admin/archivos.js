/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/archivos.js
 * Objetivo: Gesti\u00f3n de archivos PDF y videos (carga, listado y eliminar).
 *           L\u00f3gica para asignar archivos a clientes grandes o peque\u00f1os.
 * =========================================================================
 */

// Variables globales para mantener informaci\u00f3n que usaremos en m\u00faltiples funciones
let largeClients = [];
let allDocs = [];

// -------------------------------------------------------------------------
// 1. INICIALIZACI\u00d3N AL CARGAR LA P\u00c1GINA
// -------------------------------------------------------------------------
(async () => {
  // Verificamos tener la sesi\u00f3n del admin, sino se redirige autom\u00e1ticamente
  const profile = await requireAdminOrCommercial();
  if (!profile) return;

  const isCommercial = profile.role === 'commercial';

  // Nombre en sidebar
  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  // Badge de rol
  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    if (isCommercial) roleEl.style.color = '#c084fc';
  }

  // Ocultar opciones del sidebar no permitidas para comerciales
  if (isCommercial) {
    const linkUsuarios = document.querySelector('.sidebar__nav a[href="usuarios.html"]');
    if (linkUsuarios) linkUsuarios.style.display = 'none';

    const linkCatalogo = document.querySelector('.sidebar__nav a[href="catalogo.html"]');
    if (linkCatalogo) linkCatalogo.style.display = 'none';

    // Mostrar el banner informativo con instrucciones para el comercial
    // Este banner le explica para qué sirve esta sección y cómo usarla
    const banner = document.getElementById('commercialBanner');
    if (banner) banner.style.display = 'block';
  }

  
  // '.onclick' es otra forma v\u00e1lida de hacer 'addEventListener("click")'
  document.getElementById('logoutBtn').onclick = () => logout();

  // Cargamos los clientes VIP ("large") desde Supabase para luego agregarlos 
  // a los selectores (los men\u00fas desplegables de "¿Para qui\u00e9n es este archivo?")
  const { data } = await sb.from('profiles')
    .select('id, company_name, full_name')
    .eq('role', 'client').eq('client_type', 'large');
    
  largeClients = data || [];
  
  largeClients.forEach(c => {
    // Generamos las opciones del selector
    const opt = `<option value="${c.id}">${c.company_name || c.full_name}</option>`;
    document.getElementById('docClient').innerHTML   += opt;
    document.getElementById('videoClient').innerHTML += opt;
  });

  // Finalmente traemos la lista de archivos que ya est\u00e1n subidos
  await loadDocs();
  await loadVideos();
})();

// -------------------------------------------------------------------------
// 2. L\u00d3GICA DE INTERFAZ: PESTA\u00d1AS (TABS)
// -------------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Removemos la clase "active" de todas las pesta\u00f1as
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    // Le a\u00f1adimos la clase "active" solo a la que tocamos
    btn.classList.add('active');
    // Mostramos el contenido interno apuntando al data-tab de esa pesta\u00f1a
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// -------------------------------------------------------------------------
// 3. OMNIPRESENCIA INTELIGENTE DEL SELECTOR DE TIPO
// -------------------------------------------------------------------------
const docTypeEl   = document.getElementById('docType');
const docClientEl = document.getElementById('docClient');

// Si elegimos tipo de documento "General", deshabilitamos el selector de clientes
docTypeEl.addEventListener('change', () => {
  if (docTypeEl.value === 'general_doc') {
    docClientEl.value = '';
    docClientEl.disabled = true;
  } else {
    docClientEl.disabled = false;
  }
});

// Y al rev\u00e9s, si indicamos un cliente espec\u00edfico, evitamos subir como "General"
docClientEl.addEventListener('change', () => {
  if (docClientEl.value !== '') {
    if (docTypeEl.value === 'general_doc') docTypeEl.value = 'report';
    docTypeEl.querySelector('option[value="general_doc"]').disabled = true;
  } else {
    docTypeEl.querySelector('option[value="general_doc"]').disabled = false;
  }
});

// -------------------------------------------------------------------------
// 4. \u00c1REAS DE "DRAG & DROP" (ARRASTRAR O HACER CLIC)
// Esto hace que subir archivos use la zona punteada bonita 
// -------------------------------------------------------------------------
['doc','video'].forEach(prefix => {
  const area = document.getElementById(`${prefix}DropArea`);
  area.dataset.original = area.innerHTML; // Guardamos c\u00f3mo era originalmente para restablacer
  
  // Al hacer clic en el \u00e1rea gris gigante, en realidad simulamos presionar el input original oculto
  area.onclick = () => document.getElementById(`${prefix}File`).click();
  
  document.getElementById(`${prefix}File`).onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const size = (file.size / 1024 / 1024).toFixed(1); // Convertirmos bytes a MB
      area.innerHTML = `<div class="upload-area__icon">\u2705</div><p><strong>${file.name}</strong></p><p style="color:var(--c-muted)">${size} MB listo para subir</p>`;
    } else {
      area.innerHTML = area.dataset.original;
    }
    // Nos aseguramos que la funci\u00f3n click se conserve aunque cambiemos el HTML
    area.onclick = () => document.getElementById(`${prefix}File`).click();
  };
});

// -------------------------------------------------------------------------
// 5. SUBIR DOCUMENTOS PDF AL SERVIDOR (STORAGE)
// -------------------------------------------------------------------------
document.getElementById('docForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const file     = document.getElementById('docFile').files[0];
  const title    = document.getElementById('docTitle').value.trim();
  const type     = document.getElementById('docType').value;
  const clientId = document.getElementById('docClient').value || null; // Null si es para todos
  if (!file) return;

  const btn = document.getElementById('docSubmit');
  const bar = document.getElementById('docProgressBar');
  btn.textContent = 'Subiendo\u2026'; btn.disabled = true;
  document.getElementById('docProgress').style.display = 'block';
  bar.classList.add('progress-bar--active');

  // Limpiamos el nombre original del archivo eliminando tildes y s\u00edmbolos raros para evitar errores al guardar
  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Armamos la ruta tipo "carpetaCliente/123443_nombrefile.pdf"
  const path = `${clientId || 'general'}/${Date.now()}_${safeName}`;
  const bucket = clientId ? 'client-files' : 'general-files';

  // Subimos el archivo a Supabase Storage
  const { error: upErr } = await sb.storage.from(bucket).upload(path, file);
  bar.classList.remove('progress-bar--active');
  
  if (upErr) { 
    showError(upErr.message); 
    document.getElementById('docProgress').style.display = 'none'; 
    btn.textContent = 'Subir documento'; btn.disabled = false; 
    return; 
  }

  // Ahora indicamos a la base de datos SQL el registro del documento y a qui\u00e9n pertenece
  await sb.from('documents').insert({ title, type, file_path: path, client_id: clientId });
  bar.style.width = '100%'; // Simulaci\u00f3n de final
  
  // Un retraso visual antes de esconder la barra
  setTimeout(() => { document.getElementById('docProgress').style.display = 'none'; bar.style.width = '0%'; }, 700);
  
  showSuccess('Documento subido correctamente.');
  document.getElementById('docForm').reset();
  
  // Reiniciar dise\u00f1o del Drag and Drop
  const da = document.getElementById('docDropArea');
  da.innerHTML = da.dataset.original; 
  da.onclick = () => document.getElementById('docFile').click();
  
  await loadDocs(); // Recargamos para ver el recien a\u00f1adido!
  btn.textContent = 'Subir documento'; btn.disabled = false;
});

// -------------------------------------------------------------------------
// 6. SUBIR VIDEOS (L\u00f3gica similar a la del documento)
// -------------------------------------------------------------------------
document.getElementById('videoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file     = document.getElementById('videoFile').files[0];
  const title    = document.getElementById('videoTitle').value.trim();
  const desc     = document.getElementById('videoDesc').value.trim();
  const clientId = document.getElementById('videoClient').value || null;
  if (!file) return;

  const btn = document.getElementById('videoSubmit');
  const bar = document.getElementById('videoProgressBar');
  btn.textContent = 'Subiendo\u2026'; btn.disabled = true;
  document.getElementById('videoProgress').style.display = 'block';
  bar.classList.add('progress-bar--active');

  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${clientId || 'general'}/${Date.now()}_${safeName}`;
  const { error: upErr } = await sb.storage.from('videos').upload(path, file);
  
  bar.classList.remove('progress-bar--active');
  
  if (upErr) { 
    showError(upErr.message); 
    document.getElementById('videoProgress').style.display = 'none'; 
    btn.textContent = 'Subir video'; btn.disabled = false; 
    return; 
  }

  await sb.from('videos').insert({ title, description: desc, file_path: path, client_id: clientId });
  bar.style.width = '100%';
  setTimeout(() => { document.getElementById('videoProgress').style.display = 'none'; bar.style.width = '0%'; }, 700);
  
  showSuccess('Video subido correctamente.');
  document.getElementById('videoForm').reset();
  const va = document.getElementById('videoDropArea');
  va.innerHTML = va.dataset.original; 
  va.onclick = () => document.getElementById('videoFile').click();
  
  await loadVideos();
  btn.textContent = 'Subir video'; btn.disabled = false;
});

// -------------------------------------------------------------------------
// 7. CONSULTAR BASES Y CREAR TABLAS HTML EN TIEMPO REAL
// -------------------------------------------------------------------------

async function loadDocs() {
  const { data } = await sb.from('documents').select('*').order('created_at', { ascending: false });
  allDocs = data || [];
  renderDocs(allDocs);
}

// Funci\u00f3n para 'Pintar' Documentos en la lista
function renderDocs(docs) {
  const list = document.getElementById('docList');
  if (!docs.length) { 
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin documentos a\u00fan.</p>'; 
    return; 
  }
  
  // .map() nos permite transcribir nuestra info en c\u00f3digo HTML masivo
  list.innerHTML = docs.map(d => {
    // Si est\u00e1 asociado a un cliente VIP buscamos el nombre, si no ser\u00e1 General
    const client = largeClients.find(c => c.id === d.client_id);
    const tag = client ? `<strong>${client.company_name || client.full_name}</strong>` : '<em>General</em>';
    const typeLabel = { report: 'Informe', presentation: 'Presentaci\u00f3n', general_doc: 'Doc. general' }[d.type] || d.type;
    
    // Y devolvemos el dise\u00f1o de Item directamente inyectado
    return `<div class="file-item">
      <div class="file-item__icon">\ud83d\udcc4</div>
      <div class="file-item__info">
        <div class="file-item__name">${d.title}</div>
        <div class="file-item__meta">${typeLabel} \u00b7 ${tag} \u00b7 ${new Date(d.created_at).toLocaleDateString('es-CO')}</div>
      </div>
      <div class="file-item__actions">
        <!-- Estos eventos llaman funciones locales con par\u00e1metros espec\u00edficos de ESTE archivo -->
        <button class="btn btn--ghost btn--sm" onclick="downloadFile('${d.file_path}', '${d.client_id ? 'client-files' : 'general-files'}')">Descargar</button>
        <button class="btn btn--danger btn--sm" onclick="deleteDoc('${d.id}', '${d.file_path}', '${d.client_id ? 'client-files' : 'general-files'}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

// B\u00fasqueda simple en tiempo real (evento del input superior)
document.getElementById('docSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderDocs(allDocs.filter(d => d.title.toLowerCase().includes(q)));
});

async function loadVideos() {
  const { data } = await sb.from('videos').select('*').order('created_at', { ascending: false });
  const list = document.getElementById('videoList');
  if (!data || !data.length) { 
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin videos a\u00fan.</p>'; 
    return; 
  }
  list.innerHTML = data.map(v => {
    const client = largeClients.find(c => c.id === v.client_id);
    const tag = client ? `<strong>${client.company_name || client.full_name}</strong>` : '<em>General</em>';
    
    // Obtenemos la URL pública generada de Supabase
    const videoUrl = sb.storage.from('videos').getPublicUrl(v.file_path).data.publicUrl;

    return `<div class="video-card">
      <video controls src="${videoUrl}" preload="metadata"></video>
      <div class="video-card__body">
        <h3 class="video-card__title">${v.title}</h3>
        <p class="video-card__desc">${v.description || 'Sin descripción'}</p>
        <p style="font-size:0.75rem; color:var(--c-muted); margin-top:8px;">
          ${tag} · ${new Date(v.created_at).toLocaleDateString('es-CO')}
        </p>
        <button class="btn btn--danger btn--sm" style="margin-top:12px; width:100%" onclick="deleteVideo('${v.id}', '${v.file_path}')">
          Eliminar Video
        </button>
      </div>
    </div>`;
  }).join('');
}

// -------------------------------------------------------------------------
// 8. ACCIONES DE DESCARGAR Y ELIMINAR (Globales)
// -------------------------------------------------------------------------

/* Nota que esta funci\u00f3n debe ser 'global' para que los 'onclick' autogenerados del HTML la vean */
window.downloadFile = async function(path, bucket) {
  // Solicitamos a supabase acceso temporal
  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 60);
  if (data) {
    // Para forzar la descarga en el navegador, hacemos un enlace falso
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click(); // Lo clicamos
    document.body.removeChild(a); // Y escondemos el v\u00eddeo de la escena del crimen
  }
}

window.deleteDoc = async function(id, path, bucket) {
  if (!confirm('\u00bfEliminar este documento?')) return;
  // Borramos el recurso en la nube
  await sb.storage.from(bucket).remove([path]);
  // Borramos la fila de la base de datos SQL
  await sb.from('documents').delete().eq('id', id);
  // Recargamos el muro
  await loadDocs();
  showSuccess('Documento eliminado.');
}

window.deleteVideo = async function(id, path) {
  if (!confirm('\u00bfEliminar este video?')) return;
  await sb.storage.from('videos').remove([path]);
  await sb.from('videos').delete().eq('id', id);
  await loadVideos();
  showSuccess('Video eliminado.');
}

// -------------------------------------------------------------------------
// 9. ALERTAS Y MEN\u00da MOVIL
// -------------------------------------------------------------------------
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

// Hamburger Toggle
const hbg = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');

function toggleSidebar() {
  sidebar.classList.toggle('open');
  hbg.classList.toggle('open');
  overlay.classList.toggle('show');
}
hbg.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);
