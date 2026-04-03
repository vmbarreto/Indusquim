/**
 * =========================================================================
 * ARCHIVO: assets/js/cliente/pequeno.js
 * Objetivo: L\u00f3gica del Portal para Clientes "Peque\u00f1os" (General).
 *           Solo pueden ver archivos y videos de alcance GENERAL (client_id es nulo).
 * =========================================================================
 */

let allDocs = [];
let allVideos = [];

// -------------------------------------------------------------------------
// 1. CARGA INICIAL (VERIFICAR IDENTIDAD Y PERMISOS)
// -------------------------------------------------------------------------
(async () => {
  // Asegurarnos que haya iniciado sesi\u00f3n
  const user = await requireAuth('../login.html');
  if (!user) return;

  // Verificamos que sea un cliente PEQUE\u00d1O
  const profile = await getProfile();
  if (!profile || profile.role !== 'client' || profile.client_type !== 'small') {
    window.location.href = '../login.html'; 
    return;
  }

  // Personalizamos su texto superior
  document.getElementById('clientName').textContent    = profile.full_name    || '\u2014';
  document.getElementById('clientCompany').textContent = profile.company_name || '\u2014';
  document.getElementById('welcomeName').textContent   = profile.full_name?.split(' ')[0] || profile.company_name || 'cliente';
  document.getElementById('logoutBtn').onclick = () => logout();

  // -----------------------------------------------------------------------
  // 2. PEDIMOS ÚNICAMENTE CONTENIDO GENERAL
  // '.is('client_id', null)' significa "tr\u00e1eme los que no pertenecen a nadie espec\u00edfico"
  // -----------------------------------------------------------------------
  const { data: docs   } = await sb.from('documents').select('*').is('client_id', null).order('created_at', { ascending: false });
  const { data: videos } = await sb.from('videos').select('*').is('client_id', null).order('created_at', { ascending: false });

  allDocs   = docs   || [];
  allVideos = videos || [];
  
  // Dibujamos las listas
  renderDocs(allDocs);
  renderVideos(allVideos);
})();

// -------------------------------------------------------------------------
// 3. GENERACI\u00d3N HTML DIN\u00c1MICA
// -------------------------------------------------------------------------
function renderDocs(docs) {
  const el = document.getElementById('docsList');
  
  if (!docs.length) {
    el.innerHTML = '<div class="empty-state"><svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No hay documentos disponibles a\u00fan.</p></div>';
    return;
  }
  
  el.innerHTML = docs.map(d => `
    <div class="file-item">
      <div class="file-item__icon">\ud83d\udcc4</div>
      <div class="file-item__info">
        <div class="file-item__name">${d.title}</div>
        <div class="file-item__meta">${new Date(d.created_at).toLocaleDateString('es-CO')}</div>
      </div>
      <div class="file-item__actions">
        <!-- El bucket del que descargan siempre ser\u00e1 "general-files" -->
        <button class="btn btn--primary btn--sm" onclick="downloadFile('${d.file_path}', 'general-files')">\u2193 Descargar</button>
      </div>
    </div>`).join('');
}

function renderVideos(videos) {
  const grid = document.getElementById('videoGrid');
  
  if (!videos.length) {
    grid.innerHTML = '<div class="empty-state"><svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><p>No hay videos disponibles a\u00fan.</p></div>';
    return;
  }
  
  // Creamos enlaces seguros as\u00ed como en el perfil grande
  Promise.all(videos.map(async v => {
    const { data } = await sb.storage.from('videos').createSignedUrl(v.file_path, 3600);
    return { ...v, url: data?.signedUrl };
  })).then(vids => {
    grid.innerHTML = vids.map(v => `
      <div class="video-card">
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
// 4. FUNCIONES LOCALES & UTILIDADES
// -------------------------------------------------------------------------

// Funcion para generar bot\u00f3n de descarga falso
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
}

// 5. B\u00fasqueda Inteligente
function applySearch(q) {
  renderDocs(allDocs.filter(d => d.title.toLowerCase().includes(q)));
  renderVideos(allVideos.filter(v => v.title.toLowerCase().includes(q)));
}
// Escucha escritorio y m\u00f3vil al mismo tiempo
document.getElementById('searchInput').addEventListener('input', e => applySearch(e.target.value.toLowerCase()));
document.getElementById('searchInputMobile').addEventListener('input', e => applySearch(e.target.value.toLowerCase()));

// 6. Sidebar (Men\u00fa m\u00f3vil)
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

// 7. Navegaci\u00f3n entre TABS (Pesta\u00f1as)
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});
