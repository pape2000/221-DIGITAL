'use strict';
const crypto = require('crypto');
const auth = require('../lib/auth');
const C = require('../lib/content');
const { getJSON, updateJSON, store } = require('../lib/store');

const MAX_JSON = 3 * 1024 * 1024, MAX_IMG = 4 * 1024 * 1024;
const SITE = 'https://www.221.digital';

function send(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const k in headers || {}) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(obj));
}
const fail = (res, status, error, code) => send(res, status, { ok: false, error, code: code || '' });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Contenu trop volumineux.'), { status: 413, code: 'too_large' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit = MAX_JSON) {
  const b = await readBody(req, limit);
  try { const j = JSON.parse(b.toString('utf8') || '{}'); if (!j || typeof j !== 'object') throw 0; return j; }
  catch (e) { throw Object.assign(new Error('Corps JSON invalide.'), { status: 400, code: 'bad_json' }); }
}

/* Protection CSRF : requêtes modifiantes → en-tête personnalisé + origine identique */
function csrfOk(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers['x-221'] !== '1') return false;
  const o = req.headers.origin;
  if (o) { try { if (new URL(o).host !== req.headers.host) return false; } catch (e) { return false; } }
  return true;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const parts = route.split('/');
  try {
    if (!csrfOk(req)) return fail(res, 403, 'Requête refusée (protection CSRF).', 'csrf');

    /* ======== PUBLIC ======== */
    if (route === 'content' && req.method === 'GET') {
      const { data, rev } = await C.readContent();
      const etag = '"p' + String(rev).replace(/"/g, '') + '"';
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30');
      if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.end(JSON.stringify({ ok: true, rev: etag, data: C.publicView(data) }));
    }
    if (parts[0] === 'media' && parts[1] && req.method === 'GET') {
      const m = await C.getMedia(parts[1]);
      if (!m) { res.statusCode = 404; return res.end('Not found'); }
      const ext = parts[1].split('.').pop(); const type = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif' }[ext];
      res.statusCode = 200; res.setHeader('Content-Type', type); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'"); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(m.buf);
    }
    if (route === 'hit' && req.method === 'POST') {
      const day = new Date().toISOString().slice(0, 10);
      await updateJSON('stats/hits.json', (d) => { d.days = d.days || {}; d.days[day] = (d.days[day] || 0) + 1; const keys = Object.keys(d.days).sort(); while (keys.length > 120) delete d.days[keys.shift()]; return d; }, { days: {} }, 3).catch(() => {});
      return send(res, 200, { ok: true });
    }
    if (route === 'seo/robots' && req.method === 'GET') {
      const { data } = await C.readContent(); const seo = (((data || {}).settings || {}).public || {}).seo || {};
      const body = seo.noindex ? 'User-agent: *\nDisallow: /\n' : ['User-agent: *', 'Allow: /', 'Allow: /api/media/', 'Allow: /favicon.ico', 'Disallow: /gestionnaire', 'Disallow: /api/', seo.robotsExtra || '', 'Sitemap: ' + SITE + '/sitemap.xml'].filter((x) => x !== '').join('\n') + '\n';
      res.statusCode = 200; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.end(body);
    }
    if (route === 'seo/sitemap' && req.method === 'GET') {
      const { rev } = await C.readContent();
      const lastmod = new Date().toISOString().slice(0, 10);
      const urls = ['/', '/#projets', '/#faq', '/#contact'].slice(0, 1);
      res.statusCode = 200; res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n');
    }

    /* ======== AUTHENTIFICATION ======== */
    if (route === 'auth/login' && req.method === 'POST') {
      const b = await readJson(req, 4096);
      const r = await auth.login(req, res, String(b.code || ''));
      return r.error ? fail(res, r.status, r.error, r.code) : send(res, 200, r);
    }
    const sess = await auth.getSession(req);
    if (route === 'auth/me' && req.method === 'GET') {
      const cfg = await auth.getConfig();
      return send(res, 200, { ok: true, logged: !!sess, role: sess ? sess.role : null, initial: !!(sess && cfg.initial), configured: !!cfg.hash });
    }
    if (route === 'auth/logout' && req.method === 'POST') { await auth.logout(req, res); return send(res, 200, { ok: true }); }

    /* ======== ADMIN : session obligatoire ======== */
    if (parts[0] === 'auth' || parts[0] === 'admin') {
      if (!sess) return fail(res, 401, 'Session expirée ou absente : reconnectez-vous.', 'auth');
      const isAdmin = sess.role === 'admin';
      const needAdmin = () => { if (!isAdmin) { fail(res, 403, 'Accès en lecture seule : cette action est réservée au code principal.', 'forbidden'); return false; } return true; };
      const who = sess.role + ':' + sess.id;

      if (route === 'auth/sessions' && req.method === 'GET') return send(res, 200, { ok: true, sessions: await auth.listSessions(sess) });
      if (route === 'auth/history' && req.method === 'GET') { const h = await auth.history(); const cfg = await auth.getConfig(); return send(res, 200, { ok: true, ...h, config: { sessionDays: cfg.sessionDays || 7, maxFails: cfg.maxFails || 5, lockMinutes: cfg.lockMinutes || 15, hasViewer: !!cfg.viewerHash, updatedAt: cfg.updatedAt || null } }); }
      if (route === 'auth/revoke' && req.method === 'POST') { if (!needAdmin()) return; const b = await readJson(req, 2048); await auth.revokeSession(String(b.id || ''), sess); return send(res, 200, { ok: true, sessions: await auth.listSessions(sess) }); }
      if (route === 'auth/revoke-others' && req.method === 'POST') { if (!needAdmin()) return; await auth.revokeOthers(sess); return send(res, 200, { ok: true, sessions: await auth.listSessions(sess) }); }
      if (route === 'auth/logout-all' && req.method === 'POST') { if (!needAdmin()) return; await auth.revokeAll(req, res); return send(res, 200, { ok: true }); }
      if (route === 'auth/change-code' && req.method === 'POST') {
        if (!needAdmin()) return;
        const b = await readJson(req, 4096); const cfg = await auth.getConfig();
        if (!auth.verifyCode(String(b.oldCode || ''), cfg.hash)) { await new Promise((r) => setTimeout(r, 500)); return fail(res, 401, 'Ancien code incorrect.', 'bad_old'); }
        if (b.newCode !== b.confirmCode) return fail(res, 400, 'Les deux nouveaux codes ne correspondent pas.', 'mismatch');
        const p = auth.codeProblem(b.newCode); if (p) return fail(res, 400, p, 'weak');
        if (b.newCode === b.oldCode) return fail(res, 400, "Le nouveau code doit être différent de l'ancien.", 'same');
        const newHash = auth.hashCode(b.newCode);
        const saved = await auth.saveConfig({ hash: newHash });
        if (!auth.verifyCode(b.newCode, (await auth.getConfig()).hash)) return fail(res, 500, "Le nouveau code n'a pas pu être vérifié après enregistrement.", 'verify');   // vérification réelle
        await auth.revokeOthers(sess);                                  // toutes les anciennes sessions sont révoquées
        return send(res, 200, { ok: true, verified: true, updatedAt: saved.updatedAt });
      }
      if (route === 'auth/settings' && req.method === 'POST') {
        if (!needAdmin()) return; const b = await readJson(req, 4096); const patch = {};
        if (b.sessionDays !== undefined) patch.sessionDays = [1, 7, 30].includes(+b.sessionDays) ? +b.sessionDays : 7;
        if (b.maxFails !== undefined) patch.maxFails = Math.min(10, Math.max(3, parseInt(b.maxFails, 10) || 5));
        if (b.lockMinutes !== undefined) patch.lockMinutes = Math.min(120, Math.max(5, parseInt(b.lockMinutes, 10) || 15));
        if (b.viewerCode !== undefined) {
          if (b.viewerCode === '') patch.viewerHash = '';
          else { const p = auth.codeProblem(b.viewerCode); if (p) return fail(res, 400, p, 'weak'); const cfg = await auth.getConfig(); if (auth.verifyCode(b.viewerCode, cfg.hash)) return fail(res, 400, 'Le code lecteur doit différer du code principal.', 'same'); patch.viewerHash = auth.hashCode(b.viewerCode); }
        }
        const s = await auth.saveConfig(patch);
        return send(res, 200, { ok: true, config: { sessionDays: s.sessionDays, maxFails: s.maxFails, lockMinutes: s.lockMinutes, hasViewer: !!s.viewerHash } });
      }

      /* ----- contenu ----- */
      if (route === 'admin/content' && req.method === 'GET') { const { data, rev } = await C.readContent(); return send(res, 200, { ok: true, rev, data, role: sess.role }); }
      if (route === 'admin/content' && req.method === 'PUT') {
        if (!needAdmin()) return; const b = await readJson(req);
        const r = await C.writeContent(b.data, b.baseRev, who, String(b.label || '').slice(0, 80));
        return send(res, 200, { ok: true, ...r });
      }
      if (route === 'admin/media' && req.method === 'POST') {
        if (!needAdmin()) return; const buf = await readBody(req, MAX_IMG);
        return send(res, 200, { ok: true, ...(await C.saveMedia(buf)) });
      }
      if (route === 'admin/media' && req.method === 'GET') {
        const { data } = await C.readContent(); const refs = C.mediaRefs(data);
        const list = (await store().list('media/')).map((b) => ({ id: b.pathname.replace('media/', ''), size: b.size, uploadedAt: b.uploadedAt, used: refs.has(b.pathname.replace('media/', '')), url: '/api/media/' + b.pathname.replace('media/', '') }));
        return send(res, 200, { ok: true, media: list.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)) });
      }
      if (route === 'admin/media/delete' && req.method === 'POST') {
        if (!needAdmin()) return; const b = await readJson(req, 2048); const id = String(b.id || '');
        if (!/^[a-f0-9]{20}\.\w+$/.test(id)) return fail(res, 400, 'Identifiant invalide.');
        const { data } = await C.readContent(); if (C.mediaRefs(data).has(id)) return fail(res, 409, "Cette image est encore utilisée sur le site : elle n'a pas été supprimée.", 'in_use');
        await store().del('media/' + id); return send(res, 200, { ok: true });
      }
      if (route === 'admin/versions' && req.method === 'GET') return send(res, 200, { ok: true, versions: await C.listVersions() });
      if (route === 'admin/versions/restore' && req.method === 'POST') { if (!needAdmin()) return; const b = await readJson(req, 2048); return send(res, 200, { ok: true, ...(await C.restoreVersion(String(b.id || ''), who)) }); }
      if (route === 'admin/versions/create' && req.method === 'POST') { if (!needAdmin()) return; const b = await readJson(req, 2048); return send(res, 200, { ok: true, ...(await C.createBackup(String(b.label || '').slice(0, 100), who)) }); }
      if (route === 'admin/versions/delete' && req.method === 'POST') { if (!needAdmin()) return; const b = await readJson(req, 2048); if (!/^v-\d+-[a-f0-9]{6}$/.test(String(b.id))) return fail(res, 400, 'Identifiant invalide.'); await store().del('history/' + b.id + '.json'); return send(res, 200, { ok: true }); }
      if (route === 'admin/log' && req.method === 'GET') { const l = await getJSON('history/log.json'); return send(res, 200, { ok: true, entries: (l && l.data.entries) || [] }); }
      if (route === 'admin/stats' && req.method === 'GET') {
        const h = await getJSON('stats/hits.json'); const c = await C.readContent(); const media = await store().list('media/');
        return send(res, 200, { ok: true, days: (h && h.data.days) || {}, counts: C.counts(c.data), contentBytes: JSON.stringify(c.data || {}).length, mediaCount: media.length, mediaBytes: media.reduce((a, b) => a + (b.size || 0), 0) });
      }
      if (route === 'admin/status' && req.method === 'GET') {
        const t0 = Date.now(); const c = await C.readContent(); const ms = Date.now() - t0; const log = await getJSON('history/log.json');
        const e = process.env;
        return send(res, 200, { ok: true, storage: store().kind, storageMs: ms, rev: c.rev, hasContent: !!c.data, lastSave: log && log.data.entries && log.data.entries[0] || null, now: Date.now(),
          deploy: { env: e.VERCEL_ENV || 'local', id: e.VERCEL_DEPLOYMENT_ID || '', url: e.VERCEL_URL || '', region: e.VERCEL_REGION || '', sha: e.VERCEL_GIT_COMMIT_SHA || '', ref: e.VERCEL_GIT_COMMIT_REF || '', message: e.VERCEL_GIT_COMMIT_MESSAGE || '', repo: (e.VERCEL_GIT_REPO_OWNER && e.VERCEL_GIT_REPO_SLUG) ? e.VERCEL_GIT_REPO_OWNER + '/' + e.VERCEL_GIT_REPO_SLUG : '' } });
      }
      if (route === 'admin/github' && req.method === 'GET') {
        const e = process.env; const repo = (e.VERCEL_GIT_REPO_OWNER && e.VERCEL_GIT_REPO_SLUG) ? e.VERCEL_GIT_REPO_OWNER + '/' + e.VERCEL_GIT_REPO_SLUG : 'pape2000/221-DIGITAL';
        try {
          const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
          const r = await fetch('https://api.github.com/repos/' + repo + '/commits/main', { headers: { 'User-Agent': '221-digital', Accept: 'application/vnd.github+json' }, signal: ctl.signal }); clearTimeout(to);
          if (!r.ok) return send(res, 200, { ok: true, reachable: false, repo, status: r.status, note: r.status === 404 ? 'Dépôt privé : vérification publique impossible.' : 'GitHub a répondu ' + r.status });
          const j = await r.json(); return send(res, 200, { ok: true, reachable: true, repo, sha: j.sha, message: (j.commit && j.commit.message || '').split('\n')[0], date: j.commit && j.commit.committer && j.commit.committer.date, url: j.html_url });
        } catch (err) { return send(res, 200, { ok: true, reachable: false, repo, note: 'GitHub injoignable depuis le serveur.' }); }
      }
      if (route === 'admin/selftest' && req.method === 'POST') {
        if (!needAdmin()) return; const id = 'selftest/' + crypto.randomBytes(6).toString('hex'); const payload = Buffer.from('221-' + Date.now());
        const t0 = Date.now(); await store().put(id, payload, { contentType: 'text/plain' }); const back = await store().get(id); await store().del(id);
        return send(res, 200, { ok: true, written: true, readBack: !!back && back.buf.equals(payload), ms: Date.now() - t0 });
      }
    }
    return fail(res, 404, 'Route inconnue.', 'not_found');
  } catch (e) {
    console.error('[api]', route, e && e.message);
    const status = e.status || (e.code === 'busy' ? 503 : 500);
    return fail(res, status, status === 500 ? 'Erreur serveur : ' + (e.message || 'inconnue') : e.message, e.code);
  }
};
