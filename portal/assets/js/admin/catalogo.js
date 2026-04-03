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
  document.getElementById('adminName').textContent = profile.full_name || 'Admin';
  document.getElementById('logoutBtn').onclick = () => logout();

  await loadCatalog();
})();

// ==========================================
// DRAG AND DROP FOTO
// ==========================================
const area = document.getElementById(`prodDropArea`);
area.dataset.original = area.innerHTML;
area.onclick = () => document.getElementById(`prodFile`).click();

document.getElementById(`prodFile`).onchange = (e) => {
  const file = e.target.files[0];
  if (file) {
    const size = (file.size / 1024 / 1024).toFixed(1);
    const isImage = file.type.startsWith('image/');
    if(!isImage) return alert('Por favor sube una imagen válida');
    area.innerHTML = `<div class="upload-area__icon">✅</div><p><strong>${file.name}</strong></p><p style="color:var(--c-muted)">${size} MB</p>`;
  } else {
    area.innerHTML = area.dataset.original;
  }
  area.onclick = () => document.getElementById(`prodFile`).click();
};

// ==========================================
// CREAR PRODUCTO
// ==========================================
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const file  = document.getElementById('prodFile').files[0];
  const title = document.getElementById('prodTitle').value.trim();
  const cat   = document.getElementById('prodCategory').value;
  const desc  = document.getElementById('prodDesc').value.trim();
  
  if (!file) return;

  const btn = document.getElementById('prodSubmit');
  const bar = document.getElementById('prodProgressBar');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  document.getElementById('prodProgress').style.display = 'block';
  bar.classList.add('progress-bar--active');

  // Limpiar nombre archivo
  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `images/${Date.now()}_${safeName}`;

  // 1. Subir a Storage
  const { error: upErr } = await sb.storage.from('catalog-images').upload(path, file);
  bar.classList.remove('progress-bar--active');
  
  if (upErr) { 
    showError(upErr.message); 
    document.getElementById('prodProgress').style.display = 'none'; 
    btn.textContent = 'Guardar Producto'; btn.disabled = false; 
    return; 
  }

  // 2. Insertar en tabla
  await sb.from('catalog_items').insert({ 
    title, 
    category: cat, 
    description: desc, 
    file_path: path 
  });
  
  bar.style.width = '100%';
  setTimeout(() => { document.getElementById('prodProgress').style.display = 'none'; bar.style.width = '0%'; }, 700);
  
  showSuccess('Producto agregado al catálogo correctamente.');
  document.getElementById('productForm').reset();
  area.innerHTML = area.dataset.original; 
  area.onclick = () => document.getElementById('prodFile').click();
  
  await loadCatalog();
  btn.textContent = 'Guardar Producto'; btn.disabled = false;
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
    // Generar public URL de la imagen
    const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;

    return `
    <div class="video-card">
      <img src="${imgUrl}" class="product-img" alt="${p.title}" loading="lazy" />
      <div class="video-card__body">
        <h3 class="video-card__title">${p.title}</h3>
        <p class="badge badge--large" style="margin-top:6px; display:inline-block">${p.category}</p>
        <p class="video-card__desc" style="margin-top:8px">${p.description}</p>
        <button class="btn btn--outline btn--danger btn--sm" style="margin-top:16px; width:100%" onclick="deleteProduct('${p.id}', '${p.file_path}')">
          Eliminar Producto
        </button>
      </div>
    </div>`;
  }).join('');
}

// Búsqueda en vivo
document.getElementById('prodSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderCatalog(allProducts.filter(p => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
});

// ==========================================
// ELIMINAR
// ==========================================
window.deleteProduct = async function(id, path) {
  if (!confirm('¿Estás seguro de eliminar este producto del catálogo?')) return;
  // Borramos archivo imagen
  await sb.storage.from('catalog-images').remove([path]);
  // Borramos fila BD
  await sb.from('catalog_items').delete().eq('id', id);
  // Recargamos visial
  await loadCatalog();
  showSuccess('Producto eliminado.');
}

// Hamburguesa
const hbg = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');
function toggleSidebar() { sidebar.classList.toggle('open'); hbg.classList.toggle('open'); overlay.classList.toggle('show'); }
if(hbg) hbg.addEventListener('click', toggleSidebar);
if(overlay) overlay.addEventListener('click', toggleSidebar);

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
