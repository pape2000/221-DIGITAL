'use strict';
const crypto = require('crypto');
const { getJSON, putJSON, store, updateJSON } = require('./store');

const P_CONTENT = 'content/site.json';
const MAX_VERSIONS = 60;
const STATUSES = ['draft', 'library', 'published', 'archived'];
const FIXED_ANCHORS = ['accueil', 'services', 'pourquoi', 'methode', 'temoignages', 'chiffres', 'references', 'footer'];
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

/* ---------- assainissement du code personnalisé (défense en profondeur : l'isolation réelle est l'iframe sans script + CSP) ---------- */
function cleanHtml(html) {
  return String(html || '').slice(0, 200000)
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|frame|frameset|applet)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|input|button\s+formaction)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|action|formaction|srcdoc)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'>\s]*("|')?/gi, '$1="#"');
}
function cleanCss(css) {
  return String(css || '').slice(0, 100000)
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(|behavior\s*:|-moz-binding\s*:|javascript\s*:/gi, '')
    .replace(/url\(\s*(['"]?)\s*(?!https:|data:image\/(png|jpe?g|webp|gif);|\/api\/media\/)[^)]*\)/gi, 'url()');
}

/* ---------- validation / normalisation côté serveur ---------- */
const str = (v, n = 5000) => String(v == null ? '' : v).slice(0, n);
const okUrl = (u) => /^(https?:\/\/|\/api\/media\/|mailto:|tel:|#|\/)/i.test(u) || u === '';
function validateImageRef(v, where) {
  v = str(v, 400000);
  if (!v) return '';
  if (v.startsWith('data:image/')) { if (v.length > 300000) throw bad('Image non externalisée (' + where + ') : envoyez-la d\'abord via le service de médias.'); return v; }
  if (v.startsWith('@') || v.startsWith('/api/media/') || /^https:\/\//i.test(v)) return v;
  throw bad('Référence d\'image invalide (' + where + ').');
}
function bad(msg) { const e = new Error(msg); e.status = 422; e.code = 'invalid'; return e; }

function normalizeSection(s) {
  if (!s || typeof s !== 'object' || !s.id) throw bad('Section invalide.');
  const c = s.content || {}, st = s.style || {}, v = s.visibility || {};
  const out = {
    id: str(s.id, 60), name: str(s.name, 120) || 'Section', kind: s.kind === 'code' ? 'code' : 'blocks',
    variant: str(s.variant, 30) || 'text', status: STATUSES.includes(s.status) ? s.status : 'draft', template: str(s.template, 40),
    content: {
      eyebrow: str(c.eyebrow, 200), title: str(c.title, 400), subtitle: str(c.subtitle, 800), text: str(c.text, 8000),
      image: validateImageRef(c.image, 'section'), imageAlt: str(c.imageAlt, 200),
      buttons: (Array.isArray(c.buttons) ? c.buttons : []).slice(0, 4).map((b) => { const u = str(b && b.url, 800); if (!okUrl(u)) throw bad('Lien de bouton invalide.'); return { label: str(b && b.label, 80), url: u, style: b && b.style === 'ghost' ? 'ghost' : 'primary' }; }),
      columns: Math.min(4, Math.max(1, parseInt(c.columns, 10) || 3)),
      items: (Array.isArray(c.items) ? c.items : []).slice(0, 40).map((i) => { i = i || {}; const u = str(i.url, 800); if (!okUrl(u)) throw bad('Lien invalide.'); return { icon: str(i.icon, 8), title: str(i.title, 300), text: str(i.text, 3000), image: validateImageRef(i.image, 'élément'), value: str(i.value, 40), label: str(i.label, 200), url: u, sub: str(i.sub, 200), rating: Math.min(5, Math.max(0, parseInt(i.rating, 10) || 0)) }; }),
    },
    style: {
      align: ['left', 'center', 'right'].includes(st.align) ? st.align : 'left', bg: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z-]+\)|)$/i.test(st.bg || '') ? (st.bg || '') : '',
      color: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z-]+\)|)$/i.test(st.color || '') ? (st.color || '') : '',
      accent: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z-]+\)|)$/i.test(st.accent || '') ? (st.accent || '') : '',
      bgImage: validateImageRef(st.bgImage, 'arrière-plan'), overlay: Math.min(90, Math.max(0, parseInt(st.overlay, 10) || 0)),
      padY: Math.min(240, Math.max(0, parseInt(st.padY, 10) || 0)), padX: Math.min(200, Math.max(0, parseInt(st.padX, 10) || 0)),
      gap: Math.min(80, Math.max(0, parseInt(st.gap, 10) || 24)), maxWidth: Math.min(2000, Math.max(320, parseInt(st.maxWidth, 10) || 1180)),
      minHeight: Math.min(1200, Math.max(0, parseInt(st.minHeight, 10) || 0)), radius: Math.min(48, Math.max(0, parseInt(st.radius, 10) || 16)),
      imagePos: st.imagePos === 'left' ? 'left' : 'right',
    },
    visibility: { desktop: v.desktop !== false, mobile: v.mobile !== false },
    code: { html: cleanHtml(s.code && s.code.html), css: cleanCss(s.code && s.code.css), height: Math.min(3000, Math.max(0, parseInt(s.code && s.code.height, 10) || 0)) },
    updatedAt: +s.updatedAt || Date.now(), publishedAt: +s.publishedAt || 0,
    history: (Array.isArray(s.history) ? s.history : []).slice(0, 15).map((h) => ({ t: +h.t || 0, label: str(h.label, 100), snapshot: h.snapshot && typeof h.snapshot === 'object' ? h.snapshot : null })),
  };
  return out;
}

