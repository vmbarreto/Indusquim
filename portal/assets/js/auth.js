// ─── Auth helpers ───────────────────────────────────────────────

// Obtiene el perfil del usuario autenticado
async function getProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
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

// Login con email y contraseña
async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Logout
async function logout() {
  await sb.auth.signOut();
  window.location.href = '../login.html';
}

// Mostrar nombre de usuario en la UI
async function renderUserName(selector = '#userName') {
  const profile = await getProfile();
  const el = document.querySelector(selector);
  if (el && profile) el.textContent = profile.full_name || profile.company_name || 'Usuario';
}
