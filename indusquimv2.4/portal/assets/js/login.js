/**
 * =========================================================================
 * ARCHIVO JAVASCRIPT: login.js
 * Objetivo: Manejar toda la lógica de validación e interacciones para
 *           autenticación, recuperación y actualización de contraseña.
 * =========================================================================
 */

// -------------------------------------------------------------------------
// 1. CONFIGURACIÓN PRINCIPAL
// -------------------------------------------------------------------------

// Esta constante guarda la ruta principal hacia nuestra página en producción.
// Declarar variables de sistema juntas (como "SITE_URL") facilita que en un futuro las podamos cambiar.
const SITE_URL = 'https://indusquim.vmbarreto-pro.workers.dev';

// -------------------------------------------------------------------------
// 2. FUNCIONES DE AYUDA (HELPER FUNCTIONS)
// Sirven para reciclar código, cumplir el principio "DRY" (Don't Repeat Yourself).
// -------------------------------------------------------------------------

/**
 * Función que permite mostrar un formulario y ocultar el resto.
 * Entiende los arrays: Le damos los IDs de todos los formularios, los recorre
 * con '.forEach()' y solo deja visible ('block') el que pedimos ('formId').
 */
function showForm(formId) {
  ['loginForm','forgotForm','resetForm'].forEach(id => {
    document.getElementById(id).style.display = id === formId ? 'block' : 'none';
  });
}

/** 
 * Mostrar mensajes de ERROR al usuario en un cuadrito rojo (o del color que CSS defina)
 */
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg; 
  el.classList.add('show'); // Añade la clase 'show' para que aparezca
  document.getElementById('successMsg').classList.remove('show'); // Esconde el éxito si existe
}

/** 
 * Mostrar mensajes de ÉXITO al usuario
 */
function showSuccess(msg) {
  const el = document.getElementById('successMsg');
  el.textContent = msg; 
  el.classList.add('show');
  document.getElementById('errorMsg').classList.remove('show');
}

/**
 * Función para crear la interactividad del botón de "Mostrar/Ocultar" contraseña (El icono del ojito).
 * Permite que, al hacer clic, el type del <input> cambie de 'password' a 'text'.
 */
function setupToggle(btnId, inputId, iconId) {
  document.getElementById(btnId).addEventListener('click', () => {
    const input = document.getElementById(inputId);
    const icon  = document.getElementById(iconId);
    
    // Verificamos si actualmente es "password" o "text"
    const isShowing = input.type === 'password';
    input.type = isShowing ? 'text' : 'password'; // 'text' lo hace visible

    // Cambiamos el dibujito del SVG a un ojito abierto o cerrado según el estado
    icon.innerHTML = isShowing
      ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    
    // Opcional: agregamos una clase para darle estilo CSS al botón cuando esté activo
    document.getElementById(btnId).classList.toggle('active', isShowing);
  });
}

// Vinculamos (Inicializamos) las interacciones visuales
setupToggle('pwdToggle',  'password',    'eyeIcon');
setupToggle('pwdToggle2', 'newPassword', 'eyeIcon2');


// -------------------------------------------------------------------------
// 3. EVENTOS CARGADOS AUTOMÁTICAMENTE AL PRINCIPIO
// -------------------------------------------------------------------------

/*
  ¿Qué pasa si el usuario acaba de llegar de darle clic al enlace "recuperar contraseña" en su correo?
  Supabase detecta esa acción en la URL con una sesión temporal.
  Escuchamos ese evento: si es de tipo 'PASSWORD_RECOVERY', le mostramos de una vez 
  el formulario para que escriba su "Nueva Contraseña".
*/
sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    document.getElementById('loginSub').textContent = 'Elige tu nueva contraseña';
    showForm('resetForm');
  }
});

/*
  Verificamos si "ya había iniciado sesión antes". Si así es, 
  ¿Para qué obligarlo a loguearse de nuevo? ¡Lo mandamos a index de forma automática!
  A menos que venga con un token de 'type=recovery', en ese caso debe quedarse a cambiar contraseña.
*/
sb.auth.getSession().then(({ data: { session } }) => {
  const hash = window.location.hash;
  if (session && !hash.includes('type=recovery')) {
    window.location.href = 'index.html'; // index.html será el encargado de decirle "ve a tu panel respectivo"
  }
});


// -------------------------------------------------------------------------
// 4. LÓGICA DE FORMULARIOS AL PRESIONAR "ENVIAR" (addEventListener('submit'))
// -------------------------------------------------------------------------