/* Valide ce qui est propre au gestionnaire ; le contenu historique (logos, projets, clients, avis) est conservé tel que normalisé par le client */
function validateContent(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw bad('Les données doivent être un objet.');
  for (const k of ['logos', 'projects', 'clients', 'reviews']) if (d[k] !== undefined && !Array.isArray(d[k])) throw bad('Le champ « ' + k + ' » doit être une liste.');
  for (const p of d.projects || []) {
    if (!p || typeof p.url !== 'string' || !/^https?:\/\//i.test(p.url)) throw bad('Un projet a une adresse invalide (http/https obligatoire).');
    validateImageRef(p.img, 'projet');
  }
  for (const l of d.logos || []) validateImageRef(l.src, 'logo');
  for (const c of d.clients || []) validateImageRef(c.logo, 'client');
  validateImageRef(d.hero, 'hero');
  if (d.sections !== undefined) {
    if (!Array.isArray(d.sections)) throw bad('Le champ « sections » doit être une liste.');
    d.sections = d.sections.slice(0, 200).map(normalizeSection);
  }
  if (d.sectionLayout !== undefined) {
    if (!Array.isArray(d.sectionLayout)) throw bad('Disposition invalide.');
    const ids = new Set((d.sections || []).filter((s) => s.status === 'published').map((s) => s.id));
    const seen = new Set(); const lay = [];
    for (const x0 of d.sectionLayout) { const x = String(x0); if (seen.has(x)) continue; if (FIXED_ANCHORS.includes(x) || ids.has(x)) { seen.add(x); lay.push(x); } }
    for (const a of FIXED_ANCHORS) if (!seen.has(a)) lay.push(a);          // ancres du site toujours présentes
    for (const id of ids) if (!seen.has(id)) lay.push(id);                   // section publiée sans position → avant le pied de page
    /* l'ordre des ancres du site est imposé */
    const fixedPos = lay.map((x, i) => (FIXED_ANCHORS.includes(x) ? i : -1)).filter((i) => i >= 0);
    FIXED_ANCHORS.forEach((a, k) => { lay[fixedPos[k]] = a; });
    d.sectionLayout = lay;
  }
  if (d.settings !== undefined && (typeof d.settings !== 'object' || Array.isArray(d.settings))) throw bad('Paramètres invalides.');
  if (d.settings) d.settings = normalizeSettings(d.settings);
  return d;
}

function normalizeSettings(s) {
  const pub = s.public || {}, prv = s.private || {};
  const t = (v, n) => str(v, n);
  const num = (v, a, b, def) => Math.min(b, Math.max(a, parseInt(v, 10) || def));
  const idn = pub.identity || {}, seo = pub.seo || {}, pb = pub.publication || {}, fm = pub.forms || {};
  return {
    public: {
      identity: { name: t(idn.name, 120), tagline: t(idn.tagline, 200), email: t(idn.email, 160), phone: t(idn.phone, 60), whatsapp: t(idn.whatsapp, 60), address: t(idn.address, 240), themeColor: /^#[0-9a-f]{6}$/i.test(idn.themeColor || '') ? idn.themeColor : '' },
      seo: { title: t(seo.title, 160), description: t(seo.description, 400), keywords: t(seo.keywords, 400), ogImage: t(seo.ogImage, 400), canonical: /^(https?:\/\/[^\s]+)?$/.test(seo.canonical || '') ? t(seo.canonical, 300) : '', noindex: !!seo.noindex, jsonLd: !!seo.jsonLd, robotsExtra: t(seo.robotsExtra, 2000) },
      publication: { pollSeconds: num(pb.pollSeconds, 10, 300, 30), maintenance: !!pb.maintenance, maintenanceTitle: t(pb.maintenanceTitle, 160), maintenanceText: t(pb.maintenanceText, 600) },
      forms: { serviceId: t(fm.serviceId, 80), templateId: t(fm.templateId, 80), publicKey: t(fm.publicKey, 80), toEmail: t(fm.toEmail, 160) },
    },
    private: {
      sectionDefaults: { status: STATUSES.includes(prv.sectionDefaults && prv.sectionDefaults.status) ? prv.sectionDefaults.status : 'draft', padY: num(prv.sectionDefaults && prv.sectionDefaults.padY, 0, 240, 72), align: ['left', 'center', 'right'].includes(prv.sectionDefaults && prv.sectionDefaults.align) ? prv.sectionDefaults.align : 'left' },
      notes: t(prv.notes, 4000),
    },
  };
}

/* ---------- vue publique : uniquement ce qui est publié ---------- */
function publicView(d) {
  if (!d) return null;
  const out = { ...d };
  out.sections = (d.sections || []).filter((s) => s.status === 'published').map((s) => { const { history, ...rest } = s; return rest; });
  const ids = new Set(out.sections.map((s) => s.id));
  out.sectionLayout = (d.sectionLayout || []).filter((x) => FIXED_ANCHORS.includes(x) || ids.has(x));
  out.settings = d.settings ? { public: d.settings.public || {} } : undefined;
  if (out.settings === undefined) delete out.settings;
  return out;
}

/* ---------- lecture / écriture avec versions ---------- */
async function readContent() { const r = await getJSON(P_CONTENT); return r ? { data: r.data, rev: r.etag } : { data: null, rev: 'none' }; }

function summarize(prev, next) {
  const cnt = (k) => (Array.isArray(next[k]) ? next[k].length : 0) - (prev && Array.isArray(prev[k]) ? prev[k].length : 0);
  const parts = [];
  const changed = (k) => JSON.stringify((prev || {})[k] || (Array.isArray(next[k]) ? [] : undefined)) !== JSON.stringify(next[k] || (Array.isArray(next[k]) ? [] : undefined));
  const label = { projects: 'projets', logos: 'logos', clients: 'clients', reviews: 'avis', sections: 'sections' };
  for (const k of Object.keys(label)) if (changed(k)) { const d = cnt(k); parts.push(label[k] + (d ? ' (' + (d > 0 ? '+' : '') + d + ')' : ' modifiés')); }
  for (const k of ['hero', 'speed', 'sectionLayout', 'settings']) if (changed(k)) parts.push({ hero: 'photo Projets', speed: 'vitesse logos', sectionLayout: 'positions', settings: 'paramètres' }[k]);
  return parts.length ? parts.join(', ') : 'aucun changement de contenu';
}

async function writeContent(data, baseRev, who, label) {
  validateContent(data);
  const cur = await getJSON(P_CONTENT);
  const curRev = cur ? cur.etag : 'none';
  if (baseRev !== undefined && baseRev !== null && baseRev !== curRev) { const e = new Error("Le site a été modifié depuis votre dernière lecture (autre onglet ou appareil). Rien n'a été écrasé : rechargez le gestionnaire puis refaites la modification."); e.status = 409; e.code = 'conflict'; throw e; }
  const t = Date.now();
  if (cur) await putJSON('history/v-' + String(t).padStart(14, '0') + '-' + sha1(curRev).slice(0, 6) + '.json', { t, label: 'Avant ' + (label || 'modification'), by: who, data: cur.data }).catch(() => {});
  let put;
  try { put = await putJSON(P_CONTENT, data, cur ? cur.etag : null); }
  catch (e) { if (e.code === 'conflict') { const err = new Error('Conflit d\'écriture : une autre modification vient d\'être enregistrée. Rien n\'a été écrasé, rechargez.'); err.status = 409; err.code = 'conflict'; throw err; } throw e; }
  const back = await getJSON(P_CONTENT);               // relecture de contrôle
  if (!back || JSON.stringify(back.data) !== JSON.stringify(data)) { const e = new Error('Relecture après écriture non conforme.'); e.status = 500; e.code = 'verify'; throw e; }
  const summary = summarize(cur && cur.data, data);
  await updateJSON('history/log.json', (d) => { d.entries = [{ t, by: who, label: label || '', summary, rev: back.etag }, ...(d.entries || [])].slice(0, 300); return d; }, { entries: [] }).catch(() => {});
  /* limite de versions conservées */
  try { const list = (await store().list('history/')).filter((b) => /history\/v-/.test(b.pathname)).sort((a, b) => a.pathname.localeCompare(b.pathname)); while (list.length > MAX_VERSIONS) await store().del(list.shift().pathname); } catch (e) {}
  return { rev: back.etag, savedAt: t, summary };
}

async function listVersions() {
  const list = (await store().list('history/')).filter((b) => /history\/v-/.test(b.pathname)).sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, MAX_VERSIONS);
  const out = [];
  for (const b of list.slice(0, 30)) { const j = await getJSON(b.pathname); if (j) out.push({ id: b.pathname.replace('history/', '').replace('.json', ''), t: j.data.t, label: j.data.label, by: j.data.by, size: b.size, counts: counts(j.data.data) }); }
  return out;
}
function counts(d) { d = d || {}; return { projects: (d.projects || []).length, logos: (d.logos || []).length, clients: (d.clients || []).length, reviews: (d.reviews || []).length, sections: (d.sections || []).length }; }
async function restoreVersion(id, who) {
  if (!/^v-\d+-[a-f0-9]{6}$/.test(id)) throw bad('Version inconnue.');
  const v = await getJSON('history/' + id + '.json'); if (!v) throw bad('Version introuvable.');
  const r = await writeContent(v.data.data, undefined, who, 'restauration ' + id);
  return r;
}
async function createBackup(label, who) {
  const cur = await getJSON(P_CONTENT); if (!cur) throw bad('Rien à sauvegarder : aucune donnée enregistrée.');
  const t = Date.now(); await putJSON('history/v-' + String(t).padStart(14, '0') + '-' + sha1(cur.etag).slice(0, 6) + '.json', { t, label: label || 'Sauvegarde manuelle', by: who, data: cur.data });
  return { t };
}

/* ---------- médias ---------- */
const MEDIA_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
function sniff(buf) {
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length > 8 && buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length > 6 && /^GIF8[79]a/.test(buf.slice(0, 6).toString())) return 'image/gif';
  return null;
}
async function saveMedia(buf) {
  const type = sniff(buf); if (!type) throw bad('Format d\'image non accepté (WebP, PNG, JPEG ou GIF).');
  const id = sha1(buf).slice(0, 20) + '.' + MEDIA_TYPES[type];
  const ex = await store().get('media/' + id);
  if (!ex) await store().put('media/' + id, buf, { contentType: type });
  return { id, url: '/api/media/' + id, type, size: buf.length };
}
async function getMedia(id) {
  if (!/^[a-f0-9]{20}\.(webp|png|jpg|gif)$/.test(id)) return null;
  return store().get('media/' + id);
}
function mediaRefs(d) {
  const refs = new Set(); const add = (v) => { const m = /\/api\/media\/([a-f0-9]{20}\.\w+)/.exec(v || ''); if (m) refs.add(m[1]); };
  const walk = (o) => { if (!o) return; if (typeof o === 'string') return add(o); if (Array.isArray(o)) return o.forEach(walk); if (typeof o === 'object') Object.values(o).forEach(walk); };
  walk(d); return refs;
}

module.exports = { P_CONTENT, FIXED_ANCHORS, STATUSES, cleanHtml, cleanCss, validateContent, normalizeSettings, publicView, readContent, writeContent, listVersions, restoreVersion, createBackup, saveMedia, getMedia, mediaRefs, counts, summarize, sniff };
