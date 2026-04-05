/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/usuarios.js
 * Objetivo: CRUD (Create, Read, Update, Delete) de usuarios cliente y
 *           comerciales. Conecta con "manage-users" de Supabase Edge Functions.
 * =========================================================================
 */

let allUsers       = [];
let allCommercials = [];

// -------------------------------------------------------------------------
// 1. CARGAR INFORMACIÓN INICIAL Y VERIFICAR PERMISOS
// -------------------------------------------------------------------------
(async () => {
  const profile = await requireAdminOrCommercial();
  if (!profile) return;

  // Si es comercial, no tiene acceso a esta página → lo devolvemos al dashboard
  if (profile.role === 'commercial') {
    window.location.href = 'index.html';
    return;
  }

  await initNotifications(profile.id);

  document.getElementById('adminName').textContent = profile.full_name || 'Admin';

  // Actualizar badge de rol en el sidebar footer
  const roleEl = document.getElementById('userRole');
  if (roleEl) roleEl.textContent = 'Administrador';

  initAudit(profile);
  await loadCommercials();
  await loadUsers();

  document.getElementById('logoutBtn').onclick = () => logout();
})();

// -------------------------------------------------------------------------
// 2. CARGAR LISTA DE COMERCIALES (para el selector del formulario y la tabla)
// -------------------------------------------------------------------------
async function loadCommercials() {
  const { data } = await sb.from('profiles')
    .select('id, full_name')
    .eq('role', 'commercial')
    .order('full_name', { ascending: true });

  allCommercials = data || [];

  const select = document.getElementById('f_commercial');
  allCommercials.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.full_name || 'Sin nombre';
    select.appendChild(opt);
  });
}

// Devuelve el nombre de un comercial por su ID (para la tabla)
function getCommercialName(id) {
  if (!id) return '—';
  const c = allCommercials.find(c => c.id === id);
  return c ? (c.full_name || '—') : '—';
}

// -------------------------------------------------------------------------
// 3. OBTENER Y PINTAR USUARIOS (CLIENTES + COMERCIALES)
// -------------------------------------------------------------------------
async function loadUsers() {
  // Traemos clientes Y comerciales (los admins no aparecen en esta lista)
  const { data } = await sb.from('profiles')
    .select('id, full_name, company_name, email, phone, role, client_type, assigned_commercial_id, created_at')
    .in('role', ['client', 'commercial'])
    .order('role', { ascending: true })
    .order('created_at', { ascending: false });

  allUsers = data || [];
  renderTable(allUsers);
}

// Dibuja la tabla HTML con los datos de los usuarios
function renderTable(users) {
  const tbody = document.getElementById('usersTable');

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--c-muted);padding:32px;">Sin usuarios todavía. Crea el primero.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isCommercial = u.role === 'commercial';

    // Badge de rol: morado para Comercial, azul/verde para Cliente
    const rolBadge = isCommercial
      ? '<span style="background:rgba(138,43,226,0.15);color:#9b59b6;border:1px solid rgba(138,43,226,0.3);border-radius:6px;padding:3px 9px;font-size:0.75rem;white-space:nowrap;">Comercial</span>'
      : '<span class="badge badge--' + (u.client_type === 'large' ? 'large' : 'small') + '">' + (u.client_type === 'large' ? 'Cliente Grande' : 'Cliente Pequeño') + '</span>';

    // Columna de contacto: email + teléfono para comerciales
    const contacto = '<span style="font-size:0.8rem;color:var(--c-muted);">' + (u.email || '—') + '</span>'
      + (isCommercial && u.phone ? '<br><span style="font-size:0.75rem;color:var(--c-muted);">📱 ' + u.phone + '</span>' : '');

    // Acciones: Editar siempre, Reset pwd solo para clientes, Eliminar siempre
    const acciones = '<button class="btn btn--outline btn--sm" onclick="openEditUserModal(\'' + u.id + '\')">Editar</button>'
      + (!isCommercial
        ? ' <button class="btn btn--ghost btn--sm" style="margin-left:4px;" onclick="resetPassword(\'' + u.id + '\')">Reset pwd</button>'
        : '')
      + ' <button class="btn btn--danger btn--sm" style="margin-left:4px;" onclick="deleteUser(\'' + u.id + '\')">Eliminar</button>';

    const empresaCell = isCommercial
      ? '<strong>' + (u.company_name || 'Indusquim') + '</strong>'
      : '<strong>' + (u.company_name || '—') + '</strong>'
        + '<br><span style="font-size:0.75rem;color:var(--c-muted);">👤 ' + getCommercialName(u.assigned_commercial_id) + '</span>';

    return '<tr data-id="' + u.id + '">'
      + '<td>' + empresaCell + '</td>'
      + '<td>' + (u.full_name || '—') + '</td>'
      + '<td>' + contacto + '</td>'
      + '<td>' + rolBadge + '</td>'
      + '<td style="font-size:0.8rem;">' + new Date(u.created_at).toLocaleDateString('es-CO') + '</td>'
      + '<td>' + acciones + '</td>'
      + '</tr>';
  }).join('');
}

