/**
 * =========================================================================
 * ARCHIVO JAVASCRIPT: index.js
 * Objetivo:  Consultar al servidor si el usuario está logueado y, en base 
 *            a su rol, redirigirlo a la pantalla correcta.
 * =========================================================================
 */

/* 
  Usamos una IIFE (Immediately Invoked Function Expression) asíncrona.
  Esto es simplemente una función que se ejecuta a sí misma tan pronto 
  como el navegador la lee y permite el uso de 'await'.
  Se lee como: (async function() { ... })()
*/
(async () => {
  try {
    // 1. Preguntamos a Supabase (nuestro backend) si existe un usuario activo en sesión
    const { data: { user } } = await sb.auth.getUser();
    
    // Si no hay usuario, significa que no ha iniciado sesión. Lo mandamos al login.
    if (!user) { 
      window.location.href = 'login.html'; 
      return; // El return hace que el código se frene aquí.
    }

    // 2. Si el usuario existe, buscamos su perfil detallado en la Base de Datos.
    // 'sb' es la variable global que creamos en supabase-client.js
    const { data: profile } = await sb.from('profiles')
      .select('role, client_type') // Queremos saber qué rol tiene y el tipo de cliente
      .eq('id', user.id)           // Condición: el "id" del perfil debe ser el "id" del usuario
      .single();                   // Nos asegura que devolverá un solo registro

    // Si por alguna extraña razón no hay perfil, cerramos su sesión por seguridad y lo echamos al login.
    if (!profile) { 
      await sb.auth.signOut(); 
      window.location.href = 'login.html'; 
      return; 
    }

    // 3. Tomamos decisiones en base a los datos obtenidos (Routing / Enrutamiento)
    if (profile.role === 'admin' || profile.role === 'commercial') {
      // Si el rol es "Administrador" o "Comercial", lo mandamos al panel de control principal (que se adapta según el rol)
      window.location.href = 'admin/index.html';

    } else if (profile.client_type === 'large') {
      // Si no es admin, pero es de tipo cliente grande ("large"), va a esa vista específica
      window.location.href = 'cliente/grande.html';

    } else {
      // Si no es ninguno de los anteriores, por descarte, va a la pantalla de cliente pequeño
      window.location.href = 'cliente/pequeno.html';
    }

  } catch (error) {
    // Es buena práctica capturar errores por si el servidor falla
    console.error("Error validando el usuario:", error);
    window.location.href = 'login.html';
  }
})();
