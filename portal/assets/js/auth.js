// ─── Auth helpers ───────────────────────────────────────────────
// Fix FOUC inmediato: Intentamos aplicar clases de visibilidad desde el inicio usando caché
(function() {
  const cachedRole = sessionStorage.getItem('userRole');
  if (cachedRole === 'admin') document.body.classList.add('role-admin');
  else if (cachedRole === 'commercial') document.body.classList.add('role-commercial');
})();

// Obtiene el perfil del usuario autenticado
async function getProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    sessionStorage.removeItem('userRole');
    return null;
  }
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  
  if (data && data.role) {
    sessionStorage.setItem('userRole', data.role);
    // Asegurar que la clase del body esté sincronizada con el servidor
    if (data.role === 'admin') document.body.classList.add('role-admin');
    else document.body.classList.remove('role-admin');
  }
  
  return data;
}

// Redirige si no hay sesión activa
async function requireAuth(redirectTo = '../login.html') {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.href = redirectTo; return null; }
  return user;
}

// Redirige si no es admin
async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    window.location.href = '../login.html';
    return null;
  }
  return profile;
}

// Redirige si no es admin ni comercial
async function requireAdminOrCommercial() {
  const profile = await getProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'commercial')) {
    window.location.href = '../login.html';
    return null;
  }
  return profile;
}

// Login con email y contraseña
async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Logout
async function logout() {
  sessionStorage.removeItem('userRole');
  await sb.auth.signOut();
  window.location.href = '../login.html';
}

// Mostrar nombre de usuario en la UI
async function renderUserName(selector = '#userName') {
  const profile = await getProfile();
  const el = document.querySelector(selector);
  if (el && profile) el.textContent = profile.full_name || profile.company_name || 'Usuario';
}
// Muestra elementos que solo el administrador debe ver
function showAdminOnlyContent(profile) {
  if (!profile) return;
  
  if (profile.role === 'admin') {
    document.body.classList.add('role-admin');
  } else {
    document.body.classList.remove('role-admin');
    // Para comerciales, nos aseguramos de que los elementos sigan ocultos
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => el.style.display = 'none');
  }
}