// -------------------------------------------------------------------------
// 3. BARRA DE BÚSQUEDA EN TIEMPO REAL
// -------------------------------------------------------------------------
function applyFilters() {
  const q    = document.getElementById('searchInput').value.toLowerCase();
  const tipo = document.getElementById('roleFilter').value;

  const filtrados = allUsers.filter(u => {
    // Filtro por tipo
    if (tipo === 'commercial' && u.role !== 'commercial') return false;
    if (tipo === 'large'      && !(u.role === 'client' && u.client_type === 'large'))  return false;
    if (tipo === 'small'      && !(u.role === 'client' && u.client_type === 'small'))  return false;

    // Filtro por texto
    if (q) {
      return (u.company_name || '').toLowerCase().includes(q)
          || (u.full_name    || '').toLowerCase().includes(q)
          || (u.email        || '').toLowerCase().includes(q);
    }
    return true;
  });

  renderTable(filtrados);
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('roleFilter').addEventListener('change', applyFilters);

// -------------------------------------------------------------------------
// 4. CONTROL DEL MODAL (VENTANA EMERGENTE CREAR USUARIO)
// -------------------------------------------------------------------------
const backdrop = document.getElementById('modalBackdrop');

function openCreateModal() {
  document.getElementById('createForm').reset();
  document.getElementById('createFormError').classList.remove('show');
  // Asegurar required correcto al abrir (estado limpio = cliente por defecto oculto)
  syncCreateFormRequired('');
  backdrop.classList.add('open');
}

document.getElementById('openModal').onclick   = openCreateModal;
document.getElementById('closeModal').onclick  = () => backdrop.classList.remove('open');
document.getElementById('cancelModal').onclick = () => backdrop.classList.remove('open');

// Ajusta required y visibilidad de campos según rol
function syncCreateFormRequired(role) {
  const isCommercial = role === 'commercial';
  const isClient     = role === 'client';

  // Empresa: solo cliente
  document.getElementById('group_company').style.display    = isCommercial ? 'none' : 'block';
  document.getElementById('f_company').required             = isClient;

  // Contraseña: solo cliente
  document.getElementById('group_password').style.display   = isCommercial ? 'none' : 'block';
  document.getElementById('f_password').required            = isClient;

  // Tipo de cliente: solo cliente
  document.getElementById('group_type').style.display       = isCommercial ? 'none' : 'block';
  document.getElementById('f_type').required                = isClient;

  // Comercial asignado: solo cliente
  document.getElementById('group_commercial').style.display = isCommercial ? 'none' : 'block';
  document.getElementById('f_commercial').required          = isClient;

  // Teléfono: siempre visible, obligatorio para comercial
  document.getElementById('f_phone').required               = isCommercial;
}

document.getElementById('f_role').addEventListener('change', (e) => {
  syncCreateFormRequired(e.target.value);
});

// -------------------------------------------------------------------------
// 5. CREAR USUARIO (Método POST vía Edge Function manage-users)
// -------------------------------------------------------------------------
document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitCreate');
  btn.textContent = 'Creando…';
  btn.disabled = true;

  const role         = document.getElementById('f_role').value;
  const name         = document.getElementById('f_name').value.trim();
  const company      = document.getElementById('f_company').value.trim();
  const email        = document.getElementById('f_email').value.trim();
  let password       = document.getElementById('f_password').value;
  const type         = document.getElementById('f_type').value;
  let phone          = document.getElementById('f_phone').value.trim();
  const commercialId = document.getElementById('f_commercial').value || null;

  let generatedPin = null;

  if (role === 'commercial') {
    // Forzar el prefijo +57
    phone = '+57' + phone.replace(/^\+?57/, '').replace(/\D/g, '');
    // PIN aleatorio de 6 dígitos como contraseña temporal
    generatedPin = Math.floor(100000 + Math.random() * 900000).toString();
    password = generatedPin;
  }

  try {
    // Necesitamos la sesión activa para autorizar la llamada al backend
    const { data: { session } } = await sb.auth.getSession();

    const res = await fetch(SUPABASE_URL + '/functions/v1/manage-users', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create',
        email,
        password,
        full_name: name,
        company_name: role === 'client' ? company : 'Indusquim',
        client_type: role === 'client' ? type : null,
        role,
        phone: phone || null
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error desconocido');

    // Forzar rol y datos en profiles (la Edge Function puede ignorar el rol)
    if (result.user?.id) {
      const profileFix = { role };
      if (role === 'commercial') {
        profileFix.company_name = 'Indusquim';
        if (phone) profileFix.phone = phone;
      }
      if (role === 'client') {
        profileFix.client_type = type;
        if (commercialId) profileFix.assigned_commercial_id = commercialId;
      }
      await sb.from('profiles').update(profileFix).eq('id', result.user.id);
    }

    // Éxito: si es comercial, mostramos el PIN al admin para que se lo comparta
    if (role === 'commercial') {
      alert(
        '¡COMERCIAL CREADO EXITOSAMENTE!\n\n' +
        'El PIN de acceso temporal es: ' + generatedPin + '\n\n' +
        'Por favor, entrégale este PIN a ' + name + ' junto con su teléfono (' + phone + ') o correo (' + email + ') ' +
        'para que pueda iniciar sesión en el portal.'
      );
      await logAudit('Comercial creado', name + ' (' + email + ')');
      showSuccess('Comercial creado exitosamente.');
    } else {
      await logAudit('Cliente creado', name + ' — ' + company + ' (' + email + ')');
      showSuccess('Usuario creado exitosamente.');
    }

    backdrop.classList.remove('open');
    document.getElementById('createForm').reset();
    syncCreateFormRequired('');
    await loadUsers();

  } catch (err) {
    showModalError('createFormError', err.message.includes('already') || err.message.includes('exist')
      ? 'Este correo ya está registrado. Usa otro correo electrónico.'
      : 'Error al crear usuario: ' + err.message);
  }

  btn.textContent = 'Crear usuario';
  btn.disabled = false;
});

