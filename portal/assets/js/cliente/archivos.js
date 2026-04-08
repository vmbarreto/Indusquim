/**
 * Archivos — Vista Cliente
 * Pequeños: solo Contenido General (client_id = null)
 * Grandes: Contenido General + Mi Contenido (client_id = perfil propio)
 */

let currentProfile = null;

(async () => {
  currentProfile = await getProfile();
  if (!currentProfile || currentProfile.role !== 'client') {
    window.location.href = '../login.html';
    return;
  }

  document.getElementById('clientName').textContent    = currentProfile.full_name    || 'Cliente';
  document.getElementById('clientCompany').textContent = currentProfile.company_name || 'Indusquim';
  document.getElementById('homeLink').href = currentProfile.client_type === 'large' ? 'grande.html' : 'pequeno.html';
  document.getElementById('logoutBtn').onclick = () => logout();

  // Mostrar la pestaña "Mi Contenido" solo para clientes grandes
  if (currentProfile.client_type === 'large') {
    document.getElementById('tabPersonal').style.display = '';
  }

  await loadGeneral();
  if (currentProfile.client_type === 'large') {
    await loadPersonal();
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
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
// CARGAR CONTENIDO GENERAL (client_id = null)
// Sin informes de visita — aplica a todos los clientes (incluidos pequeños)
// ==========================================
async function loadGeneral() {
  const [{ data: soporte }, { data: presentaciones }, { data: videos }] = await Promise.all([
    sb.from('documents').select('*').eq('type', 'support').is('client_id', null).order('created_at', { ascending: false }),
    sb.from('documents').select('*').eq('type', 'presentation').is('client_id', null).order('created_at', { ascending: false }),
    sb.from('videos').select('*').is('client_id', null).order('created_at', { ascending: false })
  ]);

  renderFileList('generalSoporte',        soporte        || [], 'general-files');
  renderFileList('generalPresentaciones', presentaciones || [], 'general-files');
  renderVideoGrid('generalVideos',        videos         || []);
}

// ==========================================
// CARGAR MI CONTENIDO (client_id = mi perfil)
// Solo clientes grandes — incluye documentos soporte + capacitaciones
// ==========================================
async function loadPersonal() {
  const [{ data: informes }, { data: soporte }, { data: presentaciones }, { data: videos }] = await Promise.all([
    sb.from('documents').select('*').eq('type', 'report').eq('client_id', currentProfile.id).order('created_at', { ascending: false }),
    sb.from('documents').select('*').eq('type', 'support').eq('client_id', currentProfile.id).order('created_at', { ascending: false }),
    sb.from('documents').select('*').eq('type', 'presentation').eq('client_id', currentProfile.id).order('created_at', { ascending: false }),
    sb.from('videos').select('*').eq('client_id', currentProfile.id).order('created_at', { ascending: false })
  ]);

  renderFileList('personalInformes',      informes       || [], 'client-files');
  renderFileList('personalSoporte',       soporte        || [], 'client-files');
  renderFileList('personalPresentaciones',presentaciones || [], 'client-files');
  renderVideoGrid('personalVideos',       videos         || []);
}

// ==========================================
// RENDERIZADORES
// ==========================================
function renderFileList(containerId, docs, bucket) {
  const el = document.getElementById(containerId);
  if (!docs.length) {
    el.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin archivos disponibles.</p>';
    return;
  }
  el.innerHTML = docs.map(d => {
    const fecha      = new Date(d.created_at).toLocaleDateString('es-CO');
    const realBucket = d.file_path.startsWith('general/') ? 'general-files' : 'client-files';
    return '<div class="file-item">'
      + '<div class="file-item__icon">📄</div>'
      + '<div class="file-item__info">'
      + '<div class="file-item__name">' + d.title + '</div>'
      + '<div class="file-item__meta">' + fecha + '</div>'
      + '</div>'
      + '<div class="file-item__actions">'
      + '<button class="btn btn--ghost btn--sm" onclick="downloadFile(\'' + d.file_path + '\',\'' + realBucket + '\')">Descargar</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

async function renderVideoGrid(containerId, videos) {
  const el = document.getElementById(containerId);
  if (!videos.length) {
    el.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">Sin videos disponibles.</p>';
    return;
  }
  const signedUrls = await Promise.all(
    videos.map(v => sb.storage.from('videos').createSignedUrl(v.file_path, 3600))
  );
  el.innerHTML = videos.map((v, i) => {
    const videoUrl = signedUrls[i].data?.signedUrl || '';
    return '<div class="video-card">'
      + '<video controls src="' + videoUrl + '" preload="metadata"></video>'
      + '<div class="video-card__body">'
      + '<h3 class="video-card__title">' + v.title + '</h3>'
      + (v.description ? '<p class="video-card__desc">' + v.description + '</p>' : '')
      + '</div>'
      + '</div>';
  }).join('');
}

// Previsualizar archivo en modal
window.downloadFile = async function(path, bucket) {
  const filename = path.split('/').pop();
  const ext      = filename.split('.').pop().toLowerCase();
  const isPdf    = ext === 'pdf';
  const isImg    = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);

  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 300);
  if (!data?.signedUrl) return;
  const url = data.signedUrl;

  const existing = document.getElementById('filePreviewBackdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'filePreviewBackdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  let contentHtml = '';
  if (isPdf) {
    contentHtml = '<iframe src="' + url + '" style="width:100%;height:100%;border:none;border-radius:0 0 12px 12px;"></iframe>';
  } else if (isImg) {
    contentHtml = '<div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;">'
      + '<img src="' + url + '" style="max-width:100%;max-height:100%;border-radius:8px;object-fit:contain;" />'
      + '</div>';
  } else {
    contentHtml = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;">'
      + '<div style="font-size:3rem;">📄</div>'
      + '<div style="font-size:0.9rem;color:var(--c-muted);text-align:center;">Este tipo de archivo no se puede previsualizar.</div>'
      + '<a href="' + url + '" target="_blank" class="btn btn--primary btn--sm">Descargar archivo</a>'
      + '</div>';
  }

  backdrop.innerHTML = '<div style="background:var(--c-white);border-radius:12px;width:100%;max-width:860px;height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--c-border);flex-shrink:0;">'
    + '<div style="font-weight:700;font-size:0.9rem;color:var(--c-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">' + filename + '</div>'
    + '<div style="display:flex;gap:8px;flex-shrink:0;">'
    + '<a href="' + url + '" target="_blank" download="' + filename + '" class="btn btn--outline btn--sm">Descargar</a>'
    + '<button onclick="document.getElementById(\'filePreviewBackdrop\').remove()" class="btn btn--ghost btn--sm" style="padding:6px 10px;">✕</button>'
    + '</div>'
    + '</div>'
    + contentHtml
    + '</div>';

  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
};
