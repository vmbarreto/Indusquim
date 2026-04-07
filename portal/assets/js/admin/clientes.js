/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/clientes.js
 *
 * Objetivo: Cargar y mostrar el directorio de clientes registrados.
 *           Accesible tanto para Administradores como para Comerciales.
 *           La vista es de SOLO LECTURA: nadie puede editar desde aquí.
 *
 * Tecnología: Supabase (base de datos en la nube)
 * Patrón:     IIFE async + funciones auxiliares para búsqueda y paginación
 * =========================================================================
 */

let allClients       = [];
let allCommercials   = [];
let allCatalogItems  = [];
let reassignTarget   = null;
let editCatalogTarget = null;
let isAdmin          = false;
let isCommercial     = false;
let currentProfileId = null;

// =========================================================================
// 1. INICIALIZACIÓN: verificar sesión y cargar datos
//    Se ejecuta automáticamente cuando la página termina de cargar
// =========================================================================
(async () => {

  // Verificamos que quien accede a esta página sea Admin o Comercial
  // Si el usuario no tiene sesión activa o no tiene el rol adecuado,
  // 'requireAdminOrCommercial' lo redirige automáticamente al login
  const profile = await requireAdminOrCommercial();
  if (!profile) return; // Si no hay perfil válido, detenemos la ejecución

  await initNotifications(profile.id);

  isCommercial     = profile.role === 'commercial';
  isAdmin          = profile.role === 'admin';
  currentProfileId = profile.id;
 
  showAdminOnlyContent(profile);

  // ── Personalizar el sidebar según el rol ──────────────────────────────

  // Mostramos el nombre completo del usuario en el footer del sidebar
  document.getElementById('adminName').textContent = profile.full_name || (isCommercial ? 'Comercial' : 'Admin');

  // Mostramos el rol con un color diferenciado para comerciales
  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = isCommercial ? 'Comercial' : 'Administrador';
    // El color lila distingue visualmente al comercial del administrador
    if (isCommercial) roleEl.style.color = '#c084fc';
  }

  // Si es Comercial, ocultamos los enlaces que no le corresponden
  if (isCommercial) {
    // Enlace a "Usuarios" solo es del Admin (crear/eliminar cuentas)
    const linkUsuarios = document.querySelector('.sidebar__nav a[href="usuarios.html"]');
    if (linkUsuarios) linkUsuarios.style.display = 'none';

    // Enlace a "Catálogo" solo es del Admin (gestionar productos)
    const linkCatalogo = document.querySelector('.sidebar__nav a[href="catalogo.html"]');
    if (linkCatalogo) linkCatalogo.style.display = 'none';
  }

  // ── Asignar evento al botón de cerrar sesión ──────────────────────────
  // 'logout()' es una función global definida en auth.js
  document.getElementById('logoutBtn').onclick = () => logout();
  initAudit(profile);

  // ── Cargar comerciales, catálogo y clientes ──────────────────────────
  await loadCommercials();
  await loadCatalogItems();
  await loadClients();

})();

// =========================================================================
// 2. CARGAR COMERCIALES (para lookup de nombres y modal de reasignación)
// =========================================================================
async function loadCommercials() {
  const { data } = await sb.from('profiles')
    .select('id, full_name')
    .eq('role', 'commercial')
    .order('full_name', { ascending: true });

  allCommercials = data || [];

  // Poblar el select del modal de reasignación
  const sel = document.getElementById('reassignSelect');
  allCommercials.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.full_name || 'Sin nombre';
    sel.appendChild(opt);
  });
}

async function loadCatalogItems() {
  const { data } = await sb.from('catalog_items').select('id, title').order('title', { ascending: true });
  allCatalogItems = data || [];
}

function getCommercialName(id) {
  if (!id) return '<span style="color:var(--c-muted);font-size:0.8rem;">Sin asignar</span>';
  const c = allCommercials.find(c => c.id === id);
  return c ? (c.full_name || '—') : '—';
}

