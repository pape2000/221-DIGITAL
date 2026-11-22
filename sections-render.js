/* ==========================================================================
   221 DIGITAL — Rendu des sections personnalisées (site public + aperçu du gestionnaire)
   window.Sections221 = { render(section, opts) → HTMLElement, VARIANTS, ICONS }

   - Tout texte est inséré via textContent : aucun HTML utilisateur n'est interprété (sauf kind « code »,
     isolé dans une iframe sandbox SANS allow-scripts + CSP qui interdit tout script).
   - opts.preview = true : ignore la visibilité bureau / mobile.
   - Les images passent par Store221.resolve() lorsqu'il existe.
   ========================================================================== */
(function () {
  'use strict';
  const SCH = window.Schema221 || { cleanHtml: (h) => h, cleanCss: (c) => c };
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- Icônes (par mot-clé) ; toute autre valeur (emoji, caractère) est affichée telle quelle ---------- */
  const ICONS = {
    globe: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 0c2.8 2.7 4.2 6.2 4.2 10S14.800 19.300 12 22c-2.800-2.700-4.200-6.200-4.200-10S9.200 4.700 12 2zM2.500 9h19M2.500 15h19',
    cart: 'M3 4h2.500l2.200 10.500a1.500 1.500 0 001.500 1.200h8.200a1.500 1.500 0 001.500-1.100L20.500 8H6.200M10 20.500a.8.8 0 100-.1M17 20.500a.8.8 0 100-.1',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
    shield: 'M12 2.500l8 3v6c0 5-3.400 8.800-8 10-4.600-1.200-8-5-8-10v-6l8-3zM8.500 12l2.500 2.500 4.500-5',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    star: 'M12 2.500l2.900 6 6.600.9-4.800 4.600 1.200 6.500L12 17.400 6.100 20.500l1.200-6.500L2.500 9.400l6.600-.9L12 2.500z',
    heart: 'M12 21s-8-5.200-8-11a4.500 4.500 0 018-2.800A4.500 4.500 0 0120 10c0 5.800-8 11-8 11z',
    users: 'M16 20v-1.500a4 4 0 00-4-4H7a4 4 0 00-4 4V20M9.500 11a3.500 3.500 0 100-7 3.500 3.500 0 000 7zM21 20v-1.500a4 4 0 00-3-3.800M15.500 4.200a3.500 3.500 0 010 6.600',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    chat: 'M21 12a8 8 0 01-11.500 7.200L4 20.500l1.300-4.500A8 8 0 1121 12z',
    pen: 'M4 20h4L19 9a2.800 2.800 0 00-4-4L4 16v4zM13.500 6.500l4 4',
    phone: 'M5 4h4l2 5-2.500 1.500a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
    mail: 'M3 6h18v12H3zM3 7l9 6.500L21 7',
    pin: 'M12 21s-7-6-7-11.500a7 7 0 0114 0C19 15 12 21 12 21zM12 12a2.500 2.500 0 100-5 2.500 2.500 0 000 5z',
    check: 'M4 12.500l5 5L20 6.500',
    rocket: 'M5 15c-1.500 1.500-2 5-2 5s3.500-.5 5-2M14 4c3-1.500 6-1.500 6-1.500S20 5.500 18.500 9L13 14.500 9.500 11 14 4zM9.500 11L5 10l2-3.500 4 .5M13 14.500L14 19l3.500-2-.5-4',
    brain: 'M9 4a3 3 0 00-3 3v.5A3 3 0 004 10.500a3 3 0 001.500 2.600A3 3 0 007 17a3 3 0 005 1.500V5.500A2.500 2.500 0 009 4zM15 4a3 3 0 013 3v.5a3 3 0 012 3 3 3 0 01-1.500 2.600A3 3 0 0117 17a3 3 0 01-5 1.500',
    palette: 'M12 3a9 9 0 100 18c1.500 0 2-1 2-2s-.5-1.500 0-2.500 1.500-1 3-1h1A3 3 0 0021 12 9 9 0 0012 3zM7.500 12a1 1 0 100-.1M10 7.500a1 1 0 100-.1M15 7.500a1 1 0 100-.1',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
    target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.500a4.500 4.500 0 100-9 4.500 4.500 0 000 9zM12 13a1 1 0 100-2 1 1 0 000 2z',
    layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.500l9 5 9-5',
  };

  /* ---------- Métadonnées pour l'éditeur du gestionnaire ---------- */
  const ITEM_ALL = ['icon', 'title', 'text', 'image', 'value', 'label', 'url', 'sub', 'rating'];
  const VARIANTS = {
    hero: { label: 'Hero / présentation principale', description: 'Grand bandeau d’accueil avec fond, voile, titre, sous-titre et boutons.', fields: ['eyebrow', 'title', 'subtitle', 'text', 'image', 'buttons'], items: null, columns: false, supportsImagePos: true },
    about: { label: 'À propos', description: 'Image et texte côte à côte, avec points clés.', fields: ['eyebrow', 'title', 'subtitle', 'text', 'image', 'buttons'], items: { label: 'Points clés', fields: ['title'], min: 0, max: 8 }, columns: false, supportsImagePos: true },
    services: { label: 'Services', description: 'Cartes en colonnes avec icône, titre, description et lien.', fields: ['eyebrow', 'title', 'subtitle', 'buttons'], items: { label: 'Services', fields: ['icon', 'title', 'text', 'url'], min: 1, max: 12 }, columns: true, supportsImagePos: false },
    advantages: { label: 'Nos avantages', description: 'Liste numérotée d’atouts, sans cartes, sur deux colonnes.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Avantages', fields: ['icon', 'title', 'text'], min: 1, max: 10 }, columns: true, supportsImagePos: false },
    stats: { label: 'Statistiques', description: 'Chiffres clés en grand, séparés par des filets.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Chiffres', fields: ['value', 'label', 'text'], min: 1, max: 8 }, columns: true, supportsImagePos: false },
    portfolio: { label: 'Portfolio', description: 'Grille de réalisations avec image, catégorie et lien.', fields: ['eyebrow', 'title', 'subtitle', 'buttons'], items: { label: 'Réalisations', fields: ['title', 'sub', 'image', 'url'], min: 1, max: 12 }, columns: true, supportsImagePos: false },
    clients: { label: 'Clients et partenaires', description: 'Grille de logos (ou de noms) de clients et partenaires.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Clients', fields: ['title', 'image', 'url'], min: 1, max: 24 }, columns: true, supportsImagePos: false },
    testimonials: { label: 'Témoignages', description: 'Cartes d’avis clients avec étoiles.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Témoignages', fields: ['text', 'title', 'sub', 'image', 'rating'], min: 1, max: 9 }, columns: true, supportsImagePos: false },
    faq: { label: 'FAQ', description: 'Questions fréquentes en accordéon.', fields: ['eyebrow', 'title', 'subtitle', 'buttons'], items: { label: 'Questions', fields: ['title', 'text'], min: 1, max: 20 }, columns: false, supportsImagePos: false },
    cta: { label: 'Contact / appel à l’action', description: 'Bandeau d’invitation à passer à l’action avec boutons.', fields: ['eyebrow', 'title', 'subtitle', 'text', 'buttons'], items: null, columns: false, supportsImagePos: false },
    process: { label: 'Méthode / étapes', description: 'Étapes numérotées reliées entre elles.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Étapes', fields: ['title', 'text'], min: 2, max: 8 }, columns: true, supportsImagePos: false },
    team: { label: 'Équipe', description: 'Portraits (ou initiales) avec nom, rôle et présentation.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Membres', fields: ['title', 'sub', 'text', 'image', 'url'], min: 1, max: 12 }, columns: true, supportsImagePos: false },
    pricing: { label: 'Tarifs', description: 'Offres avec prix et liste d’avantages (une ligne = un avantage).', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Offres', fields: ['title', 'value', 'label', 'text', 'sub', 'url'], min: 1, max: 4 }, columns: true, supportsImagePos: false },
    gallery: { label: 'Galerie', description: 'Mosaïque d’images avec légende.', fields: ['eyebrow', 'title', 'subtitle'], items: { label: 'Images', fields: ['image', 'title'], min: 1, max: 18 }, columns: true, supportsImagePos: false },
    text: { label: 'Texte libre', description: 'Bloc de texte centré, étroit, pour un message ou un article.', fields: ['eyebrow', 'title', 'subtitle', 'text', 'buttons'], items: null, columns: false, supportsImagePos: false },
    contact: { label: 'Coordonnées', description: 'Texte d’invitation et cartes de contact (e-mail, téléphone, adresse…).', fields: ['eyebrow', 'title', 'subtitle', 'text', 'buttons'], items: { label: 'Moyens de contact', fields: ['icon', 'title', 'text', 'url'], min: 1, max: 6 }, columns: false, supportsImagePos: false },
  };

  /* ---------- Outils DOM ---------- */
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== '') n.textContent = text; return n; };
  const res = (v) => { if (!v) return ''; try { return (window.Store221 && Store221.resolve) ? Store221.resolve(v) : v; } catch (e) { return v; } };
  const safeUrl = (u) => { u = String(u || '').trim(); return /^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(u) ? u : ''; };
  const external = (u) => /^https?:\/\//i.test(u) && !(typeof location !== 'undefined' && u.startsWith(location.origin));
  function paras(parent, text, cls) {
    String(text || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).forEach((p) => parent.appendChild(el('p', cls, p)));
  }
  function icon(name) {
    const wrap = el('span', 'sx-ico'); wrap.setAttribute('aria-hidden', 'true');
    if (ICONS[name]) {
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name]); svg.appendChild(p); wrap.appendChild(svg);
    } else wrap.textContent = name || '●';
    return wrap;
  }
  function anchor(cls, url, label) {
    const u = safeUrl(url); const a = el(u ? 'a' : 'span', cls, label);
    if (u) { a.href = u; if (external(u)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } }
    return a;
  }
  function buttons(list) {
    const row = el('div', 'sx-actions');
    (list || []).forEach((b) => { if (!b || !b.label) return; row.appendChild(anchor('sx-btn ' + (b.style === 'ghost' ? 'sx-btn-ghost' : 'sx-btn-primary'), b.url, b.label)); });
    return row.children.length ? row : null;
  }
  function stars(n) {
    const w = el('div', 'sx-stars'); w.setAttribute('role', 'img'); w.setAttribute('aria-label', n + ' étoiles sur 5');
    for (let i = 1; i <= 5; i++) w.appendChild(el('span', i <= n ? 'on' : '', '★'));
    return w;
  }
  function picture(src, alt, cls) {
    const s = res(src); if (!s) return null;
    const img = el('img', cls); img.src = s; img.alt = alt || ''; img.loading = 'lazy'; img.decoding = 'async'; return img;
  }
  function head(c, center) {
    if (!(c.eyebrow || c.title || c.subtitle)) return null;
    const h = el('header', 'sx-head' + (center ? ' sx-head-center' : ''));
    if (c.eyebrow) h.appendChild(el('span', 'sx-eyebrow', c.eyebrow));
    if (c.title) h.appendChild(el('h2', 'sx-title', c.title));
    if (c.subtitle) h.appendChild(el('p', 'sx-lead', c.subtitle));
    return h;
  }
  const initials = (t) => String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  function cols(root, s, def) { root.style.setProperty('--sx-cols', String(Math.min(4, Math.max(1, s.content.columns || def)))); }

  /* ---------- Rendu par variant ---------- */
  const R = {};
  R.hero = (s, inner) => {
    const c = s.content, wrap = el('div', 'sx-hero-grid');
    const txt = el('div', 'sx-hero-text');
    if (c.eyebrow) txt.appendChild(el('span', 'sx-eyebrow', c.eyebrow));
    if (c.title) txt.appendChild(el('h2', 'sx-title sx-title-xl', c.title));
    if (c.subtitle) txt.appendChild(el('p', 'sx-lead sx-lead-lg', c.subtitle));
    paras(txt, c.text, 'sx-text'); const b = buttons(c.buttons); if (b) txt.appendChild(b);
    wrap.appendChild(txt);
    const im = picture(c.image, c.imageAlt, 'sx-hero-img');
    if (im) { const f = el('div', 'sx-hero-media'); f.appendChild(im); wrap.appendChild(f); wrap.classList.add('has-media'); }
    inner.appendChild(wrap);
  };
  R.about = (s, inner) => {
    const c = s.content, g = el('div', 'sx-about');
    const media = el('div', 'sx-about-media'); const im = picture(c.image, c.imageAlt, 'sx-about-img');
    if (im) media.appendChild(im); else { media.classList.add('is-empty'); media.appendChild(el('span', 'sx-orb o1')); media.appendChild(el('span', 'sx-orb o2')); media.appendChild(el('span', 'sx-about-mark', '221')); media.setAttribute('aria-hidden', 'true'); }
    const txt = el('div', 'sx-about-text'); const h = head(c, false); if (h) txt.appendChild(h);
    paras(txt, c.text, 'sx-text');
    const pts = (c.items || []).filter((i) => i.title);
    if (pts.length) { const ul = el('ul', 'sx-checks'); pts.forEach((p) => { const li = el('li'); const ck = icon('check'); ck.classList.add('sx-ico-sm'); li.appendChild(ck); li.appendChild(el('span', '', p.title)); ul.appendChild(li); }); txt.appendChild(ul); }
    const b = buttons(c.buttons); if (b) txt.appendChild(b);
    g.appendChild(media); g.appendChild(txt); inner.appendChild(g);
  };
  R.services = (s, inner) => {
    const c = s.content; const h = head(c, s.style.align === 'center'); if (h) inner.appendChild(h);
    const grid = el('div', 'sx-grid'); cols(grid, s, 3);
    c.items.forEach((i) => {
      const card = el('article', 'sx-card'); card.appendChild(icon(i.icon || 'star'));
      card.appendChild(el('h3', 'sx-card-title', i.title)); if (i.text) paras(card, i.text, 'sx-card-text');
      if (safeUrl(i.url)) card.appendChild(anchor('sx-more', i.url, 'En savoir plus →'));
      grid.appendChild(card);
    });
    inner.appendChild(grid); const b = buttons(c.buttons); if (b) { b.classList.add('sx-actions-after'); inner.appendChild(b); }
  };
  R.advantages = (s, inner) => {
    const c = s.content; const h = head(c, false); if (h) inner.appendChild(h);
    const list = el('ol', 'sx-adv'); cols(list, s, 2);
    c.items.forEach((i, n) => {
      const li = el('li', 'sx-adv-item'); li.appendChild(el('span', 'sx-adv-num', String(n + 1).padStart(2, '0')));
      const b = el('div', 'sx-adv-body'); const t = el('h3', 'sx-card-title'); if (i.icon) { const ic = icon(i.icon); ic.classList.add('sx-ico-inline'); t.appendChild(ic); } t.appendChild(document.createTextNode(i.title)); b.appendChild(t);
      if (i.text) paras(b, i.text, 'sx-card-text'); li.appendChild(b); list.appendChild(li);
    });
    inner.appendChild(list);
  };
  R.stats = (s, inner) => {
    const c = s.content; const h = head(c, true); if (h) inner.appendChild(h);
    const row = el('dl', 'sx-stats'); cols(row, s, Math.min(4, c.items.length || 4));
    c.items.forEach((i) => { const d = el('div', 'sx-stat'); const v = el('dd', 'sx-stat-value', i.value); const l = el('dt', 'sx-stat-label', i.label || i.title); d.appendChild(v); d.appendChild(l); if (i.text) d.appendChild(el('p', 'sx-stat-note', i.text)); row.appendChild(d); });
    inner.appendChild(row);
  };
  R.portfolio = (s, inner) => {
    const c = s.content; const h = head(c, s.style.align === 'center'); if (h) inner.appendChild(h);
    const grid = el('div', 'sx-grid sx-tiles'); cols(grid, s, 3);
    c.items.forEach((i, n) => {
      const u = safeUrl(i.url); const tile = el(u ? 'a' : 'div', 'sx-tile tone-' + (n % 4));
      if (u) { tile.href = u; if (external(u)) { tile.target = '_blank'; tile.rel = 'noopener noreferrer'; } }
      const im = picture(i.image, i.title, 'sx-tile-img'); if (im) tile.appendChild(im); else tile.appendChild(el('span', 'sx-tile-letter', initials(i.title)));
      const cap = el('div', 'sx-tile-cap'); if (i.sub) cap.appendChild(el('span', 'sx-tile-sub', i.sub)); cap.appendChild(el('strong', 'sx-tile-title', i.title)); tile.appendChild(cap);
      grid.appendChild(tile);
    });
    inner.appendChild(grid); const b = buttons(c.buttons); if (b) { b.classList.add('sx-actions-after'); inner.appendChild(b); }
  };
  R.clients = (s, inner) => {
    const c = s.content; const h = head(c, true); if (h) inner.appendChild(h);
    const grid = el('ul', 'sx-logos'); cols(grid, s, 4);
    c.items.forEach((i) => {
      const li = el('li', 'sx-logo'); const u = safeUrl(i.url); const box = el(u ? 'a' : 'span', 'sx-logo-box'); if (u) { box.href = u; if (external(u)) { box.target = '_blank'; box.rel = 'noopener noreferrer'; } box.setAttribute('aria-label', i.title); }
      const im = picture(i.image, i.title, 'sx-logo-img'); if (im) box.appendChild(im); else box.appendChild(el('span', 'sx-logo-name', i.title));
      li.appendChild(box); grid.appendChild(li);
    });
    inner.appendChild(grid);
  };
  R.testimonials = (s, inner) => {
    const c = s.content; const h = head(c, s.style.align === 'center'); if (h) inner.appendChild(h);
    const grid = el('div', 'sx-grid'); cols(grid, s, 3);
    c.items.forEach((i) => {
      const card = el('figure', 'sx-card sx-quote'); if (i.rating) card.appendChild(stars(i.rating));
      const bq = el('blockquote', 'sx-quote-text'); paras(bq, i.text, ''); card.appendChild(bq);
      const cap = el('figcaption', 'sx-quote-by'); const av = el('span', 'sx-avatar'); const im = picture(i.image, i.title, 'sx-avatar-img'); if (im) av.appendChild(im); else av.textContent = initials(i.title); av.setAttribute('aria-hidden', 'true');
      const who = el('span', 'sx-who'); who.appendChild(el('strong', '', i.title)); if (i.sub) who.appendChild(el('small', '', i.sub));
      cap.appendChild(av); cap.appendChild(who); card.appendChild(cap); grid.appendChild(card);
    });
    inner.appendChild(grid);
  };
  R.faq = (s, inner) => {
    const c = s.content; const g = el('div', 'sx-faq');
    const left = el('div', 'sx-faq-side'); const h = head(c, false); if (h) left.appendChild(h); const b = buttons(c.buttons); if (b) left.appendChild(b); g.appendChild(left);
    const list = el('div', 'sx-faq-list');
    c.items.forEach((i, n) => { const d = el('details', 'sx-qa'); if (n === 0) d.open = true; const sm = el('summary', '', i.title); d.appendChild(sm); const body = el('div', 'sx-qa-body'); paras(body, i.text, ''); d.appendChild(body); list.appendChild(d); });
    g.appendChild(list); inner.appendChild(g);
  };
  R.cta = (s, inner) => {
    const c = s.content; const box = el('div', 'sx-cta'); box.appendChild(el('span', 'sx-cta-glow g1')); box.appendChild(el('span', 'sx-cta-glow g2'));
    const t = el('div', 'sx-cta-body'); if (c.eyebrow) t.appendChild(el('span', 'sx-eyebrow', c.eyebrow)); if (c.title) t.appendChild(el('h2', 'sx-title', c.title)); if (c.subtitle) t.appendChild(el('p', 'sx-lead', c.subtitle)); paras(t, c.text, 'sx-text');
    const b = buttons(c.buttons); if (b) t.appendChild(b); box.appendChild(t); inner.appendChild(box);
  };
  R.process = (s, inner) => {
    const c = s.content; const h = head(c, true); if (h) inner.appendChild(h);
    const ol = el('ol', 'sx-steps'); cols(ol, s, Math.min(4, c.items.length || 4));
    c.items.forEach((i, n) => { const li = el('li', 'sx-step'); li.appendChild(el('span', 'sx-step-n', String(n + 1))); li.appendChild(el('h3', 'sx-card-title', i.title)); if (i.text) paras(li, i.text, 'sx-card-text'); ol.appendChild(li); });
    inner.appendChild(ol);
  };
  R.team = (s, inner) => {
    const c = s.content; const h = head(c, s.style.align === 'center'); if (h) inner.appendChild(h);
    const grid = el('div', 'sx-grid'); cols(grid, s, 3);
    c.items.forEach((i, n) => {
      const card = el('article', 'sx-card sx-member'); const ph = el('div', 'sx-photo tone-' + (n % 4)); const im = picture(i.image, i.title, 'sx-photo-img'); if (im) ph.appendChild(im); else { ph.appendChild(el('span', '', initials(i.title))); } card.appendChild(ph);
      card.appendChild(el('h3', 'sx-card-title', i.title)); if (i.sub) card.appendChild(el('span', 'sx-role', i.sub)); if (i.text) paras(card, i.text, 'sx-card-text');
      if (safeUrl(i.url)) card.appendChild(anchor('sx-more', i.url, 'Profil →')); grid.appendChild(card);
    });
    inner.appendChild(grid);
  };
  R.pricing = (s, inner) => {
    const c = s.content; const h = head(c, true); if (h) inner.appendChild(h);
    const grid = el('div', 'sx-grid sx-plans'); cols(grid, s, Math.min(3, c.items.length || 3));
    c.items.forEach((i) => {
      const card = el('article', 'sx-card sx-plan' + (i.sub ? ' is-featured' : '')); if (i.sub) card.appendChild(el('span', 'sx-badge', i.sub));
      card.appendChild(el('h3', 'sx-card-title', i.title)); const pr = el('p', 'sx-price'); pr.appendChild(el('strong', '', i.value)); if (i.label) pr.appendChild(el('small', '', ' ' + i.label)); card.appendChild(pr);
      const feats = String(i.text || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
      if (feats.length) { const ul = el('ul', 'sx-checks'); feats.forEach((f) => { const li = el('li'); const ck = icon('check'); ck.classList.add('sx-ico-sm'); li.appendChild(ck); li.appendChild(el('span', '', f)); ul.appendChild(li); }); card.appendChild(ul); }
      card.appendChild(anchor('sx-btn ' + (i.sub ? 'sx-btn-primary' : 'sx-btn-outline'), i.url, 'Choisir cette offre')); grid.appendChild(card);
    });
    inner.appendChild(grid);
  };
  R.gallery = (s, inner) => {
    const c = s.content; const h = head(c, s.style.align === 'center'); if (h) inner.appendChild(h);
    const g = el('div', 'sx-gallery'); cols(g, s, 3);
    c.items.forEach((i, n) => {
      const fig = el('figure', 'sx-shot tone-' + (n % 4) + (n % 5 === 0 ? ' is-tall' : '')); const im = picture(i.image, i.title, 'sx-shot-img'); if (im) fig.appendChild(im);
      if (i.title) fig.appendChild(el('figcaption', '', i.title)); g.appendChild(fig);
    });
    inner.appendChild(g);
  };
  R.text = (s, inner) => {
    const c = s.content; const box = el('div', 'sx-prose'); const h = head(c, false); if (h) box.appendChild(h); paras(box, c.text, 'sx-text'); const b = buttons(c.buttons); if (b) box.appendChild(b); inner.appendChild(box);
  };
  R.contact = (s, inner) => {
    const c = s.content; const g = el('div', 'sx-contact'); const left = el('div', 'sx-contact-text'); const h = head(c, false); if (h) left.appendChild(h); paras(left, c.text, 'sx-text'); const b = buttons(c.buttons); if (b) left.appendChild(b); g.appendChild(left);
    const list = el('ul', 'sx-contact-list');
    c.items.forEach((i) => {
      const li = el('li'); const u = safeUrl(i.url); const box = el(u ? 'a' : 'div', 'sx-card sx-contact-item'); if (u) { box.href = u; if (external(u)) { box.target = '_blank'; box.rel = 'noopener noreferrer'; } }
      box.appendChild(icon(i.icon || 'mail')); const t = el('span', 'sx-contact-t'); t.appendChild(el('small', '', i.title)); t.appendChild(el('strong', '', i.text)); box.appendChild(t); li.appendChild(box); list.appendChild(li);
    });
    g.appendChild(list); inner.appendChild(g);
  };

  /* ---------- Couleurs ---------- */
  const DARK_BY_DEFAULT = { hero: 1, advantages: 1, stats: 1, testimonials: 1, cta: 1, contact: 1 };
  function lum(c) {
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(c || ''); let r, g, b;
    if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
    else { m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c || ''); if (!m) return null; r = +m[1]; g = +m[2]; b = +m[3]; }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  /* ---------- Section « code » isolée ---------- */
  function renderCode(section, opts) {
    const root = el('div', 'sx sx-code');
    const css = SCH.cleanCss(section.code && section.code.css), html = SCH.cleanHtml(section.code && section.code.html);
    const doc = '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data: /; style-src \'unsafe-inline\' https:; font-src https: data:; base-uri \'none\'; form-action \'none\'">' +
      '<base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>html,body{margin:0;padding:0}body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#0E1628;overflow-wrap:anywhere}*,*::before,*::after{box-sizing:border-box}img{max-width:100%;height:auto}</style>' +
      '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>' + html + '</body></html>';
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');   // JAMAIS allow-scripts
    f.setAttribute('title', section.name || 'Section personnalisée'); f.setAttribute('loading', 'lazy'); f.setAttribute('scrolling', 'no');
    f.className = 'sx-frame'; f.srcdoc = doc;
    const fixed = section.code && section.code.height > 0 ? section.code.height : 0;
    if (fixed) f.style.height = fixed + 'px'; else f.style.height = '240px';
    const fit = () => { if (fixed) return; try { const d = f.contentDocument; if (d && d.documentElement) f.style.height = Math.max(40, Math.ceil(Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0))) + 'px'; } catch (e) {} };
    f.addEventListener('load', () => { fit(); try { if (!fixed && window.ResizeObserver && f.contentDocument) new ResizeObserver(fit).observe(f.contentDocument.documentElement); } catch (e) {} setTimeout(fit, 250); setTimeout(fit, 1200); });
    window.addEventListener('resize', fit);
    root.appendChild(f); applyVisibility(root, section, opts); return root;
  }
  function applyVisibility(node, s, opts) {
    if (opts && opts.preview) return;
    const v = s.visibility || {};
    if (v.desktop === false) node.classList.add('sx-hide-desktop');
    if (v.mobile === false) node.classList.add('sx-hide-mobile');
  }

  /* ---------- Point d'entrée ---------- */
  function render(section, opts) {
    opts = opts || {};
    if (!section) return el('div', 'sx');
    if (section.kind === 'code') return renderCode(section, opts);
    const v = VARIANTS[section.variant] ? section.variant : 'text';
    const st = section.style || {}, c = section.content || {};
    const s = { ...section, content: { ...c, items: Array.isArray(c.items) ? c.items.filter((i) => i && (i.title || i.text || i.value || i.image || i.label)) : [], buttons: Array.isArray(c.buttons) ? c.buttons : [] }, style: st };
    const root = el('section', 'sx sx-v-' + v); root.setAttribute('data-sx-variant', v); if (section.id) root.setAttribute('data-sx-id', section.id);
    /* mode clair / sombre : par défaut selon le variant ; si un fond est choisi, selon sa luminosité */
    let dark = !!DARK_BY_DEFAULT[v]; const L = lum(st.bg); if (st.bg && L != null) dark = L < 0.55; else if (st.bgImage && !st.bg) dark = true;
    root.classList.add(dark ? 'sx-dark' : 'sx-light');
    root.classList.add('sx-align-' + (st.align || 'left'));
    if (st.bg) root.style.setProperty('--sx-bg', st.bg);
    if (st.color) { root.style.setProperty('--sx-fg', st.color); root.classList.add('sx-custom-fg'); }
    if (st.accent) { root.style.setProperty('--sx-accent', st.accent); root.classList.add('sx-custom-accent'); }
    root.style.setProperty('--sx-py', (st.padY != null ? st.padY : 72) + 'px');
    root.style.setProperty('--sx-px', (st.padX || 0) + 'px');
    root.style.setProperty('--sx-gap', (st.gap != null ? st.gap : 24) + 'px');
    root.style.setProperty('--sx-mw', (st.maxWidth || 1180) + 'px');
    root.style.setProperty('--sx-r', (st.radius != null ? st.radius : 16) + 'px');
    if (st.minHeight) root.style.minHeight = st.minHeight + 'px';
    if (st.bgImage || (v === 'hero' && c.image === '' && false)) {
      const bg = el('div', 'sx-bgimg'); const u = res(st.bgImage); if (u) bg.style.backgroundImage = 'url("' + String(u).replace(/["\\\n]/g, '') + '")'; bg.setAttribute('aria-hidden', 'true'); root.appendChild(bg);
      const ov = el('div', 'sx-overlay'); ov.style.opacity = String((st.overlay != null ? st.overlay : 55) / 100); ov.setAttribute('aria-hidden', 'true'); root.appendChild(ov);
    }
    const inner = el('div', 'sx-inner');
    (R[v] || R.text)(s, inner);
    root.appendChild(inner);
    applyVisibility(root, section, opts);
    return root;
  }

  window.Sections221 = { render, VARIANTS, ICONS };
})();
