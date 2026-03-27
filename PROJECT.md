# Proyecto: Indusquim — Rediseño Web
**Estado:** MODO EJECUCIÓN — V1.0 completada ✓
**Inicio:** 2026-03-25

---

## Sobre la Empresa
- **Nombre:** Indusquim
- **País:** Colombia
- **Industria:** Productos de limpieza industrial
- **Fundación:** 1993 (33 años de experiencia)
- **Sede:** Cali, Colombia
- **Web actual:** https://www.indusquim.co/
- **Líneas de producto:** Cocinas/Alimentos, Institucional, Lavandería

---

## Páginas Analizadas

| Página | Tipo | URL |
|---|---|---|
| Indusquim actual | Cliente | https://www.indusquim.co/ |
| Klaxen | Referente nacional 1 | https://klaxen.com/ |
| Deterquin | Referente nacional 2 | https://deterquin.com |
| Ecolab | Referente internacional | https://es-es.ecolab.com/ |

---

## Diagnóstico: Sitio Actual de Indusquim

### Lo que tiene bien
- Identidad de color verde corporativo (coherente con limpieza/naturaleza)
- Tipografía Roboto — moderna y legible
- Estructura básica clara: Inicio, Nosotros, Productos, Blog, Contacto
- Integración WhatsApp (Joinchat)
- 3 categorías de producto definidas

### Problemas detectados
- Contenido dinámico sin renderizar (placeholders visibles en HTML)
- Falta información de contacto completa (no hay teléfono ni dirección visible)
- Sin testimonios ni casos de éxito
- Sin certificaciones ni sellos de confianza
- Sin videos ni recursos técnicos
- CSS excesivo (impacta velocidad)
- Sin estructura semántica HTML5
- CTAs débiles y poco estratégicas
- No muestra segmentación por industria/sector cliente

---

## Análisis de Referentes

### Klaxen (Nacional ⭐⭐⭐⭐⭐)
- **Paleta:** Naranja #ff7f00 + Gris #1d1d1d + Blanco
- **Tipografía:** Open Sans + Inter
- **Clave:** 10 sectores atendidos en grid visual, portal de clientes, metodología LDI
- **Lo mejor:** Posicionamiento consultivo (no vende productos, vende programas)

### Deterquin (Nacional ⭐⭐⭐⭐)
- **Paleta:** Azul marino #0032a1 + Rojo #e24755 + Verde sostenibilidad
- **Tipografía:** Poppins
- **Clave:** Sostenibilidad cuantificada, proceso en 4 pasos visible, contador de impacto
- **Lo mejor:** Muestra ROI ambiental real

### Ecolab (Internacional ⭐⭐⭐⭐⭐)
- **Paleta:** Azul corporativo + Rojo CTAs + Blanco base
- **Tipografía:** Sans-serif corporativa
- **Clave:** 16 industrias especializadas, eROI (retorno cuantificable), trust signals en navegación
- **Lo mejor:** Especialización radical por industria — no vende limpieza, vende soluciones verticales

---

## Decisiones de Diseño
_(Se completan en Modo Plan con Victor)_

- [ ] Paleta de colores definitiva
- [ ] Tipografías
- [ ] Estilo visual (Glassmorphism / Minimalism / Corporativo limpio)
- [ ] Secciones del home
- [ ] Sectores a mostrar
- [ ] Tech stack (HTML/CSS, React, Next.js, Webflow, etc.)

---

## Estado de Implementación V1.1 — Multi-página completa ✓
- [x] Diseño aprobado
- [x] Estructura de archivos creada
- [x] Design System CSS (31 secciones, variables, responsive)
- [x] index.html — Home simplificado (convencer rápido al visitante)
- [x] nosotros.html — Historia, MVV, proceso, testimonios
- [x] sectores.html — 6 sectores con content-split alternado + imágenes
- [x] productos.html — 3 líneas de producto + sección FDS/SGA
- [x] certificaciones.html — 6 certificaciones detalladas (INVIMA, BPM, SGA, ANLA, ISO, SAC)
- [x] blog.html — 6 artículos técnicos
- [x] contacto.html — Formulario completo + info + mapa placeholder
- [x] JavaScript — 11 módulos de interacción
- [x] Responsive — Desktop / Tablet / Móvil
- [ ] Imágenes reales (pendiente: solicitar a cliente o contratar fotógrafo)
- [ ] Logo real (pendiente: archivo SVG/PNG de Indusquim)
- [ ] Número de teléfono real (pendiente: confirmar con cliente)
- [ ] Dirección real (pendiente: confirmar con cliente)
- [ ] Google Maps iframe (pendiente: confirmar dirección)
- [ ] Certificaciones reales (pendiente: confirmar cuáles tienen)
- [ ] Cifras reales de stats (años, clientes, productos)
- [ ] Testimonios reales (pendiente: solicitar a clientes)

## Archivos del Proyecto
| Archivo | Descripción |
|---|---|
| `index.html` | Home — Hero, Stats, Sectores preview, Por qué elegirnos, CTA |
| `nosotros.html` | Historia, MVV, Proceso 4 pasos, Testimonios |
| `sectores.html` | 6 sectores con content-split alternado e imágenes |
| `productos.html` | 3 líneas de producto + sección FDS/SGA |
| `certificaciones.html` | 6 certificaciones detalladas |
| `blog.html` | 6 artículos técnicos |
| `contacto.html` | Info de contacto + formulario WhatsApp + mapa placeholder |
| `assets/css/styles.css` | Design system completo (31 secciones) |
| `assets/js/main.js` | 11 módulos de interacción JS |

## Datos para Reemplazar
Buscar `<!-- ... reemplazar ... -->` en index.html para ubicar todos los placeholders.