// =========================================================================
// 3. CARGAR CLIENTES DESDE SUPABASE
//    Hacemos una consulta a la tabla 'profiles' filtrando por role = 'client'
// =========================================================================
async function loadClients() {

  // Usamos 'sb' que es la instancia de Supabase definida en supabase-client.js
  // Pedimos: nombre, empresa, correo, teléfono, tipo de cliente y fecha de registro
  let query = sb
    .from('profiles')
    .select('id, full_name, company_name, email, phone, client_type, assigned_commercial_id, created_at')
    .eq('role', 'client')
    .order('company_name', { ascending: true });

  // Comercial: solo ve los clientes que tiene asignados
  if (isCommercial) {
    query = query.eq('assigned_commercial_id', currentProfileId);
  }

  const { data, error } = await query;

  // Si hubo un error en la consulta, mostramos el detalle para poder diagnosticarlo
  if (error) {
    showError('Error al cargar los clientes: ' + (error.message || JSON.stringify(error)));
    return;
  }

  // Guardamos los clientes en la variable global para poder filtrarlos luego
  allClients = data || [];

  // Actualizamos las tarjetas de estadísticas con los datos recibidos
  updateStats(allClients);

  // Dibujamos la tabla con todos los clientes
  renderTable(allClients);
}

// =========================================================================
// 3. ACTUALIZAR TARJETAS DE ESTADÍSTICAS
//    Recibe el arreglo de clientes y calcula los totales
// =========================================================================
function updateStats(clients) {
  // Contamos cuántos son de tipo 'large' (grandes)
  const large = clients.filter(c => c.client_type === 'large').length;

  // Contamos cuántos son de tipo 'small' (pequeños)
  const small = clients.filter(c => c.client_type === 'small').length;

  // Escribimos los resultados en los elementos HTML con esos IDs
  document.getElementById('statTotal').textContent = clients.length;
  document.getElementById('statLarge').textContent = large;
  document.getElementById('statSmall').textContent = small;
}

// =========================================================================
// 4. RENDERIZAR LA TABLA DE CLIENTES
//    Recibe un arreglo (puede ser filtrado) y lo convierte en filas HTML
// =========================================================================
let currentPage = 1;          // Página actual de la paginación
const itemsPerPage = 10;      // Cuántos clientes se muestran por página

function renderTable(clients) {
  const tbody = document.getElementById('clientsTable');
  if (!tbody) return; // Seguridad: si el elemento no existe, no hacemos nada

  // Si no hay clientes que mostrar, mostramos un mensaje vacío
  if (clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--c-muted); padding:32px;">No se encontraron clientes.</td></tr>';
    document.getElementById('paginationWrap').innerHTML = '';
    return;
  }

  // Ordenar: grandes primero (A-Z), luego pequeños (A-Z)
  clients = [...clients].sort((a, b) => {
    if (a.client_type !== b.client_type) return a.client_type === 'large' ? -1 : 1;
    return (a.company_name || '').localeCompare(b.company_name || '', 'es');
  });

  // Calculamos el total de páginas necesarias
  const totalPages = Math.ceil(clients.length / itemsPerPage);

  // Nos aseguramos de que la página actual no supere el total (puede pasar al filtrar)
  if (currentPage > totalPages) currentPage = 1;

  // Calculamos qué clientes mostrar en esta página
  const inicio = (currentPage - 1) * itemsPerPage;
  const paginados = clients.slice(inicio, inicio + itemsPerPage);

  // Construimos el HTML de las filas de la tabla
  tbody.innerHTML = paginados.map(c => {

    // Celda de contacto: correo en la primera línea, teléfono en la segunda (si existe)
    const correo = '<span style="font-size:0.82rem; color:var(--c-muted);">' + (c.email || '—') + '</span>';
    const telefono = '<span style="font-size:0.82rem; color:var(--c-muted);">' + (c.phone || '—') + '</span>';

    // Badge del tipo de cliente: colores diferentes para grande vs pequeño
    const tipoBadge =
      '<span class="badge badge--' + (c.client_type === 'large' ? 'large' : 'small') + '">'
      + (c.client_type === 'large' ? 'Grande' : 'Pequeño')
      + '</span>';

    // Fecha de registro formateada al estilo colombiano (DD/MM/AAAA)
    const fecha = new Date(c.created_at).toLocaleDateString('es-CO');

    // Celda de comercial: nombre + botón reasignar (solo para admin)
    const comercialCell = getCommercialName(c.assigned_commercial_id)
      + (isAdmin
        ? ' <button class="btn btn--ghost btn--sm" style="margin-left:6px;font-size:0.72rem;" onclick="openReassign(\'' + c.id + '\',\'' + (c.company_name || '').replace(/'/g, "\\'") + '\',\'' + (c.assigned_commercial_id || '') + '\')">Cambiar</button>'
        : '');

    const catalogBtn = (isAdmin && c.client_type === 'large')
      ? '<button class="btn btn--ghost btn--sm" style="font-size:0.72rem;" onclick="openEditCatalog(\'' + c.id + '\',\'' + (c.company_name || '').replace(/'/g, "\\'") + '\')">Catálogo</button>'
      : '<span style="color:var(--c-muted);font-size:0.75rem;">—</span>';

    return '<tr>'
      + '<td><strong>' + (c.company_name || '—') + '</strong></td>'
      + '<td>' + (c.full_name || '—') + '</td>'
      + '<td>' + correo + '</td>'
      + '<td>' + telefono + '</td>'
      + '<td>' + tipoBadge + '</td>'
      + '<td style="font-size:0.82rem;">' + comercialCell + '</td>'
      + '<td style="font-size:0.8rem;">' + fecha + '</td>'
      + '<td>' + catalogBtn + '</td>'
      + '</tr>';

  }).join(''); // '.join("")' une todas las filas en un solo string HTML

  // Dibujamos los botones de paginación
  renderPagination(totalPages);
}

// =========================================================================
// 5. PAGINACIÓN: genera los botones numéricos debajo de la tabla
// =========================================================================
function renderPagination(totalPages) {
  const wrap = document.getElementById('paginationWrap');
  if (!wrap) return;

  // Si solo hay 1 página, no mostramos paginación
  if (totalPages <= 1) {
    wrap.innerHTML = '';
    return;
  }

  // Construimos un botón por cada página disponible
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    // La página activa recibe el color de marca (azul/brand)
    const esActiva = i === currentPage
      ? 'style="background:var(--c-brand); color:#fff; border-color:var(--c-brand);"'
      : '';
    html += '<button class="btn btn--outline btn--sm" ' + esActiva + ' onclick="irAPagina(' + i + ')">' + i + '</button>';
  }
  wrap.innerHTML = html;
}

