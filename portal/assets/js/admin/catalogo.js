/**
 * Lógica administrativa para el Catálogo Interactivo
 */

let allProducts = [];

(async () => {
  const profile = await requireAdminOrCommercial();
  if (!profile) return;
  if (profile.role === 'commercial') {
    window.location.href = 'index.html';
    return;
  }
  await initNotifications(profile.id);

  document.getElementById('adminName').textContent = profile.full_name || 'Admin';
  document.getElementById('logoutBtn').onclick = () => logout();
  await loadCatalog();
})();

// ==========================================
// MODAL CONTROL
// ==========================================
const prodBackdrop = document.getElementById('prodModalBackdrop');

document.getElementById('openProdModal').onclick  = () => prodBackdrop.classList.add('open');
document.getElementById('closeProdModal').onclick = () => closeProdModal();
document.getElementById('cancelProdModal').onclick = () => closeProdModal();

function closeProdModal() {
  prodBackdrop.classList.remove('open');
  document.getElementById('productForm').reset();
  resetDropArea('prodDropArea', '🖼️', '<p><strong>Haz clic o arrastra</strong> una imagen</p><p style="color:var(--c-muted);font-size:0.8rem;">JPG o PNG — Recomendado 16:9</p>');
  resetDropArea('sheetDropArea', '📄', '<p><strong>Haz clic o arrastra</strong> el PDF de la ficha técnica</p><p style="color:var(--c-muted);font-size:0.8rem;">Solo archivos PDF</p>');
}

function resetDropArea(areaId, icon, text) {
  const area = document.getElementById(areaId);
  area.innerHTML = '<div class="upload-area__icon" style="font-size:1.4rem;">' + icon + '</div>' + text;
  area.onclick = () => document.getElementById(areaId === 'prodDropArea' ? 'prodFile' : 'sheetFile').click();
}

// ==========================================
// DRAG AND DROP — IMAGEN
// ==========================================
const imgArea = document.getElementById('prodDropArea');
imgArea.onclick = () => document.getElementById('prodFile').click();

document.getElementById('prodFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Por favor sube una imagen válida.');
  const size = (file.size / 1024 / 1024).toFixed(1);
  imgArea.innerHTML = '<div class="upload-area__icon">✅</div><p><strong>' + file.name + '</strong></p><p style="color:var(--c-muted)">' + size + ' MB</p>';
  imgArea.onclick = () => document.getElementById('prodFile').click();
};

// ==========================================
// DRAG AND DROP — FICHA TÉCNICA (PDF)
// ==========================================
const sheetArea = document.getElementById('sheetDropArea');
sheetArea.onclick = () => document.getElementById('sheetFile').click();

document.getElementById('sheetFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') return alert('Por favor sube un archivo PDF.');
  const size = (file.size / 1024 / 1024).toFixed(1);
  sheetArea.innerHTML = '<div class="upload-area__icon">✅</div><p><strong>' + file.name + '</strong></p><p style="color:var(--c-muted)">' + size + ' MB</p>';
  sheetArea.onclick = () => document.getElementById('sheetFile').click();
};

