/**
 * INDUSQUIM — main.js v2
 * Header scroll · Menú móvil · Contadores · AOS · Scroll-to-top · Nav activo
 */

'use strict';

/* ── Utilidades ────────────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function onReady(fn) {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

/* ── 1. AOS (Animate On Scroll) ────────────────────────────── */
function initAOS() {
  if (typeof AOS === 'undefined') return;
  AOS.init({
    duration: 700,
    easing: 'ease-out-cubic',
    once: true,
    offset: 60,
  });
}

/* ── 2. Header scroll — añade clase .scrolled a la píldora ─── */
function initHeader() {
  const header = $('#header');
  if (!header) return;

  const update = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  };

  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* ── 3. Menú móvil ──────────────────────────────────────────── */
function initMobileMenu() {
  const burger   = $('#burgerBtn');
  const menu     = $('#mobileMenu');
  const closeBtn = $('#menuClose');

  if (!burger || !menu) return;

  const open = () => {
    menu.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('menu-open');
  };

  const close = () => {
    menu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.body.classList.remove('menu-open');
  };

  burger.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);

  // Cerrar al hacer clic en un link
  $$('.mobile-menu__link', menu).forEach(link =>
    link.addEventListener('click', close)
  );

  // Cerrar con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.classList.contains('open')) close();
  });
}

/* ── 4. Nav activo — marca el link de la página actual ─────── */
function initActiveNav() {
  const current = window.location.pathname.split('/').pop() || 'index.html';
  $$('.nav__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* ── 5. Hero — Slideshow automático (3 fotos + 1 video) ─────── */
function initHeroSlideshow() {
  const slides = $$('.hero__slide', document);
  if (!slides.length) return;

  let current = 0;
  const INTERVAL = 6000; // ms entre slides

  const goTo = (idx) => {
    slides[current].classList.remove('active');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add('active');

    // Si el slide activo es un video, reproducirlo
    const video = slides[current].querySelector('video');
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {}); // silenciar error de autoplay
    }
  };

  // Iniciar ciclo automático
  let timer = setInterval(() => goTo(current + 1), INTERVAL);

  // Pausar al salir de la página (ahorro de CPU)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(timer);
    else timer = setInterval(() => goTo(current + 1), INTERVAL);
  });
}

/* ── 6. Contadores animados ─────────────────────────────────── */
function initCounters() {
  const counters = $$('.counter[data-target]');
  if (!counters.length) return;

  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const DURATION = 1800;

  const animate = (el, target) => {
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / DURATION, 1);
      el.textContent = Math.floor(easeOut(progress) * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el     = entry.target;
        const target = parseInt(el.dataset.target, 10);
        animate(el, target);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => observer.observe(el));
}

/* ── 7. Scroll suave para anclajes internos ─────────────────── */
function initSmoothScroll() {
  document.addEventListener('click', e => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    const target = document.getElementById(anchor.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ── 8. Scroll-to-top ───────────────────────────────────────── */
function initScrollTop() {
  const btn = $('#scrollTop');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 500);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ── 9. Formulario de contacto (WhatsApp redirect) ──────────── */
function initContactForm() {
  const form = $('#contactForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const nombre  = ($('#formNombre',  form)?.value || '').trim();
    const empresa = ($('#formEmpresa', form)?.value || '').trim();
    const sector  = ($('#formSector',  form)?.value || '').trim();
    const mensaje = ($('#formMensaje', form)?.value || '').trim();

    const text = encodeURIComponent(
      `Hola Indusquim, soy *${nombre}*${empresa ? ` de *${empresa}*` : ''}` +
      (sector  ? ` (sector: ${sector})` : '') + '.\n\n' +
      (mensaje || 'Me gustaría recibir información sobre sus productos.')
    );

    window.open(`https://wa.me/573023169861?text=${text}`, '_blank');
  });
}

/* ── 10. Accesibilidad — Skip link ──────────────────────────── */
function initSkipLink() {
  const skip = document.createElement('a');
  skip.href = '#inicio';
  skip.textContent = 'Saltar al contenido principal';
  Object.assign(skip.style, {
    position: 'fixed',
    top: '-100%',
    left: '1rem',
    zIndex: '9999',
    background: 'var(--c-brand)',
    color: 'white',
    padding: '0.5rem 1.25rem',
    borderRadius: '0 0 0.5rem 0.5rem',
    fontWeight: '600',
    fontSize: '0.875rem',
    transition: 'top 0.2s',
  });
  skip.addEventListener('focus', () => { skip.style.top = '0'; });
  skip.addEventListener('blur',  () => { skip.style.top = '-100%'; });
  document.body.prepend(skip);
}

/* ── INIT ────────────────────────────────────────────────────── */
onReady(() => {
  initAOS();
  initHeader();
  initMobileMenu();
  initActiveNav();
  initHeroSlideshow();
  initCounters();
  initSmoothScroll();
  initScrollTop();
  initContactForm();
  initSkipLink();
});
