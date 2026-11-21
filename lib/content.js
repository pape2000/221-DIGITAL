'use strict';
const crypto = require('crypto');
const { getJSON, putJSON, store, updateJSON } = require('./store');

const P_CONTENT = 'content/site.json';
const MAX_VERSIONS = 60;
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

/* ---------- validation côté serveur (schéma partagé avec le site et le gestionnaire) ---------- */
const S = require('../schema.js');
const { cleanHtml, cleanCss, normalizeSettings } = S;
const bad = S.bad;
function validateImageRef(v, where) {
  v = String(v == null ? '' : v);
  if (!v) return '';
  if (v.startsWith('data:image/')) { if (v.length > 300000) throw bad("Image non externalisée (" + where + ") : envoyez-la d'abord via le service de médias."); return v; }
  if (v.startsWith('@') || v.startsWith('/api/media/') || /^https:\/\//i.test(v)) return v;
  throw bad("Référence d'image invalide (" + where + ').');
}
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
    d.sections = d.sections.slice(0, 200).map((s) => S.normalizeSection(s, { strict: true }));
  }
  if (d.sections !== undefined || d.sectionLayout !== undefined) d.sectionLayout = S.normalizeLayout(d.sectionLayout, d.sections || []);
  if (d.settings !== undefined) { if (typeof d.settings !== 'object' || Array.isArray(d.settings)) throw bad('Paramètres invalides.'); d.settings = normalizeSettings(d.settings); }
  return d;
}

/* ---------- vue publique : uniquement ce qui est publié ---------- */
function publicView(d) {
  if (!d) return null;
  const out = { ...d };
  out.sections = (d.sections || []).filter((s) => s.status === 'published').map((s) => { const { history, ...rest } = s; return rest; });
  const ids = new Set(out.sections.map((s) => s.id));
  out.sectionLayout = (d.sectionLayout || []).filter((x) => S.FIXED_ANCHORS.includes(x) || ids.has(x));
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

module.exports = { P_CONTENT, FIXED_ANCHORS: S.FIXED_ANCHORS, STATUSES: S.STATUSES, cleanHtml, cleanCss, validateContent, normalizeSettings, publicView, readContent, writeContent, listVersions, restoreVersion, createBackup, saveMedia, getMedia, mediaRefs, counts, summarize, sniff };