// ==========================================
// CREAR PRODUCTO
// ==========================================
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const imgFile   = document.getElementById('prodFile').files[0];
  const sheetFile = document.getElementById('sheetFile').files[0];
  const title     = document.getElementById('prodTitle').value.trim();
  const cat       = document.getElementById('prodCategory').value;
  const shortDesc = document.getElementById('prodShortDesc').value.trim();
  const desc      = document.getElementById('prodDesc').value.trim();

  if (!imgFile) return showError('Debes subir una imagen de portada.');

  const btn = document.getElementById('prodSubmit');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  document.getElementById('prodProgress').style.display = 'block';
  document.getElementById('prodProgressBar').classList.add('progress-bar--active');

  // 1. Subir imagen a catalog-images
  const safeName = imgFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const imgPath = 'images/' + Date.now() + '_' + safeName;

  const { error: imgErr } = await sb.storage.from('catalog-images').upload(imgPath, imgFile);
  if (imgErr) {
    showError('Error al subir imagen: ' + imgErr.message);
    document.getElementById('prodProgress').style.display = 'none';
    btn.textContent = 'Guardar producto'; btn.disabled = false;
    return;
  }

  // 2. Subir ficha técnica (si existe)
  let sheetPath = null;
  if (sheetFile) {
    const safePdf = sheetFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    sheetPath = 'sheets/' + Date.now() + '_' + safePdf;
    const { error: sheetErr } = await sb.storage.from('technical-sheets').upload(sheetPath, sheetFile);
    if (sheetErr) {
      showError('Error al subir ficha técnica: ' + sheetErr.message);
      document.getElementById('prodProgress').style.display = 'none';
      btn.textContent = 'Guardar producto'; btn.disabled = false;
      return;
    }
  }

  // 3. Insertar en tabla
  const { error: dbErr } = await sb.from('catalog_items').insert({
    title,
    category: cat,
    short_description: shortDesc,
    description: desc,
    file_path: imgPath,
    technical_sheet_path: sheetPath
  });

  document.getElementById('prodProgressBar').classList.remove('progress-bar--active');
  document.getElementById('prodProgressBar').style.width = '100%';
  setTimeout(() => {
    document.getElementById('prodProgress').style.display = 'none';
    document.getElementById('prodProgressBar').style.width = '0%';
  }, 700);

  if (dbErr) {
    showError('Error al guardar el producto: ' + dbErr.message);
  } else {
    showSuccess('Producto agregado al catálogo correctamente.');
    closeProdModal();
    await loadCatalog();
  }

  btn.textContent = 'Guardar producto'; btn.disabled = false;
});

// ==========================================
// CARGAR Y PINTAR PRODUCTOS
// ==========================================
async function loadCatalog() {
  const { data } = await sb.from('catalog_items').select('*').order('created_at', { ascending: false });
  allProducts = data || [];
  renderCatalog(allProducts);
}

function renderCatalog(items) {
  const list = document.getElementById('catalogList');
  if (!items.length) {
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">El catálogo está vacío.</p>';
    return;
  }

  list.innerHTML = items.map(p => {
    const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
    const sheetBadge = p.technical_sheet_path
      ? '<span style="font-size:0.72rem;background:rgba(16,185,129,0.12);color:#10b981;border-radius:4px;padding:2px 7px;margin-left:6px;">📄 Ficha técnica</span>'
      : '';

    return '<div class="video-card">'
      + '<img src="' + imgUrl + '" class="product-img" alt="' + p.title + '" loading="lazy" />'
      + '<div class="video-card__body">'
      + '<h3 class="video-card__title">' + p.title + sheetBadge + '</h3>'
      + '<span class="badge badge--large" style="margin-top:4px;display:inline-block;">' + p.category + '</span>'
      + (p.short_description ? '<p style="font-size:0.82rem;color:var(--c-muted);margin-top:6px;">' + p.short_description + '</p>' : '')
      + '<p class="video-card__desc" style="margin-top:6px;">' + (p.description || '') + '</p>'
      + '<button class="btn btn--outline btn--danger btn--sm" style="margin-top:16px;width:100%;" onclick="deleteProduct(\'' + p.id + '\',\'' + p.file_path + '\',\'' + (p.technical_sheet_path || '') + '\')">Eliminar producto</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

// Búsqueda en vivo
document.getElementById('prodSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderCatalog(allProducts.filter(p =>
    p.title.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
  ));
});

// ==========================================
// ELIMINAR PRODUCTO
// ==========================================
window.deleteProduct = async function(id, imgPath, sheetPath) {
  if (!confirm('¿Estás seguro de eliminar este producto del catálogo?')) return;
  await sb.storage.from('catalog-images').remove([imgPath]);
  if (sheetPath) await sb.storage.from('technical-sheets').remove([sheetPath]);
  await sb.from('catalog_items').delete().eq('id', id);
  await loadCatalog();
  showSuccess('Producto eliminado.');
};

// Hamburguesa
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
