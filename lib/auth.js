'use strict';
const crypto = require('crypto');
const { getJSON, updateJSON } = require('./store');

const P_CONF = 'auth/config.json', P_SESS = 'auth/sessions.json', P_LOG = 'auth/log.json', P_ATT = 'auth/attempts.json';
const COOKIE = 's221';

/* ---------- hachage du code (scrypt) ---------- */
function hashCode(code) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(code), salt, 32, { N: 16384, r: 8, p: 1 });
  return 'scrypt$16384$8$1$' + salt.toString('base64') + '$' + h.toString('base64');
}
function verifyCode(code, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const want = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(String(code), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(got, want);
  } catch (e) { return false; }
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- configuration (code officiel) ---------- */
async function getConfig() {
  const c = await getJSON(P_CONF);
  if (c) return { ...c.data, _source: 'blob' };
  /* Premier accès : le code initial est fourni par la variable d'environnement (empreinte uniquement, jamais en clair) */
  const envHash = process.env.ADMIN_INITIAL_CODE_HASH || '';
  return { hash: envHash, viewerHash: '', sessionDays: 7, maxFails: 5, lockMinutes: 15, initial: true, _source: 'env' };
}
async function saveConfig(patch) {
  const cur = await getConfig();
  const next = { hash: cur.hash, viewerHash: cur.viewerHash || '', sessionDays: cur.sessionDays || 7, maxFails: cur.maxFails || 5, lockMinutes: cur.lockMinutes || 15, ...patch, initial: false, updatedAt: Date.now() };
  await updateJSON(P_CONF, () => next, next);
  return next;
}

/* ---------- requête ---------- */
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || '?';
}
function cookies(req) {
  const o = {}; String(req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function isSecure(req) { return String(req.headers['x-forwarded-proto'] || '').includes('https') || !!process.env.VERCEL; }
function setCookie(req, res, token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/* ---------- limitation des tentatives ---------- */
async function checkLock(req, cfg) {
  const key = sha(clientIp(req)).slice(0, 24);
  const att = await getJSON(P_ATT);
  const now = Date.now(), win = (cfg.lockMinutes || 15) * 60000;
  const list = ((att && att.data.byIp && att.data.byIp[key]) || []).filter((t) => t > now - win);
  return { key, locked: list.length >= (cfg.maxFails || 5), count: list.length, retryMs: list.length ? Math.max(0, list[0] + win - now) : 0 };
}
async function addFail(key, cfg) {
  const win = (cfg.lockMinutes || 15) * 60000, now = Date.now();
  await updateJSON(P_ATT, (d) => {
    d.byIp = d.byIp || {};
    for (const k of Object.keys(d.byIp)) { d.byIp[k] = d.byIp[k].filter((t) => t > now - win); if (!d.byIp[k].length) delete d.byIp[k]; }
    (d.byIp[key] = d.byIp[key] || []).push(now); return d;
  }, { byIp: {} });
}
async function clearFails(key) {
  await updateJSON(P_ATT, (d) => { if (d.byIp) delete d.byIp[key]; return d; }, { byIp: {} });
}
async function logEvent(req, ok, role, note) {
  const ev = { t: Date.now(), ok: !!ok, ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 160), role: role || '', note: note || '' };
  await updateJSON(P_LOG, (d) => { d.events = [ev, ...(d.events || [])].slice(0, 200); return d; }, { events: [] }).catch(() => {});
}

/* ---------- connexion / sessions ---------- */
async function login(req, res, code) {
  const cfg = await getConfig();
  const lock = await checkLock(req, cfg);
  if (lock.locked) { await logEvent(req, false, '', 'bloqué'); return { error: 'Trop de tentatives. Réessayez dans ' + Math.ceil(lock.retryMs / 60000) + ' min.', status: 429, code: 'locked' }; }
  let role = '';
  if (code && cfg.hash && verifyCode(code, cfg.hash)) role = 'admin';
  else if (code && cfg.viewerHash && verifyCode(code, cfg.viewerHash)) role = 'viewer';
  if (!role) {
    await addFail(lock.key, cfg); await logEvent(req, false, '', 'code incorrect');
    await new Promise((r) => setTimeout(r, 500));
    return { error: 'Code incorrect.', status: 401, code: 'auth' };
  }
  await clearFails(lock.key);
  const token = crypto.randomBytes(32).toString('hex');
  const days = cfg.sessionDays || 7, now = Date.now();
  await updateJSON(P_SESS, (d) => {
    d.sessions = d.sessions || {};
    for (const k of Object.keys(d.sessions)) if (d.sessions[k].exp <= now) delete d.sessions[k];
    d.sessions[sha(token)] = { id: sha(token).slice(0, 10), created: now, last: now, exp: now + days * 86400000, ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 160), role };
    return d;
  }, { sessions: {} });
  await logEvent(req, true, role, 'connexion');
  setCookie(req, res, token, days * 86400);
  return { ok: true, role, initial: !!cfg.initial };
}
async function getSession(req) {
  const t = cookies(req)[COOKIE];
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const s = await getJSON(P_SESS); if (!s) return null;
  const sess = s.data.sessions && s.data.sessions[sha(t)];
  if (!sess || sess.exp <= Date.now()) return null;
  return { ...sess, key: sha(t) };
}
async function logout(req, res) {
  const t = cookies(req)[COOKIE];
  if (t) await updateJSON(P_SESS, (d) => { if (d.sessions) delete d.sessions[sha(t)]; return d; }, { sessions: {} });
  setCookie(req, res, '', 0);
}
async function listSessions(cur) {
  const s = await getJSON(P_SESS); const now = Date.now();
  return Object.entries((s && s.data.sessions) || {}).filter(([, v]) => v.exp > now)
    .map(([k, v]) => ({ id: v.id, created: v.created, exp: v.exp, ip: v.ip, ua: v.ua, role: v.role, current: k === cur.key })).sort((a, b) => b.created - a.created);
}
async function revokeSession(id, cur) {
  await updateJSON(P_SESS, (d) => { for (const k of Object.keys(d.sessions || {})) if (d.sessions[k].id === id && k !== cur.key) delete d.sessions[k]; return d; }, { sessions: {} });
}
async function revokeOthers(cur) {
  await updateJSON(P_SESS, (d) => { for (const k of Object.keys(d.sessions || {})) if (k !== cur.key) delete d.sessions[k]; return d; }, { sessions: {} });
}
async function revokeAll(req, res) {
  await updateJSON(P_SESS, () => ({ sessions: {} }), { sessions: {} });
  setCookie(req, res, '', 0);
}
async function history() {
  const l = await getJSON(P_LOG), a = await getJSON(P_ATT);
  return { events: (l && l.data.events) || [], lockedIps: Object.keys((a && a.data.byIp) || {}).length };
}

/* ---------- changement de code ---------- */
function codeProblem(code) {
  code = String(code || '');
  if (code.length < 10) return 'Le nouveau code doit contenir au moins 10 caractères.';
  if (/^(.)\1+$/.test(code)) return 'Code trop simple.';
  return '';
}

module.exports = { hashCode, verifyCode, getConfig, saveConfig, login, logout, getSession, listSessions, revokeSession, revokeOthers, revokeAll, history, codeProblem, clientIp, sha };
