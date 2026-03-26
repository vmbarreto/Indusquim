/**
 * INDUSQUIM — Main JavaScript
 * Interacciones: header scroll, menú móvil, contador animado,
 * AOS, scroll suave, scroll-to-top, formulario, nav activo
 */

'use strict';

/* ─────────────────────────────────────────
   Utilidades
───────────────────────────────────────── */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const onReady = (fn) => {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
};

/* ─────────────────────────────────────────
   1. AOS — Animate On Scroll
───────────────────────────────────────── */
function initAOS() {
  if (typeof AOS === 'undefined') return;
  AOS.init({
    duration: 700,
    easing: 'ease-out-cubic',
    once: true,
    offset: 60,
    delay: 0,
  });
}

/* ─────────────────────────────────────────
   2. Header — scroll effect
───────────────────────────────────────── */
function initHeader() {
  const header = $('#header');
  if (!header) return;

  let lastScroll = 0;

  const onScroll = () => {
    const y = window.scrollY;

    // Clase scrolled
    header.classList.toggle('scrolled', y > 20);

    // Ocultar/mostrar header en scroll (solo móvil hacia abajo)
    if (window.innerWidth <= 768) {
      if (y > lastScroll && y > 80) {
        header.style.transform = 'translateY(-100%)';
      } else {
        header.style.transform = '';
      }
    } else {
      header.style.transform = '';
    }

    lastScroll = y;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ─────────────────────────────────────────
   3. Menú móvil — hamburguesa
───────────────────────────────────────── */
function initMobileMenu() {
  const burger = $('#burgerBtn');
  const nav    = $('#mainNav');
  if (!burger || !nav) return;

  const close = () => {
    burger.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
    document.body.style.overflow = '';
  };

  burger.addEventListener('click', () => {
    const isOpen = burger.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      close();
    } else {
      burger.setAttribute('aria-expanded', 'true');
      nav.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  });

  // Cerrar al hacer click en un enlace
  $$('.nav__link', nav).forEach(link => {
    link.addEventListener('click', close);
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!burger.contains(e.target) && !nav.contains(e.target)) {
      close();
    }
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Cerrar al redimensionar a desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) close();
  });
}

/* ─────────────────────────────────────────
   4. Navegación activa por sección visible
───────────────────────────────────────── */
function initActiveNav() {
  const sections = $$('section[id]');
  const navLinks = $$('.nav__link');
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.getAttribute('id');
        navLinks.forEach((link) => {
          const href = link.getAttribute('href');
          link.classList.toggle('active', href === `#${id}`);
        });
      });
    },
    { rootMargin: '-40% 0px -50% 0px' }
  );

  sections.forEach((s) => observer.observe(s));
}

/* ─────────────────────────────────────────
   5. Contador animado — Stats
───────────────────────────────────────── */
function initCounters() {
  const counters = $$('.stats__number[data-target]');
  if (!counters.length) return;

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const DURATION = 2000;

  const animate = (el, target) => {
    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / DURATION, 1);
      const current = Math.round(easeOut(progress) * target);
      el.textContent = current;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        if (isNaN(target)) return;
        animate(el, target);
        observer.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((c) => observer.observe(c));
}