// Función global para cambiar de página (se llama desde los onclick de la paginación)
window.irAPagina = function(pagina) {
  currentPage = pagina;
  // Volvemos a renderizar con el filtro actual aplicado
  applyFilters();
};

// =========================================================================
// 6. BÚSQUEDA Y FILTRO EN TIEMPO REAL
//    Combina lo que escribe el usuario con el tipo seleccionado
// =========================================================================
function applyFilters() {
  // Leemos el texto de búsqueda (convertido a minúsculas para evitar problemas de mayúsculas)
  const termino = (document.getElementById('searchInput')?.value || '').toLowerCase();

  // Leemos el tipo seleccionado en el selector desplegable
  const tipo = document.getElementById('filterSelect')?.value || 'all';

  // Filtramos 'allClients' con ambas condiciones
  const resultado = allClients.filter(c => {

    // Verificamos si el texto escrito coincide con empresa o nombre del contacto
    const coincideBusqueda =
      (c.company_name || '').toLowerCase().includes(termino) ||
      (c.full_name    || '').toLowerCase().includes(termino) ||
      (c.email        || '').toLowerCase().includes(termino);

    // Verificamos si el tipo coincide (o si es "all", aceptamos cualquiera)
    const coincideTipo = tipo === 'all' ? true : c.client_type === tipo;

    // Solo pasa el cliente si cumple AMBAS condiciones
    return coincideBusqueda && coincideTipo;
  });

  // Volvemos a la página 1 cuando se cambia el filtro
  currentPage = 1;

  // Redibujamos la tabla con los resultados filtrados
  renderTable(resultado);
}

// Conectamos los eventos de búsqueda y filtro a la función 'applyFilters'
document.getElementById('searchInput')?.addEventListener('input', applyFilters);
document.getElementById('filterSelect')?.addEventListener('change', applyFilters);

// =========================================================================
// 7. ALERTAS (mensajes de éxito o error en pantalla)
// =========================================================================
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

// =========================================================================
// 8. MODAL EDITAR CATÁLOGO DE CLIENTE
// =========================================================================
const editCatalogBackdrop = document.getElementById('editCatalogBackdrop');

window.openEditCatalog = async function(clientId, clientName) {
  editCatalogTarget = clientId;
  document.getElementById('editCatalogClientName').textContent = clientName || '—';
  document.getElementById('editCatalogError').classList.remove('show');

  // Cargar los productos actualmente asignados al cliente
  const { data: assigned } = await sb.from('client_catalog')
    .select('item_id').eq('client_id', clientId);
  const assignedIds = new Set((assigned || []).map(r => r.item_id));

  // Renderizar checklist con los productos del catálogo
  const list = document.getElementById('editCatalogList');
  if (!allCatalogItems.length) {
    list.innerHTML = '<p style="padding:16px;color:var(--c-muted);font-size:0.85rem;">No hay productos en el catálogo.</p>';
  } else {
    list.innerHTML = allCatalogItems.map(p =>
      '<label style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;border-bottom:1px solid var(--c-border);" onmouseover="this.style.background=\'var(--c-bg-alt)\'" onmouseout="this.style.background=\'\'">'
      + '<input type="checkbox" value="' + p.id + '" ' + (assignedIds.has(p.id) ? 'checked' : '') + ' style="width:16px;height:16px;flex-shrink:0;cursor:pointer;" />'
      + '<span style="font-size:0.875rem;">' + p.title + '</span>'
      + '</label>'
    ).join('');
  }

  editCatalogBackdrop.classList.add('open');
};