// -------------------------------------------------------------------------
// 6. ELIMINAR USUARIO
// -------------------------------------------------------------------------
window.deleteUser = async function(id) {
  if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;

  try {
    const { data: { session } } = await sb.auth.getSession();

    const res = await fetch(SUPABASE_URL + '/functions/v1/manage-users', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'delete', userId: id })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error desconocido');

    const deleted = allUsers.find(u => u.id === id);
    await logAudit('Usuario eliminado', (deleted?.full_name || '—') + ' (' + (deleted?.email || id) + ')');
    await loadUsers();
    showSuccess('Usuario eliminado correctamente.');

  } catch (err) {
    showError('Error al eliminar usuario: ' + err.message);
  }
};

// -------------------------------------------------------------------------
// 7. RESTABLECER CONTRASEÑA (Solo para clientes con email)
// -------------------------------------------------------------------------
window.resetPassword = async function(id) {
  const { data } = await sb.from('profiles').select('email, company_name').eq('id', id).single();
  if (!data?.email) {
    showError('Este cliente no tiene correo registrado.');
    return;
  }

  const { error } = await sb.auth.resetPasswordForEmail(data.email, {
    redirectTo: SITE_URL + '/portal/login.html'
  });

  if (error) {
    showError('No se pudo enviar el correo: ' + error.message);
  } else {
    await logAudit('Contraseña restablecida', data.email + (data.company_name ? ' — ' + data.company_name : ''));
    showSuccess('Correo de restablecimiento enviado a ' + data.email + '.');
  }
};

