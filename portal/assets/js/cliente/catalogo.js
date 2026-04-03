/**
 * Lógica del Catálogo Interactivo [VISTA CLIENTE]
 */

let allProducts = [];

(async () => {
  // Verificamos tener la sesión (puede ser admin o client)
  const profile = await requireAuth();
  if (!profile) return;
  
  document.getElementById('clientName').textContent = profile.full_name || 'Cliente';
  document.getElementById('clientCompany').textContent = profile.company_name || 'Indusquim';

  // Enrutar dinámicamente el botón 'Mi portal' dependiendo del tipo
  const homeL = document.getElementById('homeLink');
  if (profile.role === 'admin') {
    homeL.href = '../admin/index.html';
  } else {
    homeL.href = profile.client_type === 'large' ? 'grande.html' : 'pequeno.html';
  }

  document.getElementById('logoutBtn').onclick = () => logout();

  await fetchCatalog();
})();

async function fetchCatalog() {
  const { data } = await sb.from('catalog_items').select('*').order('created_at', { ascending: false });
  allProducts = data || [];
  renderCatalog(allProducts);
}

function renderCatalog(items) {
  const grid = document.getElementById('catalogGrid');
  if (!items.length) { 
    grid.innerHTML = '<p style="color:var(--c-muted);font-size:0.875rem;grid-column:1/-1;">No hay productos en esta categoría o búsqueda.</p>'; 
    return; 
  }
  
  grid.innerHTML = items.map((p, idx) => {
    // Generar public URL de la imagen
    const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
    
    // Convertmos el objeto a string base64 para pasarlo en HTML (para el modal onclick)
    // una alternativa es guardar los items en variable global y pasar el `idx`
    return `
    <div class="video-card catalog-item" onclick="openModal(${idx})">
      <img src="${imgUrl}" class="product-img" alt="${p.title}" loading="lazy" />
      <div class="video-card__body">
        <h3 class="video-card__title">${p.title}</h3>
        <p class="badge badge--large" style="margin-top:6px; display:inline-block">${p.category}</p>
        <p class="video-card__desc" style="margin-top:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
          ${p.description}
        </p>
      </div>
    </div>`;
  }).join('');
}

// Búsqueda cruzada
const searchEl = document.getElementById('searchInput'); // desktop
const searchMob = document.getElementById('searchInputMobile'); // movil
const filterCat = document.getElementById('categoryFilter');

function applyFilters() {
  const sq = searchEl.value.toLowerCase() || searchMob.value.toLowerCase();
  const c = filterCat.value;

  const f = allProducts.filter(p => {
    const mQ = p.title.toLowerCase().includes(sq) || p.description.toLowerCase().includes(sq);
    const mC = (c === 'all') || (p.category === c);
    return mQ && mC;
  });
  renderCatalog(f);
}

searchEl.addEventListener('input', applyFilters);
searchMob.addEventListener('input', applyFilters);
filterCat.addEventListener('change', applyFilters);

// ==========================================
// MODAL DETALLE PRODUCTO
// ==========================================
const modal = document.getElementById('productModal');

// Se llama globalmente desde el onclick de las cards
window.openModal = function(idx) {
  const p = allProducts[idx];
  document.getElementById('modalTitle').textContent = p.title;
  document.getElementById('modalCategory').textContent = p.category;
  document.getElementById('modalDesc').textContent = p.description;
  
  const imgUrl = sb.storage.from('catalog-images').getPublicUrl(p.file_path).data.publicUrl;
  document.getElementById('modalImg').src = imgUrl;

  modal.classList.add('open');
};

document.getElementById('closeModal').onclick = () => modal.classList.remove('open');
modal.onclick = (e) => {
  // Cerrar al hacer click afuera de la caja blanca
  if(e.target === modal) modal.classList.remove('open');
};

// Hamburguesa
const hbg = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');
function toggleSidebar() { sidebar.classList.toggle('open'); hbg.classList.toggle('open'); overlay.classList.toggle('show'); }
if(hbg) hbg.addEventListener('click', toggleSidebar);
if(overlay) overlay.addEventListener('click', toggleSidebar);
