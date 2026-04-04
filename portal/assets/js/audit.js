/**
 * audit.js — Registro de auditoría centralizado
 *
 * Uso:
 *   1. Llamar initAudit(profile) al inicializar cada página admin.
 *   2. Llamar logAudit('Acción', 'Detalle del cambio') tras cada operación exitosa.
 *
 * La tabla audit_log en Supabase solo tiene políticas de SELECT e INSERT.
 * Ningún rol puede eliminar ni editar registros vía cliente JS.
 */

let _auditProfile = null;

/**
 * Inicializa el módulo con el perfil del usuario autenticado.
 * Debe llamarse una vez por página, después de obtener el perfil.
 */
function initAudit(profile) {
  _auditProfile = profile;
}

/**
 * Registra una acción en el historial de auditoría.
 * Si falla, no interrumpe el flujo principal (try/catch silencioso).
 *
 * @param {string} action  — Acción realizada (ej. "Producto creado")
 * @param {string} details — Detalle adicional (ej. "Jabón Industrial · Limpieza")
 */
async function logAudit(action, details) {
  if (!_auditProfile) return;
  try {
    await sb.from('audit_log').insert({
      user_id:   _auditProfile.id,
      user_name: _auditProfile.full_name || 'Desconocido',
      action,
      details: details || null
    });
  } catch (_) {
    // Nunca dejar que un fallo de auditoría interrumpa la operación principal
  }
}