/* ─────────────────────────────────────────
   6. Scroll suave para anclas internas
───────────────────────────────────────── */
function initSmoothScroll() {
  $$('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const target = $(id);
      if (!target) return;

      e.preventDefault();

      const headerHeight = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--header-height') || '72',
        10
      );
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

/* ─────────────────────────────────────────
   7. Botón scroll-to-top
───────────────────────────────────────── */
function initScrollTop() {
  // Crear el botón dinámicamente
  const btn = document.createElement('button');
  btn.className = 'scroll-top';
  btn.setAttribute('aria-label', 'Volver al inicio');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M18 15l-6-6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ─────────────────────────────────────────
   8. Formulario de contacto
───────────────────────────────────────── */
function initContactForm() {
  const form = $('.contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name    = $('#name', form)?.value.trim();
    const company = $('#company', form)?.value.trim();
    const phone   = $('#phone', form)?.value.trim();

    if (!name || !company || !phone) {
      showFormMessage(form, 'Por favor completa los campos obligatorios.', 'error');
      return;
    }

    const sector  = $('#sector', form)?.value || '';
    const message = $('#message', form)?.value.trim() || '';

    // Construir mensaje para WhatsApp
    const lines = [
      `*Nueva consulta desde indusquim.co*`,
      ``,
      `👤 *Nombre:* ${name}`,
      `🏢 *Empresa:* ${company}`,
      `📞 *Teléfono:* ${phone}`,
      sector  ? `🏭 *Sector:* ${sector}` : '',
      message ? `💬 *Mensaje:* ${message}` : '',
    ].filter(Boolean).join('\n');

    const waURL = `https://wa.me/573000000000?text=${encodeURIComponent(lines)}`;

    // Feedback visual
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = '¡Enviando...';
      submitBtn.disabled = true;
    }

    setTimeout(() => {
      showFormMessage(form, '¡Listo! Te redirigimos a WhatsApp para completar tu solicitud.', 'success');
      setTimeout(() => {
        window.open(waURL, '_blank', 'noopener,noreferrer');
        form.reset();
        if (submitBtn) {
          submitBtn.textContent = 'Enviar solicitud';
          submitBtn.disabled = false;
        }
      }, 800);
    }, 600);
  });
}

function showFormMessage(form, text, type) {
  // Remover mensaje anterior si existe
  const prev = $('.form-message', form.parentElement);
  if (prev) prev.remove();

  const msg = document.createElement('p');
  msg.className = 'form-message';
  msg.textContent = text;
  msg.style.cssText = `
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    margin-top: 0.5rem;
    background: ${type === 'success' ? '#edf7e8' : '#fef2f2'};
    color: ${type === 'success' ? '#3d8a27' : '#dc2626'};
    border: 1px solid ${type === 'success' ? 'rgba(92,186,60,0.3)' : 'rgba(220,38,38,0.3)'};
  `;
  form.appendChild(msg);

  // Auto-remover después de 5s
  setTimeout(() => msg.remove(), 5000);
}

/* ─────────────────────────────────────────
   9. Cards — tilt 3D removido (estilo institucional)
   Se mantiene solo el lift via CSS (:hover translateY)
───────────────────────────────────────── */
function initCardTilt() {
  // Desactivado: el efecto 3D no aplica al estilo corporativo
  // El hover lift está manejado 100% por CSS
}

/* ─────────────────────────────────────────
   10. Lazy loading de imágenes
───────────────────────────────────────── */
function initLazyImages() {
  if (!('IntersectionObserver' in window)) return;

  const images = $$('img[data-src]');
  if (!images.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.addEventListener('load', () => img.classList.add('loaded'));
        observer.unobserve(img);
      });
    },
    { rootMargin: '200px' }
  );

  images.forEach((img) => observer.observe(img));
}

/* ─────────────────────────────────────────
   11. Accesibilidad — Skip link
───────────────────────────────────────── */
function initSkipLink() {
  const skip = document.createElement('a');
  skip.href = '#inicio';
  skip.textContent = 'Saltar al contenido principal';
  skip.style.cssText = `
    position: fixed;
    top: -100%;
    left: 1rem;
    z-index: 9999;
    background: var(--color-brand);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0 0 0.5rem 0.5rem;
    font-weight: 700;
    font-size: 0.875rem;
    transition: top 0.2s;
  `;
  skip.addEventListener('focus', () => { skip.style.top = '0'; });
  skip.addEventListener('blur',  () => { skip.style.top = '-100%'; });
  document.body.prepend(skip);
}

/* ─────────────────────────────────────────
   INIT — Punto de entrada
───────────────────────────────────────── */
onReady(() => {
  initAOS();
  initHeader();
  initMobileMenu();
  initActiveNav();
  initCounters();
  initSmoothScroll();
  initScrollTop();
  initContactForm();
  initCardTilt();
  initLazyImages();
  initSkipLink();

  // Quitar loader si existe (para futura implementación)
  const loader = $('#pageLoader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }
});
