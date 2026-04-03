/**
 * =========================================================================
 * ARCHIVO: assets/js/cliente/grande.js
 * Objetivo: L\u00f3gica del Portal para Clientes "Grandes" (VIP).
 *           Pueden ver sus archivos propios + los archivos generales.
 * =========================================================================
 */

let allItems = []; // Aqu\u00ed guardaremos los documentos y videos temporalmente en memoria

// 1. Cargador Inicial
(async () => {
  // \u00bfQui\u00e9n nos visita? Usamos 'requireAuth' desde auth.js y si no hay sesi\u00f3n lo regresamos a login.
  const user = await requireAuth('../login.html');
  if (!user) return;

  // Verificamos qu\u00e9 tipo de perfil tiene. \u00a1Solo "large" clients pueden estar aqu\u00ed!
  const profile = await getProfile();
  if (!profile || profile.role !== 'client' || profile.client_type !== 'large') {
    // Si intenta colarse un cliente peque\u00f1o, pa' fuera
    window.location.href = '../login.html'; return;
  }

  // Personalizamos el panel con su nombre
  document.getElementById('clientName').textContent    = profile.full_name    || '\u2014';
  document.getElementById('clientCompany').textContent = profile.company_name || '\u2014';
  
  // Extraemos solo primer nombre o nombre compa\u00f1\u00eda para el texto tipo "Hola, Carlos"
  document.getElementById('welcomeName').textContent   = profile.full_name?.split(' ')[0] || profile.company_name || 'cliente';
  document.getElementById('logoutBtn').onclick = () => logout();

  // -----------------------------------------------------------------------
  // 2. SOLICITUD DE INFORMACI\u00d3N ESPEC\u00cdFICA
  // -----------------------------------------------------------------------

  // Le pedimos a BD: Dame los documentos donde client_id sea YO o donde client_id sea nulo (General)
  const { data: docs } = await sb.from('documents')
    .select('*')
    .or(`client_id.eq.${user.id},client_id.is.null`)
    .order('created_at', { ascending: false }); // Los m\u00e1s recientes primero

  // Hacemos lo mismo para videos de capacitaciones
  const { data: videos } = await sb.from('videos')
    .select('*')
    .or(`client_id.eq.${user.id},client_id.is.null`)
    .order('created_at', { ascending: false });

  // Guardamos todo en nuestra variable global 'allItems'
  allItems = { docs: docs || [], videos: videos || [] };
  
  // Y los pintamos en pantalla envi\u00e1ndolos a la funci\u00f3n generadora
  renderAll(allItems.docs, allItems.videos);
})();

// -------------------------------------------------------------------------
// 3. RENDERIZADO DE HTML INYECTADO
// -------------------------------------------------------------------------

/**
 * Funci\u00f3n Orquestadora.
 * Recibe lista total de docs y total videos y los distribuye a sus funciones.
 */
function renderAll(docs, videos) {
  // Filtramos por su 'type' interno de BD (report y presentation) para saber en d\u00f3nde se van a listar
  renderDocs('reports', docs.filter(d => d.type === 'report'));
  renderDocs('presentations', docs.filter(d => d.type === 'presentation'));
  renderVideos(videos);
}

/**
 * Funci\u00f3n de renderizado de Documentos (Reportes y Presentaciones PDF)
 * Recibe el ID ('reports' por ej.) y lo transforma a 'reportsList' en el DOM
 */
function renderDocs(listId, items) {
  const el = document.getElementById(listId + 'List');
  
  // Si no hay archivos, mostramos dise\u00f1o estado vac\u00edo "Empty State"
  if (!items.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg><p>No hay documentos disponibles a\u00fan.</p></div>`;
    return;
  }
  
  // Si s\u00ed hay, hacemos loop sobre "items" con map()
  el.innerHTML = items.map(d => `
    <div class="file-item">
      <div class="file-item__icon">\ud83d\udcc4</div>
      <div class="file-item__info">
        <div class="file-item__name">${d.title}</div>
        <div class="file-item__meta">${new Date(d.created_at).toLocaleDateString('es-CO')}</div>
      </div>
      <div class="file-item__actions">
        <!-- En clientes, la acci\u00f3n es SOLO descargar. Evaluamos si es client-files o general-files de la cubeta en Supabase -->
        <button class="btn btn--primary btn--sm" onclick="downloadFile('${d.file_path}', '${d.client_id ? 'client-files' : 'general-files'}')">
          \u2193 Descargar
        </button>
      </div>
    </div>`).join('');
}


/**
 * Renderizado en Cuadr\u00edcula "Grid" para videos
 */
function renderVideos(videos) {
  const grid = document.getElementById('videoGrid');
  if (!videos.length) {
    grid.innerHTML = `<div class="empty-state"><svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><p>No hay videos disponibles a\u00fan.</p></div>`;
    return;
  }
  
  /* 
    Peticiones masivas firmadas:
    Supabase Storage guarda los videos de forma segura. Requerimos generar un Link Protegido con duraci\u00f3n de 1 hr para el reproductor HTML.
    Cargamos todos los enlaces de seguridad al mismo tiempo con Promise.all
  */
  Promise.all(videos.map(async v => {
    const { data } = await sb.storage.from('videos').createSignedUrl(v.file_path, 3600); // 3600 s = 1h
    return { ...v, url: data?.signedUrl }; // Agregamos la URL firmada al arreglo para pintarla
  })).then(vids => {
    grid.innerHTML = vids.map(v => `
      <div class="video-card">
        <!-- Solo pasamos el enlace desencriptado al "src" del reproductor de video interno de HTML5 -->
        <video controls preload="metadata" ${v.url ? `src="${v.url}"` : ''}>
          Tu navegador no soporta video HTML5.
        </video>
        <div class="video-card__body">
          <div class="video-card__title">${v.title}</div>
          ${v.description ? `<div class="video-card__desc">${v.description}</div>` : ''}
          <div style="margin-top:10px;">
            <button class="btn btn--primary btn--sm" onclick="downloadFile('${v.file_path}', 'videos')">\u2193 Descargar video</button>
          </div>
        </div>
      </div>`).join('');
  });
}

// -------------------------------------------------------------------------
// 4. DESCARGA AUTOM\u00c1TICA (HELPER)
// -------------------------------------------------------------------------
// Window expone la funci\u00f3n al nivel general del HTML
window.downloadFile = async function(path, bucket) {
  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 60); // Caducidad 60s
  if (data) {
    // Al ser links de internet as\u00ed evitamos que el navegador 'abra' el PDF, forzamos su 'descarga'
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// -------------------------------------------------------------------------
// 5. B\u00daSQUEDA GENERAL
// -------------------------------------------------------------------------
function applySearch(q) {
  // Cuando buscas "H" en el input, filtramos qu\u00e9 docs y c\u00f3mo videos coinciden...
  const filteredDocs   = allItems.docs.filter(d => d.title.toLowerCase().includes(q));
  const filteredVideos = allItems.videos.filter(v => v.title.toLowerCase().includes(q));
  // Y repintamos el lienzo!
  renderAll(filteredDocs, filteredVideos);
}

// Asignamos el evento "input" tanto a la barra de la compu como del celular
document.getElementById('searchInput').addEventListener('input', e => applySearch(e.target.value.toLowerCase()));
document.getElementById('searchInputMobile').addEventListener('input', e => applySearch(e.target.value.toLowerCase()));

// -------------------------------------------------------------------------
// 6. MEN\u00da MOVIL Y MANEJO DE PESTA\u00d1AS
// -------------------------------------------------------------------------
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

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});