// -------------------------------------------------------------------------
// 8. EDITAR USUARIO
// -------------------------------------------------------------------------
const editUserBackdrop = document.getElementById('editUserBackdrop');

window.openEditUserModal = function(id) {
  const u = allUsers.find(u => u.id === id);
  if (!u) return;

  const isCommercial = u.role === 'commercial';

  document.getElementById('eu_id').value      = u.id;
  document.getElementById('eu_role').value    = u.role;
  document.getElementById('eu_name').value    = u.full_name || '';
  document.getElementById('eu_company').value = u.company_name || '';
  document.getElementById('eu_phone').value   = (u.phone || '').replace(/^\+?57/, '');
  document.getElementById('eu_type').value    = u.client_type || 'small';
  document.getElementById('eu_email').value   = u.email || '';

  // Repoblar el select de comerciales y marcar el actual
  const sel = document.getElementById('eu_commercial');
  sel.innerHTML = '<option value="">Sin asignar</option>';
  allCommercials.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.full_name || 'Sin nombre';
    sel.appendChild(opt);
  });
  sel.value = u.assigned_commercial_id || '';

  // Mostrar/ocultar campos según rol
  document.getElementById('eu_group_company').style.display    = isCommercial ? 'none' : 'block';
  document.getElementById('eu_group_phone').style.display      = isCommercial ? 'block' : 'none';
  document.getElementById('eu_group_type').style.display       = isCommercial ? 'none' : 'block';
  document.getElementById('eu_group_commercial').style.display = isCommercial ? 'none' : 'block';

  editUserBackdrop.classList.add('open');
};

document.getElementById('closeEditUser').onclick  = () => editUserBackdrop.classList.remove('open');
document.getElementById('cancelEditUser').onclick = () => editUserBackdrop.classList.remove('open');

document.getElementById('editUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitEditUser');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const id   = document.getElementById('eu_id').value;
  const role = document.getElementById('eu_role').value;

  const updates = {
    full_name: document.getElementById('eu_name').value.trim()
  };

  if (role === 'client') {
    updates.company_name           = document.getElementById('eu_company').value.trim();
    updates.client_type            = document.getElementById('eu_type').value;
    updates.assigned_commercial_id = document.getElementById('eu_commercial').value || null;
  } else {
    let phone = document.getElementById('eu_phone').value.trim();
    if (phone) phone = '+57' + phone.replace(/^\+?57/, '').replace(/\D/g, '');
    updates.phone = phone || null;
  }

  const { error } = await sb.from('profiles').update(updates).eq('id', id);

  if (error) {
    showModalError('editUserError', 'Error al actualizar: ' + error.message);
  } else {
    const u = allUsers.find(u => u.id === id);
    const roleLabel = role === 'commercial' ? 'Comercial' : 'Cliente';
    await logAudit('Usuario actualizado', roleLabel + ': ' + (updates.full_name || u?.full_name || id));
    showSuccess('Usuario actualizado correctamente.');
    editUserBackdrop.classList.remove('open');
    await loadUsers();
  }

  btn.textContent = 'Guardar cambios'; btn.disabled = false;
});

// -------------------------------------------------------------------------
// 9. ALERTAS Y MENÚ MÓVIL
// -------------------------------------------------------------------------
function showModalError(modalErrorId, msg) {
  const el = document.getElementById(modalErrorId);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => el.classList.remove('show'), 7000);
}

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

const hbg     = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');

function toggleSidebar() {
  sidebar.classList.toggle('open');
  hbg.classList.toggle('open');
  overlay.classList.toggle('show');
}
hbg.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);
