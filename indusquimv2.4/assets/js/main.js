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

/* ── Nav Dropdowns ───────────────────────────────────────────── */
function initNavDropdowns() {
  const dropItems = $$('.nav__item--drop');

  dropItems.forEach(item => {
    const btn = item.querySelector('button.nav__link--has-drop');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
      // Close siblings
      dropItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('is-open');
          other.querySelector('button')?.setAttribute('aria-expanded', 'false');
        }
      });
    });
  });

  // Close on outside click or Escape
  document.addEventListener('click', () => {
    dropItems.forEach(item => {
      item.classList.remove('is-open');
      item.querySelector('button')?.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropItems.forEach(item => {
        item.classList.remove('is-open');
        item.querySelector('button')?.setAttribute('aria-expanded', 'false');
      });
    }
  });
}

/* ── Mobile Dropdowns ────────────────────────────────────────── */
function initMobileDropdowns() {
  $$('.mobile-menu__link--drop').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const drop = document.getElementById(targetId);
      if (!drop) return;
      const isOpen = drop.classList.toggle('is-open');
      btn.classList.toggle('is-open', isOpen);
    });
  });
}


/* ── 11. Barra de Búsqueda ─────────────────────────────────── */
function initSearch() {

    const INDEX = [
      { title: 'Nosotros',        section: 'Empresa',    href: 'nosotros.html',        keywords: 'empresa historia quienes somos fundacion 1993 cali' },
      { title: 'Sectores',        section: 'Servicios',  href: 'sectores.html',        keywords: 'sectores industrias clientes hoteleria salud manufactura' },
      { title: 'Catálogo',        section: 'Productos',  href: 'productos.html',       keywords: 'catalogo productos lineas limpieza desinfeccion' },
      { title: 'Certificaciones', section: 'Empresa',    href: 'certificaciones.html', keywords: 'certificaciones invima bpm sga iso calidad' },
      { title: 'Blog',            section: 'Recursos',   href: 'blog.html',            keywords: 'blog articulos recursos tecnicos noticias' },
      { title: 'Contacto',        section: 'Contacto',   href: 'contacto.html',        keywords: 'contacto telefono email direccion cali colombia' },
      { title: 'Portal de clientes', section: 'Acceso', href: 'portal/login.html',    keywords: 'portal clientes login acceso cuenta' },
      { title: 'Industria Alimentaria',  section: 'Sectores', href: 'sectores.html#alimentaria',  keywords: 'alimentos plantas bpm higiene cocinas cip' },
      { title: 'Hotelería y Turismo',    section: 'Sectores', href: 'sectores.html#hoteleria',    keywords: 'hoteles restaurantes turismo habitaciones' },
      { title: 'Salud e Institucional',  section: 'Sectores', href: 'sectores.html#salud',        keywords: 'hospitales clinicas salud desinfeccion alto nivel' },
      { title: 'Lavandería Industrial',  section: 'Sectores', href: 'sectores.html#lavanderia',   keywords: 'lavanderia detergente suavizante textil' },
      { title: 'Manufactura e Industria',section: 'Sectores', href: 'sectores.html#manufactura',  keywords: 'manufactura industria pisos maquinaria' },
      { title: 'Educación y Gobierno',   section: 'Sectores', href: 'sectores.html#educacion',    keywords: 'colegios universidades gobierno licitaciones' },
      { title: 'Línea Cocinas y Alimentos', section: 'Catálogo', href: 'productos.html#cocinas',  keywords: 'cocinas alimentos cip desengrasante acido alcalino' },
      { title: 'Línea Institucional',    section: 'Catálogo', href: 'productos.html#institucional', keywords: 'institucional pisos superficies desinfectante' },
      { title: 'Línea Lavandería',       section: 'Catálogo', href: 'productos.html#lavanderia',  keywords: 'lavanderia detergente suavizante blanqueador' },
      { title: 'Fichas Técnicas (FDS)',  section: 'Catálogo', href: 'productos.html#fds',         keywords: 'fichas tecnicas fds sga documentacion seguridad' },
      { title: 'Solicitar asesoría gratuita', section: 'Contacto', href: 'contacto.html',         keywords: 'asesoria gratis soporte tecnico ayuda' },
    ];
    const ICONS = {
      'Empresa':   '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
      'Servicios': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      'Productos': '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
      'Recursos':  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      'Contacto':  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 013.07 4.18 2 2 0 015.07 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>',
      'Acceso':    '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      'Sectores':  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'Catálogo':  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
    };
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    if (!input || !results) return;
    function search(q) {
      q = q.trim().toLowerCase();
      if (q.length < 2) return [];
      return INDEX.filter(i => i.title.toLowerCase().includes(q) || i.keywords.toLowerCase().includes(q) || i.section.toLowerCase().includes(q)).slice(0, 8);
    }
    function render(items, q) {
      if (!items.length) { results.innerHTML = '<div class="search-no-results">Sin resultados para "' + q + '"</div>'; }
      else { results.innerHTML = items.map(i => `<a class="search-result-item" href="${i.href}" role="option"><div class="search-result-item__icon">${ICONS[i.section]||''}</div><div><div class="search-result-item__title">${i.title}</div><div class="search-result-item__section">${i.section}</div></div></a>`).join(''); }
      results.classList.add('visible');
    }
    input.addEventListener('input', function() { const q=this.value; if(q.trim().length<2){results.classList.remove('visible');return;} render(search(q),q); });
    document.addEventListener('click', function(e) { if(!e.target.closest('#searchWrap')) results.classList.remove('visible'); });
    input.addEventListener('keydown', function(e) {
      const items=results.querySelectorAll('.search-result-item'); let focused=results.querySelector('.search-result-item:focus');
      if(e.key==='ArrowDown'){e.preventDefault();(focused?focused.nextElementSibling||items[0]:items[0])?.focus();}
      else if(e.key==='ArrowUp'){e.preventDefault();(focused?focused.previousElementSibling||items[items.length-1]:items[items.length-1])?.focus();}
      else if(e.key==='Escape'){results.classList.remove('visible');input.blur();}
    });
  
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
  initNavDropdowns();
  initMobileDropdowns();
  initSearch();
});
