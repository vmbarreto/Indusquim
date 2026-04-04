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
  initAudit(profile);
  await loadCatalog();
})();

// ==========================================
// MODAL CREAR — CONTROL
// ==========================================
const prodBackdrop = document.getElementById('prodModalBackdrop');

document.getElementById('openProdModal').onclick   = () => {
  document.getElementById('prodModalError').classList.remove('show');
  prodBackdrop.classList.add('open');
};
document.getElementById('closeProdModal').onclick  = () => closeProdModal();
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
// DRAG AND DROP — IMAGEN (crear)
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
// DRAG AND DROP — FICHA TÉCNICA (crear)
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

  if (!imgFile) { showModalError('prodModalError', 'Debes subir una imagen de portada.'); return; }

  const btn = document.getElementById('prodSubmit');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  document.getElementById('prodProgress').style.display = 'block';
  document.getElementById('prodProgressBar').classList.add('progress-bar--active');

  const safeName = imgFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const imgPath  = 'images/' + Date.now() + '_' + safeName;

  const { error: imgErr } = await sb.storage.from('catalog-images').upload(imgPath, imgFile);
  if (imgErr) {
    showModalError('prodModalError', 'Error al subir imagen: ' + imgErr.message);
    document.getElementById('prodProgress').style.display = 'none';
    btn.textContent = 'Guardar producto'; btn.disabled = false;
    return;
  }

  let sheetPath = null;
  if (sheetFile) {
    const safePdf  = sheetFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    sheetPath = 'sheets/' + Date.now() + '_' + safePdf;
    const { error: sheetErr } = await sb.storage.from('technical-sheets').upload(sheetPath, sheetFile);
    if (sheetErr) {
      showModalError('prodModalError', 'Error al subir ficha técnica: ' + sheetErr.message);
      document.getElementById('prodProgress').style.display = 'none';
      btn.textContent = 'Guardar producto'; btn.disabled = false;
      return;
    }
  }

  const { error: dbErr } = await sb.from('catalog_items').insert({
    title, category: cat, short_description: shortDesc,
    description: desc, file_path: imgPath, technical_sheet_path: sheetPath
  });

  document.getElementById('prodProgressBar').classList.remove('progress-bar--active');
  document.getElementById('prodProgressBar').style.width = '100%';
  setTimeout(() => {
    document.getElementById('prodProgress').style.display = 'none';
    document.getElementById('prodProgressBar').style.width = '0%';
  }, 700);

  if (dbErr) {
    showModalError('prodModalError', 'Error al guardar el producto: ' + dbErr.message);
  } else {
    await logAudit('Producto creado', title + ' · ' + cat);
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
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;grid-column:1/-1;">El catálogo está vacío.</p>';
    return;
  }

  list.innerHTML = items.map(p => {
    const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
    return '<div class="video-card">'
      + '<img src="' + imgUrl + '" class="product-img" alt="' + p.title + '" loading="lazy" />'
      + '<div class="video-card__body">'
      + '<h3 class="video-card__title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + p.title + '">' + p.title + '</h3>'
      + '<div style="margin-top:6px;">'
      + '<span class="badge badge--large">' + p.category + '</span>'
      + (p.technical_sheet_path ? '<span style="font-size:0.72rem;background:rgba(16,185,129,0.12);color:#10b981;border-radius:4px;padding:2px 7px;margin-left:6px;">📄 Ficha</span>' : '')
      + '</div>'
      + (p.short_description ? '<p style="font-size:0.82rem;color:var(--c-muted);margin-top:8px;line-height:1.4;">' + p.short_description + '</p>' : '')
      + '<button class="btn btn--ghost btn--sm" style="width:100%;margin-top:14px;" onclick="openDetailModal(\'' + p.id + '\')">Detalles</button>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
      + '<button class="btn btn--outline btn--sm" style="flex:1;" onclick="openEditModal(\'' + p.id + '\')">Actualizar</button>'
      + '<button class="btn btn--danger btn--sm" style="flex:1;" onclick="confirmDelete(\'' + p.id + '\')">Eliminar</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

// ==========================================
// MODAL DETALLE (solo lectura)
// ==========================================
const adminDetailModal = document.getElementById('adminDetailModal');

window.openDetailModal = function(id) {
  const p = allProducts.find(p => p.id === id);
  if (!p) return;
  const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
  document.getElementById('detailImg').src               = imgUrl;
  document.getElementById('detailTitle').textContent     = p.title;
  document.getElementById('detailCategory').textContent  = p.category;
  document.getElementById('detailShortDesc').textContent = p.short_description || '';
  document.getElementById('detailDesc').textContent      = p.description || '';
  const sheetWrap = document.getElementById('detailSheetWrap');
  sheetWrap.innerHTML = p.technical_sheet_path
    ? '<span style="font-size:0.8rem;background:rgba(16,185,129,0.12);color:#10b981;border-radius:4px;padding:4px 10px;">📄 Ficha técnica disponible</span>'
    : '';
  adminDetailModal.classList.add('open');
};

document.getElementById('closeDetailModal').onclick = () => adminDetailModal.classList.remove('open');
adminDetailModal.onclick = (e) => { if (e.target === adminDetailModal) adminDetailModal.classList.remove('open'); };

// ==========================================
// MODAL EDITAR PRODUCTO
// ==========================================
const editBackdrop = document.getElementById('editModalBackdrop');

window.openEditModal = function(id) {
  const p = allProducts.find(p => p.id === id);
  if (!p) return;

  document.getElementById('e_id').value           = p.id;
  document.getElementById('e_oldImgPath').value   = p.file_path;
  document.getElementById('e_oldSheetPath').value = p.technical_sheet_path || '';
  document.getElementById('e_title').value        = p.title;
  document.getElementById('e_category').value     = p.category;
  document.getElementById('e_shortDesc').value    = p.short_description || '';
  document.getElementById('e_desc').value         = p.description || '';
  document.getElementById('e_imgFile').value      = '';
  document.getElementById('e_sheetFile').value    = '';

  const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
  document.getElementById('editImgPreview').innerHTML =
    '<img src="' + imgUrl + '" style="width:100%;border-radius:6px;margin-top:6px;aspect-ratio:16/9;object-fit:cover;" />'
    + '<p style="margin-top:6px;font-size:0.78rem;color:var(--c-muted);">Haz clic para cambiar la imagen</p>';

  document.getElementById('editSheetPreview').innerHTML = p.technical_sheet_path
    ? '<span style="color:#10b981;">📄 Ficha técnica cargada.</span> <span style="font-size:0.78rem;color:var(--c-muted);">Haz clic para reemplazar</span>'
    : '<span style="color:var(--c-muted);font-size:0.85rem;">Sin ficha técnica. Haz clic para subir un PDF.</span>';

  document.getElementById('editModalError').classList.remove('show');
  editBackdrop.classList.add('open');
};

document.getElementById('closeEditModal').onclick  = () => { editBackdrop.classList.remove('open'); };
document.getElementById('cancelEditModal').onclick = () => { editBackdrop.classList.remove('open'); };

document.getElementById('editImgArea').onclick  = () => document.getElementById('e_imgFile').click();
document.getElementById('editSheetArea').onclick = () => document.getElementById('e_sheetFile').click();

document.getElementById('e_imgFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('editImgPreview').innerHTML =
      '<img src="' + ev.target.result + '" style="width:100%;border-radius:6px;margin-top:6px;aspect-ratio:16/9;object-fit:cover;" />'
      + '<p style="margin-top:6px;font-size:0.78rem;color:var(--c-muted);">Nueva imagen: ' + file.name + '</p>';
  };
  reader.readAsDataURL(file);
};

document.getElementById('e_sheetFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('editSheetPreview').innerHTML =
    '<span style="color:#10b981;">✅ ' + file.name + '</span>';
};

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('editSubmit');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const id           = document.getElementById('e_id').value;
  const oldImgPath   = document.getElementById('e_oldImgPath').value;
  const oldSheetPath = document.getElementById('e_oldSheetPath').value;
  const newImgFile   = document.getElementById('e_imgFile').files[0];
  const newSheetFile = document.getElementById('e_sheetFile').files[0];

  let imgPath   = oldImgPath;
  let sheetPath = oldSheetPath || null;

  if (newImgFile) {
    const safeName   = newImgFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const newImgPath = 'images/' + Date.now() + '_' + safeName;
    const { error: imgErr } = await sb.storage.from('catalog-images').upload(newImgPath, newImgFile);
    if (imgErr) { showModalError('editModalError', 'Error al subir la nueva imagen: ' + imgErr.message); btn.textContent = 'Guardar cambios'; btn.disabled = false; return; }
    await sb.storage.from('catalog-images').remove([oldImgPath]);
    imgPath = newImgPath;
  }

  if (newSheetFile) {
    const safePdf      = newSheetFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const newSheetPath = 'sheets/' + Date.now() + '_' + safePdf;
    const { error: sheetErr } = await sb.storage.from('technical-sheets').upload(newSheetPath, newSheetFile);
    if (sheetErr) { showModalError('editModalError', 'Error al subir la ficha técnica: ' + sheetErr.message); btn.textContent = 'Guardar cambios'; btn.disabled = false; return; }
    if (oldSheetPath) await sb.storage.from('technical-sheets').remove([oldSheetPath]);
    sheetPath = newSheetPath;
  }

  const { error: dbErr } = await sb.from('catalog_items').update({
    title:                document.getElementById('e_title').value.trim(),
    category:             document.getElementById('e_category').value,
    short_description:    document.getElementById('e_shortDesc').value.trim(),
    description:          document.getElementById('e_desc').value.trim(),
    file_path:            imgPath,
    technical_sheet_path: sheetPath
  }).eq('id', id);

  if (dbErr) {
    showModalError('editModalError', 'Error al actualizar: ' + dbErr.message);
  } else {
    const updTitle = document.getElementById('e_title').value.trim();
    await logAudit('Producto actualizado', updTitle);
    showSuccess('Producto actualizado correctamente.');
    editBackdrop.classList.remove('open');
    await loadCatalog();
  }
  btn.textContent = 'Guardar cambios'; btn.disabled = false;
});