/* --- 4.1 ENVÍO: LOGIN NORMAL --- */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  // e.preventDefault() -> Evita que la página "parpadee" (se recargue). Tomamos nosotros el control con JS!
  e.preventDefault(); 
  
  const btn = document.getElementById('submitBtn');
  btn.textContent = 'Ingresando...'; 
  btn.disabled = true; // Desactivar el botón evita que la persona le dé clics desesperadamente
  document.getElementById('errorMsg').classList.remove('show');

  const inputStr = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  let authPayload = {};
  
  // Si contiene solo números (y opcionalmente empieza con +), lo tratamos como teléfono
  const isPhone脱 = /^[+\d]+$/.test(inputStr) && inputStr.replace(/\D/g, '').length >= 7;
  
  if (isPhone脱) {
    let phoneNum = inputStr;
    if (!phoneNum.startsWith('+')) {
      // Si no tiene prefijo, inyectamos el +57 como pidió el usuario
      if (phoneNum.startsWith('57') && phoneNum.length > 10) {
        phoneNum = '+' + phoneNum;
      } else {
        phoneNum = '+57' + phoneNum;
      }
    }
    authPayload = { phone: phoneNum, password };
  } else {
    authPayload = { email: inputStr, password };
  }

  try {
    const { error } = await sb.auth.signInWithPassword(authPayload);
    if (error) throw error; // Si la base de datos devuelve error, nosotros saltamos forzadamente directo al bloque Catch 👇
    
    // Si todo va bien, vamos a la zona de redirección (index.html), donde lo distribuirán a su panel.
    window.location.href = 'index.html';

  } catch (err) {
    // Si la contraseña estuvo mal, lo analizamos evaluando el tipo de error
    if (err.message?.includes('Email not confirmed')) {
      showError('Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.');
    } else if (err.message?.includes('Usuario no encontrado')) {
      showError('Usuario no encontrado. Verifica tu nombre de usuario.');
    } else {
      showError('Credenciales incorrectas. Verifica tu correo y contraseña.');
    }
    // Restauramos el botón
    btn.textContent = 'Ingresar al portal'; 
    btn.disabled = false;
  }
});

/* --- 4.2 INTERFAZ: CAMBIAR ENTRE FORMULARIOS --- */
document.getElementById('forgotLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('loginSub').textContent = 'Te enviaremos un enlace a tu correo';
  document.getElementById('errorMsg').classList.remove('show');
  showForm('forgotForm'); // Esconde el Login, Muestra el Recovery
});

document.getElementById('backToLogin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('loginSub').textContent = 'Ingresa tus credenciales para continuar';
  document.getElementById('errorMsg').classList.remove('show');
  showForm('loginForm'); // Vuelve al inicio original
});

/* --- 4.3 ENVÍO: BOTÓN DE ENVIAR CORREO PARA REESTABLECER CONTRASEÑA --- */
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('recoverBtn');
  const email = document.getElementById('recoverEmail').value.trim();
  btn.textContent = 'Enviando...'; 
  btn.disabled = true;

  // Supabase hace la magia de generar un token, enviarlo por correo y decirle 
  // 'cuando des click al link, regresa exactamente a esta misma página'
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: SITE_URL + '/portal/login.html'
  });

  if (error) {
    showError('No se pudo enviar el correo. Verifica la dirección e intenta de nuevo.');
  } else {
    showSuccess('Correo enviado. Revisa tu bandeja de entrada y sigue el enlace.');
  }
  
  // Regresamos el estado botón 
  btn.textContent = 'Enviar enlace de recuperación'; 
  btn.disabled = false;
});

/* --- 4.4 ENVÍO: CAMBIO DE CONTRASEÑA (DESPUÉS DEL LINK AL CORREO) --- */
document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn      = document.getElementById('resetBtn');
  const newPwd   = document.getElementById('newPassword').value;
  const confirm  = document.getElementById('confirmPassword').value;

  // Validaciones sencillas antes de enviar datos al servidor
  if (newPwd !== confirm) { 
    showError('Las contraseñas no coinciden. Verifícalas y vuelve a intentar.'); 
    return; 
  }

  btn.textContent = 'Guardando...'; 
  btn.disabled = true;

  // Le cambiamos la contraseña al usuario en la sesión actual tokenizada
  const { error } = await sb.auth.updateUser({ password: newPwd });
  
  if (error) {
    showError('Error al actualizar la contraseña: ' + error.message);
    btn.textContent = 'Guardar nueva contraseña'; 
    btn.disabled = false;
  } else {
    showSuccess('¡Contraseña actualizada con éxito! Redirigiendo a tu panel...');
    // Damos un tiempecito (1.5 segundos) para que lea el mensaje éxito antes del salto
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
  }
});