document.getElementById('closeEditCatalog').onclick  = () => editCatalogBackdrop.classList.remove('open');
document.getElementById('cancelEditCatalog').onclick = () => editCatalogBackdrop.classList.remove('open');

document.getElementById('saveEditCatalog').onclick = async () => {
  if (!editCatalogTarget) return;
  const btn = document.getElementById('saveEditCatalog');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const selectedIds = [...document.querySelectorAll('#editCatalogList input:checked')].map(cb => cb.value);

  // Reemplazar todo el catálogo del cliente: borrar y volver a insertar
  const { error: delErr } = await sb.from('client_catalog').delete().eq('client_id', editCatalogTarget);
  if (delErr) {
    document.getElementById('editCatalogError').textContent = 'Error al actualizar: ' + delErr.message;
    document.getElementById('editCatalogError').classList.add('show');
    btn.textContent = 'Guardar'; btn.disabled = false;
    return;
  }

  if (selectedIds.length > 0) {
    const { error: insErr } = await sb.from('client_catalog').insert(
      selectedIds.map(item_id => ({ client_id: editCatalogTarget, item_id }))
    );
    if (insErr) {
      document.getElementById('editCatalogError').textContent = 'Error al guardar: ' + insErr.message;
      document.getElementById('editCatalogError').classList.add('show');
      btn.textContent = 'Guardar'; btn.disabled = false;
      return;
    }
  }

  const clientName = document.getElementById('editCatalogClientName').textContent;
  await logAudit('Catálogo editado', clientName + ' → ' + selectedIds.length + ' producto' + (selectedIds.length !== 1 ? 's' : ''));

  editCatalogBackdrop.classList.remove('open');
  showSuccess('Catálogo actualizado correctamente.');
  btn.textContent = 'Guardar'; btn.disabled = false;
};

// =========================================================================
// 9. MODAL DE REASIGNACIÓN DE COMERCIAL
// =========================================================================
const reassignBackdrop = document.getElementById('reassignBackdrop');

window.openReassign = function(clientId, clientName, currentCommercialId) {
  reassignTarget = clientId;
  document.getElementById('reassignClientName').textContent = clientName || '—';
  document.getElementById('reassignSelect').value = currentCommercialId || '';
  reassignBackdrop.classList.add('open');
};

document.getElementById('closeReassign').onclick  = () => reassignBackdrop.classList.remove('open');
document.getElementById('cancelReassign').onclick = () => reassignBackdrop.classList.remove('open');

document.getElementById('confirmReassign').onclick = async () => {
  if (!reassignTarget) return;
  const btn = document.getElementById('confirmReassign');
  btn.textContent = 'Guardando…';
  btn.disabled = true;

  const newCommercialId = document.getElementById('reassignSelect').value || null;

  const { error } = await sb.from('profiles')
    .update({ assigned_commercial_id: newCommercialId })
    .eq('id', reassignTarget);

  if (error) {
    showError('Error al reasignar: ' + error.message);
  } else {
    const clientName     = document.getElementById('reassignClientName').textContent || reassignTarget;
    const commercial     = allCommercials.find(c => c.id === newCommercialId);
    const commercialName = commercial?.full_name || 'Sin comercial';
    await logAudit('Comercial reasignado', clientName + ' → ' + commercialName);
    reassignBackdrop.classList.remove('open');
    showSuccess('Comercial reasignado correctamente.');
    await loadClients();
  }

  btn.textContent = 'Guardar';
  btn.disabled = false;
};

// =========================================================================
// 9. MENÚ RESPONSIVE (hamburguesa para móvil y tablet)
// =========================================================================
const hbg     = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');

// Función que abre/cierra el menú lateral en pantallas pequeñas
function toggleSidebar() {
  sidebar.classList.toggle('open');
  hbg.classList.toggle('open');
  overlay.classList.toggle('show');
}

// Al hacer clic en la hamburguesa, alternamos el estado del menú
hbg.addEventListener('click', toggleSidebar);

// Al hacer clic en el área oscura detrás del menú, lo cerramos
overlay.addEventListener('click', toggleSidebar);
