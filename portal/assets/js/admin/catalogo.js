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
  const imgArea = document.getElementById('prodDropArea');
  imgArea.innerHTML = '<div class="upload-area__icon" style="font-size:1.4rem;">🖼️</div><p><strong>Haz clic o arrastra</strong> una imagen</p><p style="color:var(--c-muted);font-size:0.8rem;">JPG o PNG — Recomendado 16:9</p>';
  imgArea.onclick = () => document.getElementById('prodFile').click();
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
// CREAR PRODUCTO
// ==========================================
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const imgFile  = document.getElementById('prodFile').files[0];
  const title    = document.getElementById('prodTitle').value.trim();
  const cat      = document.getElementById('prodCategory').value;
  const desc     = document.getElementById('prodDesc').value.trim();
  const quantity = parseInt(document.getElementById('prodQuantity').value, 10) || 0;

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

  const { error: dbErr } = await sb.from('catalog_items').insert({
    title, category: cat, description: desc, quantity, file_path: imgPath
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
    list.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;">El catálogo está vacío.</p>';
    return;
  }

  list.innerHTML = items.map(p => {
    const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
    return '<div class="catalog-row">'
      + '<img src="' + imgUrl + '" class="catalog-row__img" alt="' + p.title + '" loading="lazy" />'
      + '<div class="catalog-row__info">'
      + '<div class="catalog-row__title">' + p.title + '</div>'
      + '<span class="badge badge--large" style="margin-top:3px;display:inline-block;">' + p.category + '</span>'
      + (p.description ? '<div class="catalog-row__desc">' + p.description + '</div>' : '')
      + '<div class="catalog-row__qty">Cantidad: ' + (p.quantity || 0) + '</div>'
      + '</div>'
      + '<div class="catalog-row__actions">'
      + '<button class="btn btn--ghost btn--sm" onclick="openDetailModal(\'' + p.id + '\')">Detalles</button>'
      + '<button class="btn btn--outline btn--sm" onclick="openEditModal(\'' + p.id + '\')">Actualizar</button>'
      + '<button class="btn btn--danger btn--sm" onclick="confirmDelete(\'' + p.id + '\')">Eliminar</button>'
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
  document.getElementById('detailImg').src              = imgUrl;
  document.getElementById('detailTitle').textContent    = p.title;
  document.getElementById('detailCategory').textContent = p.category;
  document.getElementById('detailDesc').textContent     = p.description || '';
  document.getElementById('detailQuantity').textContent = 'Cantidad disponible: ' + (p.quantity || 0);
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

  document.getElementById('e_id').value         = p.id;
  document.getElementById('e_oldImgPath').value = p.file_path;
  document.getElementById('e_title').value      = p.title;
  document.getElementById('e_category').value   = p.category;
  document.getElementById('e_desc').value       = p.description || '';
  document.getElementById('e_quantity').value   = p.quantity || 0;
  document.getElementById('e_imgFile').value    = '';

  const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
  document.getElementById('editImgPreview').innerHTML =
    '<img src="' + imgUrl + '" style="width:100%;border-radius:6px;margin-top:6px;aspect-ratio:16/9;object-fit:cover;" />'
    + '<p style="margin-top:6px;font-size:0.78rem;color:var(--c-muted);">Haz clic para cambiar la imagen</p>';

  document.getElementById('editModalError').classList.remove('show');
  editBackdrop.classList.add('open');
};

document.getElementById('closeEditModal').onclick  = () => { editBackdrop.classList.remove('open'); };
document.getElementById('cancelEditModal').onclick = () => { editBackdrop.classList.remove('open'); };

document.getElementById('editImgArea').onclick = () => document.getElementById('e_imgFile').click();

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

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('editSubmit');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const id         = document.getElementById('e_id').value;
  const oldImgPath = document.getElementById('e_oldImgPath').value;
  const newImgFile = document.getElementById('e_imgFile').files[0];

  let imgPath = oldImgPath;

  if (newImgFile) {
    const safeName   = newImgFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const newImgPath = 'images/' + Date.now() + '_' + safeName;
    const { error: imgErr } = await sb.storage.from('catalog-images').upload(newImgPath, newImgFile);
    if (imgErr) { showModalError('editModalError', 'Error al subir la nueva imagen: ' + imgErr.message); btn.textContent = 'Guardar cambios'; btn.disabled = false; return; }
    await sb.storage.from('catalog-images').remove([oldImgPath]);
    imgPath = newImgPath;
  }

  const { error: dbErr } = await sb.from('catalog_items').update({
    title:       document.getElementById('e_title').value.trim(),
    category:    document.getElementById('e_category').value,
    description: document.getElementById('e_desc').value.trim(),
    quantity:    parseInt(document.getElementById('e_quantity').value, 10) || 0,
    file_path:   imgPath
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
    const matchQ = p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
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
