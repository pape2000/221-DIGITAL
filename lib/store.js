'use strict';
/* Couche de stockage unique. Production : Vercel Blob (store privé). Tests locaux : dossier (LOCAL_STORE_DIR).
   Toutes les écritures de documents JSON utilisent ifMatch (ETag) pour éviter les écrasements. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Conflict extends Error { constructor() { super('conflict'); this.code = 'conflict'; } }

function localImpl(dir) {
  const file = (p) => path.join(dir, p.replace(/\.\./g, '_'));
  const etagOf = (buf) => '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + '"';
  return {
    kind: 'local',
    async get(p) {
      try { const b = fs.readFileSync(file(p)); return { buf: b, etag: etagOf(b), size: b.length, uploadedAt: fs.statSync(file(p)).mtime }; }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async put(p, buf, { ifMatch, contentType } = {}) {
      const f = file(p); fs.mkdirSync(path.dirname(f), { recursive: true });
      const cur = fs.existsSync(f) ? etagOf(fs.readFileSync(f)) : null;
      if (ifMatch !== undefined && ifMatch !== null && ifMatch !== cur) throw new Conflict();
      if (ifMatch === null && cur) throw new Conflict();   // création seulement
      fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
      return { etag: etagOf(buf) };
    },
    async del(p) { try { fs.unlinkSync(file(p)); } catch (e) {} },
    async list(prefix) {
      const out = []; const root = file(prefix.replace(/\/$/, ''));
      const walk = (d, rel) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const f = path.join(d, n); const st = fs.statSync(f); if (st.isDirectory()) walk(f, rel + n + '/'); else if (!n.endsWith('.tmp')) out.push({ pathname: rel + n, size: st.size, uploadedAt: st.mtime }); } };
      walk(root, prefix.endsWith('/') ? prefix : prefix + '/'); return out;
    },
  };
}

function blobImpl() {
  const blob = require('@vercel/blob');
  const streamToBuf = async (s) => { const chunks = []; for await (const c of s) chunks.push(Buffer.from(c)); return Buffer.concat(chunks); };
  return {
    kind: 'blob',
    async get(p) {
      const r = await blob.get(p, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return { buf: await streamToBuf(r.stream), etag: r.blob.etag, size: r.blob.size, uploadedAt: r.blob.uploadedAt, contentType: r.blob.contentType };
    },
    async put(p, buf, { ifMatch, contentType } = {}) {
      const opt = { access: 'private', addRandomSuffix: false, allowOverwrite: ifMatch !== null, contentType: contentType || 'application/octet-stream', cacheControlMaxAge: 60 };
      if (typeof ifMatch === 'string') opt.ifMatch = ifMatch;
      try { const r = await blob.put(p, buf, opt); return { etag: r.etag }; }
      catch (e) {
        if (e && (e.name === 'BlobPreconditionFailedError' || /precondition/i.test(e.message || '') || /already exists/i.test(e.message || ''))) throw new Conflict();
        throw e;
      }
    },
    async del(p) { try { await blob.del(p); } catch (e) {} },
    async list(prefix) {
      const out = []; let cursor;
      do { const r = await blob.list({ prefix, cursor, limit: 1000 }); for (const b of r.blobs) out.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt }); cursor = r.hasMore ? r.cursor : null; } while (cursor);
      return out;
    },
  };
}

let impl = null;
function store() {
  if (impl) return impl;
  impl = process.env.LOCAL_STORE_DIR ? localImpl(process.env.LOCAL_STORE_DIR) : blobImpl();
  return impl;
}

/* Documents JSON avec ETag */
async function getJSON(p) {
  const r = await store().get(p); if (!r) return null;
  try { return { data: JSON.parse(r.buf.toString('utf8')), etag: r.etag }; } catch (e) { const err = new Error('JSON illisible : ' + p); err.code = 'corrupt'; throw err; }
}
async function putJSON(p, obj, ifMatch) {
  return store().put(p, Buffer.from(JSON.stringify(obj)), { ifMatch, contentType: 'application/json' });
}
/* Lecture-modification-écriture avec nouvelles tentatives en cas de conflit */
async function updateJSON(p, fn, fallback, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const cur = await getJSON(p);
    const next = fn(cur ? cur.data : JSON.parse(JSON.stringify(fallback)));
    try { await putJSON(p, next, cur ? cur.etag : null); return next; }
    catch (e) { if (e.code !== 'conflict') throw e; await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); }
  }
  const err = new Error('Trop de modifications simultanées, réessayez.'); err.code = 'busy'; throw err;
}

module.exports = { store, getJSON, putJSON, updateJSON, Conflict };
