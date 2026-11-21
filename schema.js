/* 221 DIGITAL — schéma partagé (serveur + site + gestionnaire) : une seule définition des sections, paramètres et positions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Schema221 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FIXED_ANCHORS = ['accueil', 'services', 'pourquoi', 'methode', 'temoignages', 'chiffres', 'references', 'footer'];
  const ANCHOR_LABELS = { accueil: 'Accueil (présentation principale)', services: 'Services', pourquoi: 'Pourquoi nous choisir', methode: 'Notre méthode', temoignages: 'Témoignages', chiffres: 'Chiffres clés', references: 'Ils nous ont fait confiance (logos)', footer: 'Pied de page' };
  const STATUSES = ['draft', 'library', 'published', 'archived'];
  const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z-]+\)|)$/i;

  /* Assainissement du code personnalisé : défense en profondeur. L'isolation réelle = iframe sans script + CSP. */
  function cleanHtml(html) {
    return String(html || '').slice(0, 200000)
      .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|frame|frameset|applet)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '')
      .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|input|frame|applet)\b[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src|xlink:href|action|formaction|srcdoc)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'>\s]*("|')?/gi, '$1="#"');
  }
  function cleanCss(css) {
    return String(css || '').slice(0, 100000)
      .replace(/<\/?style[^>]*>/gi, '').replace(/@import[^;]*;?/gi, '')
      .replace(/expression\s*\(|behavior\s*:|-moz-binding\s*:|javascript\s*:/gi, '')
      .replace(/url\(\s*(['"]?)\s*(?!https:|data:image\/(png|jpe?g|webp|gif);|\/api\/media\/)[^)]*\)/gi, 'url()');
  }

  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 5000);
  const num = (v, a, b, d) => { const n = parseInt(v, 10); return Math.min(b, Math.max(a, isNaN(n) ? d : n)); };
  const okUrl = (u) => u === '' || /^(https?:\/\/|\/api\/media\/|mailto:|tel:|#|\/[^\/])/i.test(u) || u === '/';
  function bad(msg) { const e = new Error(msg); e.status = 422; e.code = 'invalid'; return e; }

  /* opts.strict (serveur) : refuse les valeurs invalides. Sinon (client) : les corrige silencieusement. */
  function img(v, opts, where) {
    v = str(v, 4000000);
    if (!v) return '';
    if (v.startsWith('data:image/')) { if (opts.strict && v.length > 300000) throw bad("Image non externalisée (" + where + ") : envoyez-la d'abord via le service de médias."); return v; }
    if (v.startsWith('@') || v.startsWith('/api/media/') || /^https:\/\//i.test(v)) return v;
    if (opts.strict) throw bad("Référence d'image invalide (" + where + ').');
    return '';
  }
  function url(v, opts, n) { const u = str(v, n || 800); if (okUrl(u)) return u; if (opts.strict) throw bad('Lien invalide.'); return ''; }

  function normalizeSection(s, opts) {
    opts = opts || {};
    if (!s || typeof s !== 'object' || !s.id) { if (opts.strict) throw bad('Section invalide.'); return null; }
    const c = s.content || {}, st = s.style || {}, v = s.visibility || {}, cd = s.code || {};
    return {
      id: str(s.id, 60), name: str(s.name, 120) || 'Section', kind: s.kind === 'code' ? 'code' : 'blocks',
      variant: str(s.variant, 30) || 'text', status: STATUSES.includes(s.status) ? s.status : 'draft', template: str(s.template, 40),
      content: {
        eyebrow: str(c.eyebrow, 200), title: str(c.title, 400), subtitle: str(c.subtitle, 800), text: str(c.text, 8000),
        image: img(c.image, opts, 'section'), imageAlt: str(c.imageAlt, 200),
        buttons: (Array.isArray(c.buttons) ? c.buttons : []).slice(0, 4).map((b) => ({ label: str(b && b.label, 80), url: url(b && b.url, opts), style: b && b.style === 'ghost' ? 'ghost' : 'primary' })),
        columns: num(c.columns, 1, 4, 3),
        items: (Array.isArray(c.items) ? c.items : []).slice(0, 40).map((i) => { i = i || {}; return { icon: str(i.icon, 8), title: str(i.title, 300), text: str(i.text, 3000), image: img(i.image, opts, 'élément'), value: str(i.value, 40), label: str(i.label, 200), url: url(i.url, opts), sub: str(i.sub, 200), rating: num(i.rating, 0, 5, 0) }; }),
      },
      style: {
        align: ['left', 'center', 'right'].includes(st.align) ? st.align : 'left',
        bg: COLOR.test(st.bg || '') ? (st.bg || '') : '', color: COLOR.test(st.color || '') ? (st.color || '') : '', accent: COLOR.test(st.accent || '') ? (st.accent || '') : '',
        bgImage: img(st.bgImage, opts, 'arrière-plan'), overlay: num(st.overlay, 0, 90, 0),
        padY: num(st.padY, 0, 240, 72), padX: num(st.padX, 0, 200, 0), gap: num(st.gap, 0, 80, 24),
        maxWidth: num(st.maxWidth, 320, 2000, 1180), minHeight: num(st.minHeight, 0, 1200, 0), radius: num(st.radius, 0, 48, 16),
        imagePos: st.imagePos === 'left' ? 'left' : 'right',
      },
      visibility: { desktop: v.desktop !== false, mobile: v.mobile !== false },
      code: { html: cleanHtml(cd.html), css: cleanCss(cd.css), height: num(cd.height, 0, 3000, 0) },
      updatedAt: +s.updatedAt || 0, publishedAt: +s.publishedAt || 0,
      history: (Array.isArray(s.history) ? s.history : []).slice(0, 15).map((h) => ({ t: +(h && h.t) || 0, label: str(h && h.label, 100), snapshot: h && h.snapshot && typeof h.snapshot === 'object' ? h.snapshot : null })),
    };
  }

  /* Positions : les ancres du site gardent leur ordre ; les sections publiées se placent librement entre elles */
  function normalizeLayout(layout, sections) {
    const pub = new Set((sections || []).filter((s) => s.status === 'published').map((s) => s.id));
    const seen = new Set(); const lay = [];
    for (const x0 of Array.isArray(layout) ? layout : []) { const x = String(x0); if (seen.has(x)) continue; if (FIXED_ANCHORS.includes(x) || pub.has(x)) { seen.add(x); lay.push(x); } }
    for (const a of FIXED_ANCHORS) if (!seen.has(a)) { seen.add(a); lay.push(a); }
    for (const id of pub) if (!seen.has(id)) { const fi = lay.indexOf('footer'); lay.splice(fi < 0 ? lay.length : fi, 0, id); seen.add(id); }
    const pos = lay.map((x, i) => (FIXED_ANCHORS.includes(x) ? i : -1)).filter((i) => i >= 0);
    FIXED_ANCHORS.forEach((a, k) => { lay[pos[k]] = a; });
    return lay;
  }

  function defaultSettings() {
    return normalizeSettings({});
  }
  function normalizeSettings(s) {
    s = s || {}; const pub = s.public || {}, prv = s.private || {};
    const idn = pub.identity || {}, seo = pub.seo || {}, pb = pub.publication || {}, fm = pub.forms || {}, sd = prv.sectionDefaults || {};
    return {
      public: {
        identity: { name: str(idn.name, 120), tagline: str(idn.tagline, 200), email: str(idn.email, 160), phone: str(idn.phone, 60), whatsapp: str(idn.whatsapp, 60), address: str(idn.address, 240), themeColor: /^#[0-9a-f]{6}$/i.test(idn.themeColor || '') ? idn.themeColor : '' },
        seo: { title: str(seo.title, 160), description: str(seo.description, 400), keywords: str(seo.keywords, 400), ogImage: str(seo.ogImage, 400), canonical: /^(https?:\/\/[^\s]+)?$/.test(seo.canonical || '') ? str(seo.canonical, 300) : '', noindex: !!seo.noindex, jsonLd: !!seo.jsonLd, robotsExtra: str(seo.robotsExtra, 2000) },
        publication: { pollSeconds: num(pb.pollSeconds, 10, 300, 30), maintenance: !!pb.maintenance, maintenanceTitle: str(pb.maintenanceTitle, 160), maintenanceText: str(pb.maintenanceText, 600) },
        forms: { serviceId: str(fm.serviceId, 80), templateId: str(fm.templateId, 80), publicKey: str(fm.publicKey, 80), toEmail: str(fm.toEmail, 160) },
      },
      private: {
        sectionDefaults: { status: STATUSES.includes(sd.status) ? sd.status : 'draft', padY: num(sd.padY, 0, 240, 72), align: ['left', 'center', 'right'].includes(sd.align) ? sd.align : 'left' },
        notes: str(prv.notes, 4000),
      },
    };
  }

  return { FIXED_ANCHORS, ANCHOR_LABELS, STATUSES, cleanHtml, cleanCss, normalizeSection, normalizeLayout, normalizeSettings, defaultSettings, bad };
});