// ==========================================
// CONFIRMAR ELIMINACIÓN
// ==========================================
window.confirmDelete = function(id) {
  const p = allProducts.find(p => p.id === id);
  if (!p) return;
  if (!confirm('¿Seguro que quieres eliminar "' + p.title + '"?\nEsta acción no se puede deshacer.')) return;
  deleteProduct(p.id, p.file_path, p.technical_sheet_path || '');
};

window.deleteProduct = async function(id, imgPath, sheetPath) {
  const prod = allProducts.find(p => p.id === id);
  await sb.storage.from('catalog-images').remove([imgPath]);
  if (sheetPath) await sb.storage.from('technical-sheets').remove([sheetPath]);
  await sb.from('catalog_items').delete().eq('id', id);
  await logAudit('Producto eliminado', prod?.title || id);
  await loadCatalog();
  showSuccess('Producto eliminado.');
};

// ==========================================
// FILTROS (búsqueda + categoría)
// ==========================================
function applyAdminFilters() {
  const q = document.getElementById('prodSearch').value.toLowerCase();
  const c = document.getElementById('prodCategoryFilter').value;
  renderCatalog(allProducts.filter(p => {
    const matchQ = p.title.toLowerCase().includes(q) || (p.short_description || '').toLowerCase().includes(q);
    const matchC = c === 'all' || p.category === c;
    return matchQ && matchC;
  }));
}
document.getElementById('prodSearch').addEventListener('input', applyAdminFilters);
document.getElementById('prodCategoryFilter').addEventListener('change', applyAdminFilters);

// Hamburguesa
const hbg     = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');
function toggleSidebar() { sidebar.classList.toggle('open'); hbg.classList.toggle('open'); overlay.classList.toggle('show'); }
if (hbg)     hbg.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);

function showModalError(modalErrorId, msg) {
  const el = document.getElementById(modalErrorId);
  if (!el) { showError(msg); return; }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 6000);
}

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
