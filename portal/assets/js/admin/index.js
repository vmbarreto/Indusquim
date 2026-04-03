/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/index.js
 * Objetivo: Manejar la lógica, animaciones y consulta de base de datos
 *           para el Dashboard principal del Administrador.
 * =========================================================================
 */

// 1. IIFE (Immediately Invoked Function Expression)
// Usamos async para ejecutar peticiones complejas a la Base de Datos "detrás de escena"
(async () => {
  // Asegurarnos que quien entra a esta página SÍ SEA un Administrador
  // 'requireAdminOrCommercial' es una función de nuestro 'auth.js'
  const profile = await requireAdminOrCommercial();
  if (!profile) return;

  const isCommercial = profile.role === 'commercial';

  // ── Personalizar la interfaz según el rol ──────────────────────────────
  // Nombre del usuario en el sidebar
  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  // Badge de rol en el sidebar footer (Administrador / Comercial)
  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    if (isCommercial) roleEl.style.color = '#c084fc'; // tono morado suave para comercial
  }

  // Título de la topbar
  const topbarTitle = document.querySelector('.topbar__title');
  if (topbarTitle && isCommercial) topbarTitle.textContent = 'Panel Comercial';

  // Ocultar elementos exclusivos del Administrador
  if (isCommercial) {
    // Botón "Crear usuario" en Accesos rápidos
    const btnCrear = document.getElementById('btnCrearUsuario');
    if (btnCrear) btnCrear.style.display = 'none';

    // Enlace "Usuarios" en sidebar
    const linkUsuarios = document.querySelector('.sidebar__nav a[href="usuarios.html"]');
    if (linkUsuarios) linkUsuarios.style.display = 'none';

    // Enlace "Catálogo" en sidebar
    const linkCatalogo = document.querySelector('.sidebar__nav a[href="catalogo.html"]');
    if (linkCatalogo) linkCatalogo.style.display = 'none';
  }


  // ── Bienvenida personalizada solo para el Comercial ──────────────────
  // Si el usuario es comercial, mostramos un saludo visible en la parte superior
  if (isCommercial) {
    const banner = document.getElementById('welcomeBanner');
    const text   = document.getElementById('welcomeText');
    if (banner && text) {
      // Construimos el mensaje de bienvenida con el nombre del comercial
      text.innerHTML = '👋 Bienvenido, <strong>' + (profile.full_name || 'Comercial') + '</strong> — Panel Comercial Indusquim';
      banner.style.display = 'block'; // Hacemos visible el banner
    }

    // Cambiamos las etiquetas de las stat-cards al modo "comercial"
    // Cada etiqueta tiene un atributo data-commercial con el texto correcto
    ['label1','label2','label3','label4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = el.dataset.commercial; // lee el atributo data-commercial
    });
  }

  // -----------------------------------------------------------------------
  // 2. ESTADÍSTICAS DEL DASHBOARD (Cards superiores)
  //    Admin ve: Total, Grandes, Pequeños, Documentos
  //    Comercial ve: Total, Documentos, Videos, Pedidos (próximamente)
  // -----------------------------------------------------------------------

  // Siempre traemos el total de clientes (visible para ambos roles)
  const { data: clients } = await sb.from('profiles')
    .select('client_type')
    .eq('role', 'client');

  // Total de documentos (visible para ambos roles)
  const { data: docs } = await sb.from('documents').select('id');

  if (isCommercial) {
    // --- STATS DEL COMERCIAL ---

    // Total de videos subidos en el sistema
    const { data: videos } = await sb.from('videos').select('id');

    // Stat 1: Total de clientes en el sistema
    document.getElementById('totalClients').textContent = (clients || []).length;

    // Stat 2: Total de documentos (para el comercial representa su "actividad de material")
    document.getElementById('largeClients').textContent = (docs || []).length;

    // Stat 3: Total de videos subidos
    document.getElementById('smallClients').textContent = (videos || []).length;

    // Stat 4: Pedidos (aún no implementado, mostramos un guión como placeholder)
    document.getElementById('totalDocs').textContent = '—';

  } else {
    // --- STATS DEL ADMINISTRADOR ---

    // Contamos cuántos clientes grandes y pequeños hay
    const large = (clients || []).filter(c => c.client_type === 'large').length;
    const small = (clients || []).filter(c => c.client_type === 'small').length;

    // Escribimos los valores en las tarjetas de estadísticas
    document.getElementById('totalClients').textContent = (clients || []).length;
    document.getElementById('largeClients').textContent = large;
    document.getElementById('smallClients').textContent = small;
    document.getElementById('totalDocs').textContent    = (docs || []).length;
  }


  // -----------------------------------------------------------------------
  // 3. DIRECTORIO DE CLIENTES (Búsqueda, Filtro y Paginación)
  // -----------------------------------------------------------------------
  
  // Traemos los datos de los clientes incluyendo ahora correo y teléfono para la columna Contacto
  const { data: allFetchedClients } = await sb.from('profiles')
    .select('full_name, company_name, email, phone, client_type, created_at')
    .eq('role', 'client');

  // Guardamos en memoria y ordenamos alfabéticamente por empresa
  let allClientsData = (allFetchedClients || []).sort((a, b) => {
    const nameA = (a.company_name || '').toLowerCase();
    const nameB = (b.company_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const tbody = document.getElementById('clientsTableBody');
  const searchInput = document.getElementById('clientSearch');
  const filterSelect = document.getElementById('clientFilter');
  const paginationWrap = document.getElementById('paginationWrap');

  let currentPage = 1;
  const itemsPerPage = 10;

  function renderTable() {
    if (!tbody) return;
    
    // 1. Filtrar los datos en base al input y el select
    const term = searchInput ? searchInput.value.toLowerCase() : '';
    const size = filterSelect ? filterSelect.value : 'all';
    
    let filtered = allClientsData.filter(c => {
      const matchSearch = (c.company_name || '').toLowerCase().includes(term) || 
                          (c.full_name || '').toLowerCase().includes(term);
      const matchSize = size === 'all' ? true : (c.client_type === size);
      return matchSearch && matchSize;
    });

    // 2. Paginar la lista filtrada
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(startIdx, startIdx + itemsPerPage);

    // 3. Renderizar las filas de la tabla
    if (filtered.length === 0) {
      // Mensaje cuando no hay resultados. colspan="5" porque ahora tenemos 5 columnas
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--c-muted);padding:24px;">No se encontraron clientes</td></tr>';
    } else {
      tbody.innerHTML = paginated.map(r => {
        // Construimos la celda de contacto: correo + teléfono si existe
        const contacto = '<span style="font-size:0.82rem;color:var(--c-muted);">'
          + (r.email || '—')
          + (r.phone ? '<br>📱 ' + r.phone : '')
          + '</span>';

        return '<tr>'
          + '<td><strong>' + (r.company_name || '—') + '</strong></td>'
          + '<td>' + (r.full_name || '—') + '</td>'
          + '<td>' + contacto + '</td>' // columna de contacto nueva
          + '<td><span class="badge badge--' + (r.client_type === 'large' ? 'large' : 'small') + '">'
          + (r.client_type === 'large' ? 'Grande' : 'Pequeño')
          + '</span></td>'
          + '<td>' + new Date(r.created_at).toLocaleDateString('es-CO') + '</td>'
          + '</tr>';
      }).join('');
    }

    // 4. Renderizar Paginación UI
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!paginationWrap) return;
    
    if (totalPages <= 1) {
      paginationWrap.innerHTML = '';
      return;
    }
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      // Aplicar color de marca si es la página actual
      const isAct = i === currentPage ? 'style="background:var(--c-brand); color:var(--c-white); border-color:var(--c-brand);"' : '';
      html += `<button class="btn btn--outline btn--sm" ${isAct} onclick="goToPage(${i})">${i}</button>`;
    }
    paginationWrap.innerHTML = html;
  }

  // Hacer que \`goToPage\` sea global para que onclick funcione
  window.goToPage = function(page) {
    currentPage = page;
    renderTable();
  };

  // Listener de la caja de búsqueda
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1; // volvemos a la 1 buscando algo
      renderTable();
    });
  }

  // Listener del desplegable de tipo
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      currentPage = 1;
      renderTable();
    });
  }

  // Primer renderizado
  renderTable();

  // -----------------------------------------------------------------------
  // 4. CERRAR SESIÓN
  // -----------------------------------------------------------------------
  // 'logout()' es una función global que sacamos del archivo auth.js
  document.getElementById('logoutBtn').onclick = () => logout();
})();

// -------------------------------------------------------------------------
// 5. MENÚ RESPONSIVE (Celulares y Tablets)
// -------------------------------------------------------------------------
const hbg = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');

// Esta función es un interruptor: Si la clase 'open' está encendida la apaga, y si está apagada la enciende.
function toggleSidebar() {
  sidebar.classList.toggle('open');
  hbg.classList.toggle('open');
  overlay.classList.toggle('show');
}

// Escuchamos el clic tanto en la hamburguesa como en el filtro oscuro atrás.
hbg.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);
