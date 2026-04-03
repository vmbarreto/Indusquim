/**
 * =========================================================================
 * ARCHIVO: assets/js/admin/usuarios.js
 * Objetivo: CRUD (Create, Read, Update, Delete) de usuarios cliente y
 *           comerciales. Conecta con "manage-users" de Supabase Edge Functions.
 * =========================================================================
 */

let allUsers = []; // Aquí guardaremos todos los usuarios para poder filtrarlos

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

  document.getElementById('adminName').textContent = profile.full_name || 'Admin';

  // Actualizar badge de rol en el sidebar footer
  const roleEl = document.getElementById('userRole');
  if (roleEl) roleEl.textContent = 'Administrador';

  await loadUsers(); // Cargar la tabla de usuarios al inicio

  document.getElementById('logoutBtn').onclick = () => logout();
})();

// -------------------------------------------------------------------------
// 2. OBTENER Y PINTAR USUARIOS (CLIENTES + COMERCIALES)
// -------------------------------------------------------------------------
async function loadUsers() {
  // Traemos clientes Y comerciales (los admins no aparecen en esta lista)
  const { data } = await sb.from('profiles')
    .select('id, full_name, company_name, email, phone, role, client_type, created_at')
    .in('role', ['client', 'commercial'])  // Ambos tipos de usuario
    .order('role', { ascending: true })    // Primero comerciales, luego clientes
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

    // Acciones: solo "Reset pwd" aplica para clientes (usan email/contraseña)
    const acciones = (!isCommercial
      ? '<button class="btn btn--ghost btn--sm" onclick="resetPassword(\'' + u.id + '\')">Reset pwd</button>'
      : '')
      + '<button class="btn btn--danger btn--sm" style="margin-left:6px;" onclick="deleteUser(\'' + u.id + '\')">Eliminar</button>';

    return '<tr data-id="' + u.id + '">'
      + '<td><strong>' + (isCommercial ? '—' : (u.company_name || '—')) + '</strong></td>'
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
document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();

  // Filtramos por empresa, nombre o correo
  const filtrados = allUsers.filter(u =>
    (u.company_name || '').toLowerCase().includes(q) ||
    (u.full_name    || '').toLowerCase().includes(q) ||
    (u.email        || '').toLowerCase().includes(q)
  );

  renderTable(filtrados);
});

// -------------------------------------------------------------------------
// 4. CONTROL DEL MODAL (VENTANA EMERGENTE CREAR USUARIO)
// -------------------------------------------------------------------------
const backdrop = document.getElementById('modalBackdrop');
document.getElementById('openModal').onclick   = () => backdrop.classList.add('open');
document.getElementById('closeModal').onclick  = () => backdrop.classList.remove('open');
document.getElementById('cancelModal').onclick = () => backdrop.classList.remove('open');

// -------------------------------------------------------------------------
// 4.5. FORMULARIO DINÁMICO SEGÚN ROL SELECCIONADO
// Cuando el admin elige "Comercial", el formulario cambia:
//   - Desaparece "Empresa" y "Contraseña" (el PIN se genera automático)
//   - Aparece el campo de "Teléfono"
// -------------------------------------------------------------------------
document.getElementById('f_role').addEventListener('change', (e) => {
  const isCommercial = e.target.value === 'commercial';

  document.getElementById('group_company').style.display  = isCommercial ? 'none'  : 'block';
  document.getElementById('group_phone').style.display    = isCommercial ? 'block' : 'none';
  document.getElementById('group_password').style.display = isCommercial ? 'none'  : 'block';
  document.getElementById('group_type').style.display     = isCommercial ? 'none'  : 'block';

  // Actualizamos los 'required' para que HTML no bloquee el envío innecesariamente
  document.getElementById('f_company').required  = !isCommercial;
  document.getElementById('f_password').required = !isCommercial;
});

// -------------------------------------------------------------------------
// 5. CREAR USUARIO (Método POST vía Edge Function manage-users)
// -------------------------------------------------------------------------
document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitCreate');
  btn.textContent = 'Creando…';
  btn.disabled = true;

  const role    = document.getElementById('f_role').value;
  const name    = document.getElementById('f_name').value.trim();
  const company = document.getElementById('f_company').value.trim();
  const email   = document.getElementById('f_email').value.trim();
  let password  = document.getElementById('f_password').value;
  const type    = document.getElementById('f_type').value;
  let phone     = document.getElementById('f_phone').value.trim();

  let generatedPin = null;

  if (role === 'commercial') {
    // Validar que el teléfono esté presente
    if (!phone) {
      showError('El teléfono es obligatorio para los comerciales.');
      btn.textContent = 'Crear usuario';
      btn.disabled = false;
      return;
    }
    // Forzar el prefijo +57. Si el usuario ya lo puso, lo limpiamos primero.
    phone = '+57' + phone.replace(/^\+?57/, '').replace(/\D/g, '');

    // Generamos un PIN numérico aleatorio de 6 dígitos → será la contraseña temporal
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
        company_name: company,
        client_type: type,
        role,
        phone: phone || null
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error desconocido');

    // Éxito: si es comercial, mostramos el PIN al admin para que se lo comparta
    if (role === 'commercial') {
      alert(
        '¡COMERCIAL CREADO EXITOSAMENTE!\n\n' +
        'El PIN de acceso temporal es: ' + generatedPin + '\n\n' +
        'Por favor, entrégale este PIN a ' + name + ' junto con su teléfono (' + phone + ') o correo (' + email + ') ' +
        'para que pueda iniciar sesión en el portal.'
      );
      showSuccess('Comercial creado exitosamente.');
    } else {
      showSuccess('Usuario creado exitosamente.');
    }

    backdrop.classList.remove('open');
    document.getElementById('createForm').reset();

    // Reset visual del formulario al estado de "Cliente"
    document.getElementById('group_company').style.display  = 'block';
    document.getElementById('group_phone').style.display    = 'none';
    document.getElementById('group_password').style.display = 'block';
    document.getElementById('group_type').style.display     = 'block';

    await loadUsers(); // Refrescar la tabla

  } catch (err) {
    showError('Error al crear usuario: ' + err.message);
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
    showSuccess('Correo de restablecimiento enviado a ' + data.email + '.');
  }
};

// -------------------------------------------------------------------------
// 8. ALERTAS Y MENÚ MÓVIL
// -------------------------------------------------------------------------
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
