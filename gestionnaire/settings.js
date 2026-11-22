/* ==========================================================================
   221 DIGITAL — Paramètres (Sécurité + Détails) et note de contrôle
   window.SettingsUI = { init(), open(tab?), renderControlNote() }
   Toutes les écritures passent par le serveur (commit / Store221.api) ; rien n'est simulé.
   ========================================================================== */
(function () {
  'use strict';
  const q = (s, r) => (r || document).querySelector(s);
  const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const E = (s) => esc(s);
  const api = (p, o) => Store221.api(p, o);
  const viewer = () => Store221.role === 'viewer';
  const GITHUB_URL = 'https://github.com/pape2000/221-DIGITAL';
  const VERCEL_URL = 'https://vercel.com/221-digital/221-digital';
  const MANAGER_URL = 'https://www.221.digital/gestionnaire';
  const SITE_URL = 'https://www.221.digital/';

  /* ---------------- outils ---------------- */
  const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const fmtBytes = (n) => { n = +n || 0; if (n < 1024) return n + ' o'; if (n < 1048576) return (n / 1024).toFixed(1).replace('.', ',') + ' Ko'; return (n / 1048576).toFixed(2).replace('.', ',') + ' Mo'; };
  const shortSha = (s) => (s ? String(s).slice(0, 7) : '');
  function ago(t) {
    if (!t) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'à l’instant'; if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min'; if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'il y a ' + Math.round(s / 86400) + ' j';
  }
  function uaLabel(u) {
    u = String(u || '');
    const b = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : u ? 'Navigateur' : 'Appareil inconnu';
    const o = /Windows/.test(u) ? 'Windows' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Mac OS/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : '';
    return b + (o ? ' · ' + o : '');
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (x) {} ta.remove(); return ok; }
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach((k) => { c = c[k] = c[k] || {}; }); c[ks[ks.length - 1]] = v; }
  const settingsNow = () => Schema221.normalizeSettings((saved && saved.settings) || {});
  const gv = (p) => getPath(settingsNow(), p);
  const pageLastError = () => { try { return typeof lastError !== 'undefined' ? lastError : ''; } catch (e) { return ''; } };

  /* journal des appels en échec (pour la note de contrôle) */
  const errLog = [];
  function logErr(where, e) { errLog.unshift({ t: Date.now(), where, msg: (e && e.message) || String(e) }); errLog.length = Math.min(errLog.length, 10); }
  async function call(path, opt) { try { return await api(path, opt); } catch (e) { logErr(path, e); throw e; } }

  /* Libellé transmis au journal d'audit pour les enregistrements faits ici */
  let pendingLabel = '';
  function wrapSave() {
    if (Store221.__stgWrapped) return; Store221.__stgWrapped = true;
    const orig = Store221.save;
    Store221.save = (d, l) => orig(d, l || pendingLabel || '');
  }
  async function commitL(label, mutate) {
    pendingLabel = label || '';
    try { return await commit(mutate); } finally { pendingLabel = ''; }
  }

  /* confirmation propre (le gestionnaire n'a que « Supprimer ») */
  function stgConfirm(title, text, okLabel, opt) {
    opt = opt || {};
    return new Promise((res) => {
      const ov = document.createElement('div'); ov.className = 'overlay stg-ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true');
      ov.innerHTML = `<div class="dialog"><h2>${E(title)}</h2><p>${E(text)}</p>${opt.type ? `<div class="field" style="margin-top:14px"><label for="stgCfType">Tapez <strong>${E(opt.type)}</strong> pour confirmer</label><input type="text" id="stgCfType" autocomplete="off"></div>` : ''}<div class="row"><button type="button" class="btn btn-light" data-no>Annuler</button><button type="button" class="btn ${opt.danger === false ? 'btn-primary' : 'btn-danger'}" data-yes ${opt.type ? 'disabled' : ''}>${E(okLabel || 'Confirmer')}</button></div></div>`;
      document.body.appendChild(ov);
      const prev = document.activeElement; const yes = q('[data-yes]', ov), no = q('[data-no]', ov), inp = q('#stgCfType', ov);
      if (inp) inp.addEventListener('input', () => { yes.disabled = inp.value.trim() !== opt.type; });
      const done = (v) => { ov.remove(); if (prev && prev.focus) prev.focus(); res(v); };
      yes.onclick = () => done(true); no.onclick = () => done(false);
      ov.onclick = (e) => { if (e.target === ov) done(false); };
      ov.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
      (inp || no).focus();
    });
  }

  /* ======================================================================
     NOTE DE CONTRÔLE
     ====================================================================== */
  const CN = { status: null, github: null, pub: null, loading: false, lastRev: undefined, ts: 0, open: true, copied: '' };
  try { CN.open = localStorage.getItem('221-cn-open') !== '0'; } catch (e) {}
  const expectedPubRev = () => '"p' + String(Store221.rev || '').replace(/"/g, '') + '"';

  async function refreshControl(force) {
    if (CN.loading) return; CN.loading = true;
    const t0 = Date.now();
    const [st, gh, pub] = await Promise.all([
      call('admin/status').catch((e) => ({ _err: e.message })),
      call('admin/github').catch((e) => ({ _err: e.message })),
      fetch('/api/content?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).catch((e) => ({ _err: e.message })),
    ]);
    CN.status = st; CN.github = gh; CN.pub = pub; CN.ts = Date.now(); CN.ms = Date.now() - t0; CN.lastRev = Store221.rev; CN.loading = false;
    renderControlNote(true);
  }
  function chip(kind, text) { return `<span class="stg-chip is-${kind}">${E(text)}</span>`; }
  function syncState() {
    if (!CN.pub) return { k: 'wait', t: 'Vérification…', d: '' };
    if (CN.pub._err) return { k: 'bad', t: 'Site illisible', d: CN.pub._err };
    const same = CN.pub.rev === expectedPubRev();
    const dirty = typeof isDirty === 'function' && isDirty();
    if (same) return { k: 'ok', t: dirty ? 'Synchronisé (hors modifications en cours)' : 'Synchronisé', d: 'Le site public sert exactement la dernière version enregistrée.' };
    return { k: 'warn', t: 'En attente', d: 'Le site public n’a pas encore la dernière révision (mise en cache de quelques secondes) — cliquez sur Actualiser.' };
  }
  function renderControlNote(fromRefresh) {
    const host = q('#controlNote'); if (!host) return;
    if (!fromRefresh && Store221.rev !== CN.lastRev && !CN.loading) refreshControl();
    const st = CN.status || {}, gh = CN.github || {}, dep = st.deploy || {};
    const sy = syncState();
    const errs = [];
    if (pageLastError()) errs.push('Dernier enregistrement : ' + pageLastError());
    if (st._err) errs.push('État du serveur : ' + st._err);
    if (CN.pub && CN.pub._err) errs.push('Lecture publique : ' + CN.pub._err);
    errLog.slice(0, 3).forEach((e) => errs.push(fmtDate(e.t) + ' · ' + e.where + ' : ' + e.msg));
    let vercel = { k: 'wait', t: 'Vérification…' };
    if (st.deploy) vercel = dep.env === 'local' ? { k: 'warn', t: 'Environnement local (hors Vercel)' } : dep.id ? { k: 'ok', t: 'Déployé sur Vercel (' + dep.env + ')' } : { k: 'warn', t: 'Déploiement non identifié' };
    let ghs = { k: 'wait', t: 'Vérification…' };
    if (CN.github) ghs = gh._err ? { k: 'bad', t: 'Erreur' } : gh.reachable ? { k: 'ok', t: 'Dépôt joignable' } : { k: 'warn', t: gh.note || 'Non vérifiable' };
    const last = st.lastSave;
    const version = dep.sha ? shortSha(dep.sha) : (st.deploy ? 'locale' : '…');
    const lag = gh.reachable && dep.sha && gh.sha && dep.sha !== gh.sha ? ` <span class="stg-note-inline">Le dépôt a un commit plus récent (${shortSha(gh.sha)}) : déploiement en cours ou en attente.</span>` : '';
    const banner = window.__initialCode ? `<div class="stg-banner" role="alert"><strong>Vous utilisez encore le code initial : changez-le.</strong><span>Ce code a été communiqué à l’installation ; remplacez-le par un code personnel.</span><button type="button" class="btn btn-primary btn-sm" data-cn="security">Changer le code maintenant</button></div>` : '';
    host.innerHTML = banner + `<section class="stg-cn" aria-label="Note de contrôle">
      <button type="button" class="stg-cn-head" aria-expanded="${CN.open}" data-cn="toggle">
        <span class="stg-cn-title">Note de contrôle</span>
        <span class="stg-cn-chips">${chip(sy.k, 'Synchro : ' + sy.t)}${chip(ghs.k, 'GitHub : ' + ghs.t)}${chip(vercel.k, 'Vercel : ' + vercel.t)}${errs.length ? chip('bad', errs.length + ' erreur' + (errs.length > 1 ? 's' : '')) : ''}</span>
        <span class="stg-cn-caret" aria-hidden="true">${CN.open ? '▾' : '▸'}</span>
      </button>
      <div class="stg-cn-body" ${CN.open ? '' : 'hidden'}>
        <div class="stg-cn-grid">
          <div class="stg-cn-item"><h4>Gestionnaire en ligne</h4><p><a href="${MANAGER_URL}" target="_blank" rel="noopener">${MANAGER_URL}</a></p><p><button type="button" class="btn btn-light btn-sm" data-cn="copy" data-v="${MANAGER_URL}">${CN.copied === MANAGER_URL ? 'Lien copié ✓' : 'Copier le lien'}</button> <a class="btn btn-light btn-sm" href="${MANAGER_URL}" target="_blank" rel="noopener">Ouvrir ↗</a></p></div>
          <div class="stg-cn-item"><h4>Site public</h4><p><a href="${SITE_URL}" target="_blank" rel="noopener">${SITE_URL}</a></p><p><a class="btn btn-light btn-sm" href="${SITE_URL}" target="_blank" rel="noopener">Voir le site ↗</a></p></div>
          <div class="stg-cn-item"><h4>Synchronisation</h4><p>${chip(sy.k, sy.t)}</p><p class="stg-sm">${E(sy.d)}</p><p class="stg-sm">Révision : <code>${E(String(Store221.rev || '').replace(/"/g, '').slice(0, 10))}</code></p></div>
          <div class="stg-cn-item"><h4>Dernière sauvegarde</h4><p><strong>${last ? E(fmtDate(last.t)) : 'Aucune encore'}</strong></p><p class="stg-sm">${last ? E(ago(last.t)) + ' · ' + E(last.summary || '') : 'Les données d’origine du site sont affichées tant que rien n’est enregistré.'}</p></div>
          <div class="stg-cn-item"><h4>GitHub</h4><p>${chip(ghs.k, ghs.t)}</p><p class="stg-sm">${gh.reachable ? 'Dernier commit <code>' + E(shortSha(gh.sha)) + '</code> : ' + E(gh.message || '') + (gh.date ? ' (' + E(fmtDate(gh.date)) + ')' : '') : E(gh.note || gh._err || '')}</p><p><a href="${GITHUB_URL}" target="_blank" rel="noopener">Ouvrir le dépôt ↗</a></p></div>
          <div class="stg-cn-item"><h4>Vercel · dernier déploiement</h4><p>${chip(vercel.k, vercel.t)}</p><p class="stg-sm">${dep.id ? 'Déploiement <code>' + E(dep.id) + '</code>' : 'Identifiant non exposé'}${dep.ref ? ' · branche ' + E(dep.ref) : ''}${dep.message ? '<br>' + E(String(dep.message).split('\n')[0]) : ''}</p><p class="stg-sm">Date du déploiement : non exposée par le serveur — voir Vercel.</p><p><a href="${VERCEL_URL}" target="_blank" rel="noopener">Ouvrir le projet ↗</a></p></div>
          <div class="stg-cn-item"><h4>Version actuelle du site</h4><p><strong><code>${E(version)}</code></strong></p><p class="stg-sm">${dep.repo ? E(dep.repo) : ''}${lag}</p></div>
          <div class="stg-cn-item"><h4>Erreurs</h4>${errs.length ? '<ul class="stg-errs">' + errs.map((e) => '<li>' + E(e) + '</li>').join('') + '</ul><p><button type="button" class="btn btn-light btn-sm" data-cn="clearerr">Effacer</button></p>' : '<p>' + chip('ok', 'Aucune erreur') + '</p>'}</div>
        </div>
        <div class="stg-cn-foot"><button type="button" class="btn btn-light btn-sm" data-cn="refresh" ${CN.loading ? 'disabled' : ''}>${CN.loading ? 'Actualisation…' : '↻ Actualiser'}</button><span class="stg-sm">${CN.ts ? 'Vérifié ' + E(ago(CN.ts)) : ''}</span><button type="button" class="btn btn-light btn-sm" data-cn="details">Paramètres ›</button></div>
      </div></section>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cn]'); if (!b || !b.closest('#controlNote')) return;
    const a = b.dataset.cn;
    if (a === 'toggle') { CN.open = !CN.open; try { localStorage.setItem('221-cn-open', CN.open ? '1' : '0'); } catch (x) {} renderControlNote(true); }
    if (a === 'refresh') refreshControl(true);
    if (a === 'copy') { const ok = await copyText(b.dataset.v); CN.copied = ok ? b.dataset.v : ''; renderControlNote(true); setTimeout(() => { CN.copied = ''; renderControlNote(true); }, 2500); }
    if (a === 'clearerr') { errLog.length = 0; try { lastError = ''; } catch (x) {} updateStatus(); renderControlNote(true); }
    if (a === 'security') open('security');
    if (a === 'details') open('security');
  });

  /* ======================================================================
     VUE PARAMÈTRES
     ====================================================================== */
  const S = { top: 'security', cat: 'identity', tok: 0, el: null };
  const CATS = [
    ['identity', '1 · Identité du site'], ['content', '2 · Gestion des contenus'], ['seo', '3 · SEO et référencement'], ['favicon', '4 · Favicon et identité visuelle'],
    ['media', '5 · Gestion des médias'], ['publish', '6 · Paramètres de publication'], ['sections', '7 · Gestion des sections'], ['backups', '8 · Sauvegardes et restauration'],
    ['history', '9 · Historique des modifications'], ['users', '10 · Utilisateurs et autorisations'], ['forms', '11 · Formulaires et contacts'], ['stats', '12 · Statistiques et performances'],
    ['integr', '13 · Intégrations GitHub et Vercel'], ['sync', '14 · État de synchronisation'], ['adv', '15 · Paramètres avancés'],
  ];

  function init() {
    wrapSave();
    if (!S.el) {
      const v = document.createElement('div'); v.id = 'stgView'; v.hidden = true; q('#app').appendChild(v); S.el = v;
      v.addEventListener('click', onClick); v.addEventListener('input', onInput); v.addEventListener('change', onChange); v.addEventListener('submit', (e) => e.preventDefault());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !S.el.hidden && !q('.stg-ov')) close(); });
    }
    refreshControl();
  }
  function open(tab) {
    if (!S.el) init();
    if (tab === 'security' || tab === 'details') S.top = tab; else S.top = S.top || 'security';
    S.el.hidden = false; q('#ui').hidden = true; window.scrollTo(0, 0);
    renderShell();
  }
  function close() {
    S.el.hidden = true; q('#ui').hidden = false; S.tok++;
    if (typeof renderAll === 'function') renderAll();
  }
  function renderShell() {
    const ro = viewer();
    S.el.innerHTML = `<div class="stg">
      <div class="stg-head"><button type="button" class="btn btn-light btn-sm" data-act="back">← Retour au gestionnaire</button><h1>Paramètres</h1>${ro ? '<span class="pending-tag">Lecture seule</span>' : ''}</div>
      <div class="stg-top" role="tablist" aria-label="Paramètres">
        <button type="button" role="tab" id="stg-t-security" aria-selected="${S.top === 'security'}" data-top="security">Sécurité</button>
        <button type="button" role="tab" id="stg-t-details" aria-selected="${S.top === 'details'}" data-top="details">Détails</button>
      </div>
      <div id="stgBody"></div></div>`;
    if (S.top === 'security') renderSecurity(); else renderDetails();
  }
  const body = () => q('#stgBody', S.el);
  function lock(root) {
    if (!viewer()) return;
    qa('input,textarea,select', root).forEach((x) => { if (!x.hasAttribute('data-ro-ok')) x.disabled = true; });
    qa('[data-w]', root).forEach((x) => { x.disabled = true; x.title = 'Lecture seule : réservé au code principal'; });
  }
  const live = (id, kind, msg) => { const el = q('#' + id, S.el); if (el) { el.className = 'stg-live is-' + kind; el.textContent = msg; } };

  /* ---------------- délégation des événements ---------------- */
  async function onClick(e) {
    const t = e.target.closest('[data-act],[data-top],[data-cat]'); if (!t) return;
    if (t.dataset.top) { S.top = t.dataset.top; renderShell(); return; }
    if (t.dataset.cat) { S.cat = t.dataset.cat; renderDetails(); return; }
    const a = t.dataset.act;
    if (a === 'back') return close();
    const fn = ACTIONS[a]; if (fn) { try { await fn(t, e); } catch (err) { logErr(a, err); toast(err.message || String(err), true); } }
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-count]')) { const c = q('#' + t.dataset.count, S.el); if (c) { const max = +t.dataset.max || 0; c.textContent = t.value.length + ' / ' + max; c.classList.toggle('is-over', max && t.value.length > max); } seoPreview(); }
    if (t.id === 'sec-new') strength(t.value);
    if (t.id === 'pub-range') { q('#pub-poll', S.el).value = t.value; }
    if (t.id === 'pub-poll') { q('#pub-range', S.el).value = t.value; }
    if (t.id === 'id-color-pick') { q('#id-themeColor', S.el).value = t.value; }
    if (t.id === 'id-themeColor' && /^#[0-9a-f]{6}$/i.test(t.value)) { q('#id-color-pick', S.el).value = t.value; }
    if (t.matches('#seo-form input,#seo-form textarea')) seoPreview();
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'imp-file') importPick(t);
    if (t.id === 'sec-show') { ['sec-old', 'sec-new', 'sec-conf'].forEach((i) => { q('#' + i, S.el).type = t.checked ? 'text' : 'password'; }); }
  }

  /* ======================================================================
     SÉCURITÉ
     ====================================================================== */
  function strengthScore(p) {
    let s = 0; if (p.length >= 10) s++; if (p.length >= 14) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(4, s);
  }
  function strength(p) {
    const el = q('#sec-bar', S.el); if (!el) return;
    const s = p ? strengthScore(p) : 0; const lab = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][s];
    el.dataset.s = p ? s : ''; q('#sec-bar-t', S.el).textContent = p ? 'Robustesse : ' + lab : '';
  }
  async function renderSecurity() {
    const tok = ++S.tok; const b = body();
    b.innerHTML = `<div class="stg-grid">
      <section class="panel stg-card" id="sec-change"><div class="panel-head"><div><h2>Modifier le code d’accès</h2><p>Le nouveau code devient immédiatement le code officiel. L’ancien cesse de fonctionner et toutes les <strong>autres sessions sont révoquées</strong>. Le code n’est jamais enregistré en clair.</p></div></div>
        ${window.__initialCode ? '<p class="stg-warn">Vous utilisez encore le code initial : changez-le maintenant.</p>' : ''}
        <form id="sec-form" class="fields" autocomplete="off" novalidate>
          <div class="field"><label for="sec-old">Ancien code</label><input type="password" id="sec-old" autocomplete="current-password"></div>
          <div class="field"><label for="sec-new">Nouveau code <span class="opt">(10 caractères minimum)</span></label><input type="password" id="sec-new" autocomplete="new-password"><div class="stg-bar" id="sec-bar" data-s=""><i></i><i></i><i></i><i></i></div><p class="hint" id="sec-bar-t" aria-live="polite"></p></div>
          <div class="field"><label for="sec-conf">Confirmer le nouveau code</label><input type="password" id="sec-conf" autocomplete="new-password"></div>
          <label class="stg-check"><input type="checkbox" id="sec-show" data-ro-ok> Afficher les codes</label>
          <div class="stg-actions"><button type="button" class="btn btn-primary" data-act="change-code" data-w>Enregistrer le nouveau code</button></div>
          <p id="sec-live" class="stg-live" role="status" aria-live="polite"></p>
        </form></section>
      <section class="panel stg-card"><div class="panel-head"><div><h2>Réglages de sécurité</h2><p>S’appliquent aux prochaines connexions.</p></div></div>
        <div class="fields" id="sec-cfg"><p class="stg-sm">Chargement…</p></div></section>
    </div>
    <section class="panel stg-card"><div class="panel-head"><div><h2>Sessions actives</h2><p>Appareils actuellement connectés au gestionnaire.</p></div><div class="stg-actions"><button type="button" class="btn btn-light btn-sm" data-act="revoke-others" data-w>Déconnecter tous les autres appareils</button><button type="button" class="btn btn-danger btn-sm" data-act="logout-all" data-w>Me déconnecter de tous les appareils</button></div></div><div id="sec-sessions"><p class="stg-sm">Chargement…</p></div><p id="sec-sess-live" class="stg-live" role="status" aria-live="polite"></p></section>
    <section class="panel stg-card"><div class="panel-head"><div><h2>Historique des connexions</h2><p>Tentatives réussies et échouées (200 dernières).</p></div><div id="sec-locked" class="stg-sm"></div></div><div id="sec-history"><p class="stg-sm">Chargement…</p></div></section>`;
    lock(b);
    const [ses, his] = await Promise.all([call('auth/sessions').catch((e) => ({ _err: e.message })), call('auth/history').catch((e) => ({ _err: e.message }))]);
    if (tok !== S.tok) return;
    renderSessions(ses); renderHistoryEvents(his); renderSecCfg(his);
  }
  function renderSessions(r) {
    const el = q('#sec-sessions', S.el); if (!el) return;
    if (r._err) { el.innerHTML = `<p class="stg-warn">${E(r._err)}</p>`; return; }
    el.innerHTML = `<div class="stg-tablewrap"><table class="stg-table"><thead><tr><th>Appareil</th><th>Adresse IP</th><th>Connecté le</th><th>Expire le</th><th>Rôle</th><th></th></tr></thead><tbody>${r.sessions.map((s) => `<tr><td>${E(uaLabel(s.ua))}${s.current ? ' <span class="stg-chip is-ok">Cette session</span>' : ''}</td><td>${E(s.ip)}</td><td>${E(fmtDate(s.created))}</td><td>${E(fmtDate(s.exp))}</td><td>${s.role === 'admin' ? 'Propriétaire' : 'Lecteur'}</td><td>${s.current ? '' : `<button type="button" class="btn btn-light btn-sm" data-act="revoke" data-id="${E(s.id)}" data-w>Révoquer</button>`}</td></tr>`).join('') || '<tr><td colspan="6">Aucune session.</td></tr>'}</tbody></table></div>`;
    lock(el);
  }
  function renderHistoryEvents(h) {
    const el = q('#sec-history', S.el); if (!el) return;
    if (h._err) { el.innerHTML = `<p class="stg-warn">${E(h._err)}</p>`; return; }
    q('#sec-locked', S.el).innerHTML = h.lockedIps ? `<span class="stg-chip is-warn">${h.lockedIps} adresse(s) avec échecs récents</span>` : '<span class="stg-chip is-ok">Aucune adresse bloquée</span>';
    el.innerHTML = loginTable(h.events.slice(0, 50));
  }
  function loginTable(ev) {
    return `<div class="stg-tablewrap"><table class="stg-table"><thead><tr><th>Date</th><th>Résultat</th><th>Rôle</th><th>Adresse IP</th><th>Appareil</th><th>Motif</th></tr></thead><tbody>${ev.map((x) => `<tr><td>${E(fmtDate(x.t))}</td><td>${x.ok ? '<span class="stg-chip is-ok">Réussie</span>' : '<span class="stg-chip is-bad">Échec</span>'}</td><td>${x.role ? (x.role === 'admin' ? 'Propriétaire' : 'Lecteur') : '—'}</td><td>${E(x.ip)}</td><td>${E(uaLabel(x.ua))}</td><td>${E(x.note || '')}</td></tr>`).join('') || '<tr><td colspan="6">Aucun événement.</td></tr>'}</tbody></table></div>`;
  }
  function renderSecCfg(h) {
    const el = q('#sec-cfg', S.el); if (!el) return; if (h._err) { el.innerHTML = `<p class="stg-warn">${E(h._err)}</p>`; return; }
    const c = h.config;
    el.innerHTML = `<div class="field"><label for="cfg-days">Durée des sessions</label><select id="cfg-days"><option value="1" ${c.sessionDays === 1 ? 'selected' : ''}>1 jour</option><option value="7" ${c.sessionDays === 7 ? 'selected' : ''}>7 jours</option><option value="30" ${c.sessionDays === 30 ? 'selected' : ''}>30 jours</option></select></div>
      <div class="two"><div class="field"><label for="cfg-fails">Tentatives avant blocage</label><input type="number" id="cfg-fails" min="3" max="10" value="${c.maxFails}"></div><div class="field"><label for="cfg-lock">Durée du blocage (min)</label><input type="number" id="cfg-lock" min="5" max="120" value="${c.lockMinutes}"></div></div>
      <div class="stg-actions"><button type="button" class="btn btn-primary btn-sm" data-act="save-sec-cfg" data-w>Enregistrer ces réglages</button></div><p id="cfg-live" class="stg-live" role="status" aria-live="polite"></p>
      <hr class="stg-hr"><div class="field"><label for="cfg-viewer">Code lecteur (lecture seule) ${c.hasViewer ? '<span class="stg-chip is-ok">Actif</span>' : '<span class="stg-chip">Désactivé</span>'}</label><input type="password" id="cfg-viewer" autocomplete="new-password" placeholder="${c.hasViewer ? 'Saisir un nouveau code pour le remplacer' : '10 caractères minimum'}"><p class="hint">Permet de consulter le gestionnaire sans pouvoir enregistrer. Doit différer du code principal.</p></div>
      <div class="stg-actions"><button type="button" class="btn btn-primary btn-sm" data-act="viewer-set" data-w>Définir le code lecteur</button>${c.hasViewer ? '<button type="button" class="btn btn-light btn-sm" data-act="viewer-del" data-w>Retirer le code lecteur</button>' : ''}</div><p id="viewer-live" class="stg-live" role="status" aria-live="polite"></p>`;
    lock(el);
  }

  /* ======================================================================
     DÉTAILS : navigation + catégories
     ====================================================================== */
  function renderDetails() {
    const b = body(); ++S.tok;
    b.innerHTML = `<div class="stg-details"><nav class="stg-nav" aria-label="Catégories de détails">${CATS.map(([id, l]) => `<button type="button" data-cat="${id}" aria-current="${S.cat === id}">${E(l)}</button>`).join('')}</nav><div class="stg-pane" id="stgPane" tabindex="-1" aria-live="polite"></div></div>`;
    const R = RENDER[S.cat] || RENDER.identity; const tok = S.tok;
    const pane = q('#stgPane', S.el);
    Promise.resolve(R(pane, tok)).then(() => { if (tok === S.tok) lock(pane); }).catch((e) => { logErr(S.cat, e); if (tok === S.tok) pane.innerHTML = `<section class="panel"><p class="stg-warn">${E(e.message)}</p></section>`; });
    const act = q('.stg-nav [aria-current="true"]', S.el); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const head = (t, p, extra) => `<div class="panel-head"><div><h2>${t}</h2>${p ? '<p>' + p + '</p>' : ''}</div>${extra || ''}</div>`;
  const inp = (id, label, val, o) => { o = o || {}; return `<div class="field"><label for="${id}">${label}${o.opt ? ' <span class="opt">(facultatif)</span>' : ''}</label>${o.area ? `<textarea id="${id}" ${o.max ? `data-count="${id}-c" data-max="${o.max}"` : ''} rows="${o.rows || 3}">${E(val)}</textarea>` : `<input type="${o.type || 'text'}" id="${id}" value="${E(val)}" ${o.ph ? `placeholder="${E(o.ph)}"` : ''} ${o.max ? `data-count="${id}-c" data-max="${o.max}"` : ''} ${o.attrs || ''}>`}${o.max ? `<p class="hint stg-count" id="${id}-c">${String(val).length} / ${o.max}</p>` : ''}${o.hint ? `<p class="hint">${o.hint}</p>` : ''}</div>`; };
  const saveBar = (act, live) => `<div class="stg-actions"><button type="button" class="btn btn-primary" data-act="${act}" data-w>Enregistrer</button></div><p id="${live}" class="stg-live" role="status" aria-live="polite"></p>`;
  const val = (id) => { const el = q('#' + id, S.el); return el ? el.value : ''; };
  const chk = (id) => { const el = q('#' + id, S.el); return !!(el && el.checked); };

  async function saveSettings(label, paths, liveId, rerender) {
    live(liveId, 'busy', 'Enregistrement sur le serveur…');
    const ok = await commitL(label, (d) => { d.settings = Schema221.normalizeSettings(d.settings); for (const p of Object.keys(paths)) setPath(d.settings, p, paths[p]); });
    if (ok) { live(liveId, 'ok', 'Enregistré et vérifié sur le serveur à ' + new Date().toLocaleTimeString('fr-FR') + '.'); refreshControl(); if (rerender) rerender(); }
    else live(liveId, 'bad', 'Échec de l’enregistrement : ' + (pageLastError() || 'voir le message ci-dessus') + '. Rien n’a été modifié.');
    return ok;
  }

  const RENDER = {};

  /* 1 Identité */
  RENDER.identity = (el) => {
    const i = gv('public.identity');
    el.innerHTML = `<section class="panel">${head('Identité du site', 'Ces informations alimentent les métadonnées du site (données structurées Organisation, couleur du thème du navigateur, partage).')}
      <div class="fields">${inp('id-name', 'Nom du site / de l’entreprise', i.name, { ph: '221 Digital' })}${inp('id-tagline', 'Slogan', i.tagline, { opt: 1 })}
      <div class="two">${inp('id-email', 'E-mail de contact', i.email, { type: 'email', opt: 1 })}${inp('id-phone', 'Téléphone', i.phone, { opt: 1 })}</div>
      <div class="two">${inp('id-whatsapp', 'WhatsApp', i.whatsapp, { opt: 1 })}${inp('id-address', 'Adresse', i.address, { opt: 1 })}</div>
      <div class="field"><label for="id-themeColor">Couleur du thème (barre du navigateur mobile)</label><div class="stg-colorrow"><input type="color" id="id-color-pick" value="${/^#[0-9a-f]{6}$/i.test(i.themeColor) ? i.themeColor : '#0a1020'}" aria-label="Choisir la couleur"><input type="text" id="id-themeColor" value="${E(i.themeColor)}" placeholder="#0A1020"></div><p class="hint">Format #RRGGBB. Vide = aucune couleur imposée.</p></div></div>
      ${saveBar('save-identity', 'id-live')}</section>`;
  };

  /* 2 Contenus */
  RENDER.content = (el) => {
    const d = saved, bs = (st) => (d.sections || []).filter((s) => s.status === st).length;
    el.innerHTML = `<section class="panel">${head('Gestion générale des contenus', 'Vue d’ensemble des données enregistrées sur le serveur, export et import.')}
      <div class="stg-stats">${[['Projets', d.projects.length], ['Logos', d.logos.length], ['Clients', d.clients.length], ['Avis', d.reviews.length], ['Sections', (d.sections || []).length], ['Publiées', bs('published')]].map(([l, n]) => `<div class="stg-stat"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
      <p class="stg-sm">Poids des données enregistrées : ${fmtBytes(JSON.stringify(d).length)} (les images sont stockées à part, dans les médias).</p></section>
    <section class="panel">${head('Exporter', 'Télécharge un fichier JSON complet : contenus, sections, positions et paramètres.')}<div class="stg-actions"><button type="button" class="btn btn-light" data-act="export-all">Télécharger l’export JSON</button></div></section>
    <section class="panel">${head('Importer', 'Remplace les contenus par ceux d’un fichier exporté. Une version restaurable de l’état actuel est conservée automatiquement.')}
      <div class="field"><label for="imp-file">Fichier JSON</label><input type="file" id="imp-file" accept="application/json,.json" data-w></div><div id="imp-sum" class="stg-sm"></div><div class="stg-actions"><button type="button" class="btn btn-primary" id="imp-go" data-act="import-go" data-w disabled>Importer ce fichier</button></div><p id="imp-live" class="stg-live" role="status" aria-live="polite"></p></section>
    <section class="panel stg-danger">${head('Réinitialiser aux contenus d’origine', 'Rétablit projets, logos, clients, avis, photo de la page Projets et vitesse des logos tels que livrés à l’origine. Les sections et les paramètres sont conservés. L’état actuel reste restaurable depuis « Sauvegardes ».')}<div class="stg-actions"><button type="button" class="btn btn-danger" data-act="reset-origin" data-w>Réinitialiser…</button></div><p id="rst-live" class="stg-live" role="status" aria-live="polite"></p></section>`;
  };
  let IMPORT = null;
  function importPick(inpEl) {
    IMPORT = null; q('#imp-go', S.el).disabled = true; const sum = q('#imp-sum', S.el); sum.textContent = '';
    const f = inpEl.files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { sum.innerHTML = '<span class="stg-warn">Fichier trop volumineux (3 Mo maximum).</span>'; return; }
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Le fichier doit contenir un objet JSON.');
        const known = ['logos', 'projects', 'clients', 'reviews', 'sections', 'hero', 'speed', 'settings', 'sectionLayout'];
        if (!known.some((k) => k in j)) throw new Error('Fichier non reconnu : aucune donnée du site trouvée.');
        for (const k of ['logos', 'projects', 'clients', 'reviews', 'sections']) if (k in j && !Array.isArray(j[k])) throw new Error('Le champ « ' + k + ' » doit être une liste.');
        for (const p of j.projects || []) if (!p || !/^https?:\/\//i.test(String(p.url || ''))) throw new Error('Un projet du fichier a une adresse invalide.');
        const n = Store221.normalize(j); IMPORT = { keys: known.filter((k) => k in j), data: n };
        sum.innerHTML = `<strong>Fichier valide.</strong> Contient : ${n.projects.length} projets, ${n.logos.length} logos, ${n.clients.length} clients, ${n.reviews.length} avis, ${n.sections.length} sections. Champs remplacés : ${IMPORT.keys.map(E).join(', ')}.`;
        q('#imp-go', S.el).disabled = viewer();
      } catch (e) { sum.innerHTML = `<span class="stg-warn">${E(e.message)}</span>`; }
    };
    r.readAsText(f);
  }

  /* 3 SEO */
  RENDER.seo = (el) => {
    const s = gv('public.seo');
    el.innerHTML = `<section class="panel" id="seo-form">${head('SEO et référencement', 'Appliqué automatiquement sur le site public : titre, description, partage, balise canonical, indexation, données structurées et robots.txt.')}
      <div class="fields">${inp('seo-title', 'Titre de la page', s.title, { max: 160, hint: 'Idéal : 50–60 caractères. Vide = titre d’origine du site.' })}${inp('seo-desc', 'Description', s.description, { area: 1, max: 400, hint: 'Idéal : 140–160 caractères.' })}${inp('seo-kw', 'Mots-clés', s.keywords, { opt: 1, max: 400 })}${inp('seo-og', 'Image de partage (adresse)', s.ogImage, { opt: 1, ph: '/api/media/…', hint: 'Adresse d’une image des médias (voir Médias) ou https://…' })}${inp('seo-canon', 'Adresse canonique', s.canonical, { opt: 1, ph: 'https://www.221.digital/' })}
      <label class="stg-check"><input type="checkbox" id="seo-noindex" ${s.noindex ? 'checked' : ''}> Demander aux moteurs de ne pas indexer le site <span class="stg-sm">(noindex + robots.txt « Disallow: / » — à n’activer que volontairement)</span></label>
      <label class="stg-check"><input type="checkbox" id="seo-ld" ${s.jsonLd ? 'checked' : ''}> Ajouter les données structurées « Organisation » (JSON-LD)</label>
      ${inp('seo-robots', 'Lignes supplémentaires pour robots.txt', s.robotsExtra, { area: 1, rows: 3, opt: 1, max: 2000, hint: 'Ajoutées après les règles standard (l’accès à la favicon et aux images reste autorisé).' })}</div>
      <h3 class="stg-h3">Aperçu dans Google</h3><div class="stg-serp" id="seo-serp" aria-label="Aperçu"></div>
      ${saveBar('save-seo', 'seo-live')}
      <div class="stg-actions"><a class="btn btn-light btn-sm" href="/robots.txt" target="_blank" rel="noopener">Voir robots.txt ↗</a><a class="btn btn-light btn-sm" href="/sitemap.xml" target="_blank" rel="noopener">Voir sitemap.xml ↗</a></div></section>`;
    seoPreview();
  };
  function seoPreview() {
    const el = q('#seo-serp', S.el); if (!el) return;
    const t = val('seo-title') || document.title || '221 Digital', d = val('seo-desc') || '';
    el.innerHTML = `<div class="stg-serp-url">www.221.digital</div><div class="stg-serp-t">${E(t.length > 60 ? t.slice(0, 58) + '…' : t)}</div><div class="stg-serp-d">${E(d ? (d.length > 160 ? d.slice(0, 158) + '…' : d) : 'Aucune description : Google en choisira une dans la page.')}</div>`;
  }

  /* 4 Favicon */
  RENDER.favicon = (el) => {
    el.innerHTML = `<section class="panel">${head('Favicon et identité visuelle', 'Diagnostic en lecture seule de la favicon officielle du site.')}
      <div class="stg-protect"><strong>Favicon protégée.</strong> Le fichier <code>favicon.ico</code> d’origine est la seule référence autorisée : il est déployé depuis le dépôt GitHub et ne peut pas être remplacé depuis le gestionnaire. Les deux interfaces pointent vers la même adresse stable <code>https://www.221.digital/favicon.ico</code>.</div>
      <div class="stg-actions"><button type="button" class="btn btn-primary" data-act="fav-check">Lancer le diagnostic</button><a class="btn btn-light btn-sm" href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console ↗</a><a class="btn btn-light btn-sm" href="https://developers.google.com/search/docs/appearance/favicon-in-search" target="_blank" rel="noopener">Consignes Google ↗</a></div>
      <div id="fav-out" class="stg-checks" aria-live="polite"></div></section>`;
    ACTIONS['fav-check']();
  };
  function robotsBlocks(txt, path) {
    let agentStar = false, rules = [];
    String(txt).split(/\r?\n/).forEach((l) => { l = l.replace(/#.*/, '').trim(); const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l); if (!m) return; const k = m[1].toLowerCase(), v = m[2].trim();
      if (k === 'user-agent') agentStar = v === '*'; else if (agentStar && (k === 'allow' || k === 'disallow') && v) rules.push({ allow: k === 'allow', p: v }); });
    let best = null; rules.forEach((r) => { if (path.startsWith(r.p.replace(/\*$/, '')) && (!best || r.p.length > best.p.length || (r.p.length === best.p.length && r.allow))) best = r; });
    return best ? !best.allow : false;
  }
  function checkRow(ok, label, detail) { return `<div class="stg-check-row"><span class="stg-chip is-${ok === null ? 'warn' : ok ? 'ok' : 'bad'}">${ok === null ? 'À voir' : ok ? 'OK' : 'Problème'}</span><div><strong>${label}</strong><div class="stg-sm">${detail}</div></div></div>`; }
  async function favCheck() {
    const out = q('#fav-out', S.el); out.innerHTML = '<p class="stg-sm">Diagnostic en cours…</p>'; const rows = [];
    try {
      const r = await fetch('/favicon.ico', { cache: 'no-store' }); const buf = r.ok ? await r.arrayBuffer() : null; const ct = r.headers.get('content-type') || '';
      let frames = '';
      if (buf && buf.byteLength > 6) { const dv = new DataView(buf); const n = dv.getUint16(4, true); const sizes = []; for (let i = 0; i < n && 6 + 16 * i + 16 <= buf.byteLength; i++) sizes.push((dv.getUint8(6 + 16 * i) || 256) + '×' + (dv.getUint8(7 + 16 * i) || 256)); frames = sizes.join(', '); }
      rows.push(checkRow(r.ok && /image|icon|octet/i.test(ct), 'Fichier accessible publiquement', `/favicon.ico → HTTP ${r.status} · ${E(ct || 'type inconnu')} · ${buf ? fmtBytes(buf.byteLength) : '—'}${frames ? ' · tailles contenues : ' + E(frames) : ''}`));
      if (frames) { const big = /(48|96|144|192)×/.test(frames); rows.push(checkRow(big ? true : null, 'Dimensions recommandées par Google (multiple de 48 px, 48 px minimum)', big ? 'Une image 48×48 (ou plus) est présente dans le fichier.' : 'Aucune image 48×48 détectée.')); }
      rows.push(`<div class="stg-fav-prev"><img src="/favicon.ico?t=${Date.now()}" alt="Favicon actuelle" width="48" height="48"><span class="stg-sm">Favicon actuellement servie</span></div>`);
    } catch (e) { rows.push(checkRow(false, 'Fichier accessible publiquement', E(e.message))); }
    try {
      const home = await (await fetch('/', { cache: 'no-store' })).text(); const links = [...home.matchAll(/<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>/gi)].map((m) => m[0]);
      const hrefs = links.map((l) => (/href=["']([^"']+)["']/i.exec(l) || [])[1]);
      const okCount = links.length === 1 && /favicon\.ico$/.test(hrefs[0] || '');
      rows.push(checkRow(okCount, 'Déclaration dans le <head> de la page d’accueil', links.length ? E(links.length + ' balise(s) : ' + hrefs.join(' ; ')) + (okCount ? ' — une seule déclaration, vers favicon.ico.' : ' — il doit y avoir une seule déclaration vers favicon.ico.') : 'Aucune balise rel="icon" trouvée.'));
    } catch (e) { rows.push(checkRow(null, 'Déclaration dans le <head>', E(e.message))); }
    try {
      const rb = await (await fetch('/robots.txt', { cache: 'no-store' })).text();
      const b1 = robotsBlocks(rb, '/favicon.ico'), b2 = robotsBlocks(rb, '/');
      rows.push(checkRow(!b1, 'Non bloquée par robots.txt (Googlebot et Googlebot-Image)', b1 ? 'robots.txt interdit /favicon.ico : Google ne pourra pas l’explorer.' : 'Aucune règle n’interdit /favicon.ico.'));
      rows.push(checkRow(!b2, 'Page d’accueil explorable', b2 ? 'robots.txt interdit la page d’accueil (noindex actif ?).' : 'La page d’accueil est autorisée.'));
    } catch (e) { rows.push(checkRow(null, 'robots.txt', E(e.message))); }
    rows.push(checkRow(null, 'Affichage dans Google', 'Google ne garantit pas l’affichage ni le délai (jours à semaines). Utilisez « Inspection d’URL » dans Search Console pour demander une nouvelle exploration.'));
    out.innerHTML = rows.join('');
  }

  /* 5 Médias */
  RENDER.media = async (el, tok) => {
    el.innerHTML = `<section class="panel">${head('Gestion des médias', 'Images envoyées au serveur depuis le gestionnaire (projets, logos, sections…).')}<p class="stg-sm">Chargement…</p></section>`;
    const r = await call('admin/media'); if (tok !== S.tok) return;
    const total = r.media.reduce((a, m) => a + (m.size || 0), 0), unused = r.media.filter((m) => !m.used);
    el.innerHTML = `<section class="panel">${head('Gestion des médias', `${r.media.length} fichier(s) · ${fmtBytes(total)} · ${unused.length} inutilisé(s) (${fmtBytes(unused.reduce((a, m) => a + (m.size || 0), 0))}).`, `<div class="stg-actions"><button type="button" class="btn btn-light btn-sm" data-act="media-refresh">↻ Actualiser</button><button type="button" class="btn btn-danger btn-sm" data-act="media-del-unused" data-w ${unused.length ? '' : 'disabled'}>Supprimer les ${unused.length} inutilisé(s)</button></div>`)}
      <p class="stg-sm">« Utilisée » = référencée par les données <em>enregistrées</em> (contenus, sections, SEO). Une image encore utilisée ne peut pas être supprimée (le serveur la protège).</p>
      <div class="stg-media">${r.media.map((m) => `<figure class="stg-m ${m.used ? '' : 'is-unused'}"><img src="${E(m.url)}" alt="" loading="lazy"><figcaption><span class="stg-chip is-${m.used ? 'ok' : 'warn'}">${m.used ? 'Utilisée' : 'Inutilisée'}</span><span class="stg-sm">${fmtBytes(m.size)} · ${E(fmtDate(m.uploadedAt))}</span><div class="stg-actions"><button type="button" class="btn btn-light btn-sm" data-act="media-copy" data-v="${E(m.url)}">Copier l’adresse</button>${m.used ? '' : `<button type="button" class="btn btn-light btn-sm" data-act="media-del" data-id="${E(m.id)}" data-w>Supprimer</button>`}</div></figcaption></figure>`).join('') || '<p>Aucune image envoyée pour l’instant.</p>'}</div><p id="media-live" class="stg-live" role="status" aria-live="polite"></p></section>`;
    MEDIA = r.media;
  };
  let MEDIA = [];

  /* 6 Publication */
  RENDER.publish = (el) => {
    const p = gv('public.publication');
    el.innerHTML = `<section class="panel">${head('Paramètres de publication', 'Contrôle la façon dont les visiteurs reçoivent vos modifications. Les modifications de contenu n’exigent aucun nouveau déploiement.')}
      <div class="fields"><div class="field"><label for="pub-poll">Délai d’actualisation du site (secondes)</label><div class="stg-colorrow"><input type="range" id="pub-range" min="10" max="300" step="5" value="${p.pollSeconds}"><input type="number" id="pub-poll" min="10" max="300" value="${p.pollSeconds}"></div><p class="hint">Un visiteur qui garde le site ouvert voit vos changements au plus tard après ce délai, sans recharger. Plus court = plus de requêtes.</p></div>
      <label class="stg-check"><input type="checkbox" id="pub-maint" ${p.maintenance ? 'checked' : ''}> <strong>Mode maintenance</strong> — les visiteurs voient un message à la place du site</label>
      ${inp('pub-mt', 'Titre de la page de maintenance', p.maintenanceTitle, { opt: 1, ph: 'Site en maintenance' })}${inp('pub-mx', 'Message', p.maintenanceText, { area: 1, opt: 1, ph: 'Nous revenons très vite.' })}
      <p class="hint">Le gestionnaire reste accessible. Pour voir le site pendant la maintenance : <a href="/?apercu=1" target="_blank" rel="noopener">/?apercu=1 ↗</a></p></div>${saveBar('save-publish', 'pub-live')}</section>`;
  };

  /* 7 Sections */
  RENDER.sections = (el) => {
    const d = gv('private.sectionDefaults'), secs = saved.sections || [], cnt = (s) => secs.filter((x) => x.status === s).length;
    el.innerHTML = `<section class="panel">${head('Gestion des sections', 'Valeurs appliquées par défaut quand vous créez une section, et entretien des sections archivées.')}
      <div class="stg-stats">${[['Brouillons', 'draft'], ['Bibliothèque', 'library'], ['Publiées', 'published'], ['Archivées', 'archived']].map(([l, s]) => `<div class="stg-stat"><strong>${cnt(s)}</strong><span>${l}</span></div>`).join('')}</div>
      <div class="fields"><div class="field"><label for="sd-status">Statut des nouvelles sections</label><select id="sd-status">${[['draft', 'Brouillon'], ['library', 'Bibliothèque (privée)'], ['published', 'Publié'], ['archived', 'Archivé']].map(([v, l]) => `<option value="${v}" ${d.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="two">${inp('sd-pad', 'Espacement vertical par défaut (px)', d.padY, { type: 'number', attrs: 'min="0" max="240"' })}<div class="field"><label for="sd-align">Alignement par défaut</label><select id="sd-align">${[['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite']].map(([v, l]) => `<option value="${v}" ${d.align === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
      ${saveBar('save-sdef', 'sd-live')}</section>
    <section class="panel stg-danger">${head('Vider les sections archivées', `${cnt('archived')} section(s) archivée(s) seront supprimées définitivement des données (restaurables via « Sauvegardes »).`)}<div class="stg-actions"><button type="button" class="btn btn-danger" data-act="purge-archived" data-w ${cnt('archived') ? '' : 'disabled'}>Vider les archivées…</button></div><p id="pa-live" class="stg-live" role="status" aria-live="polite"></p></section>`;
  };

  /* 8 Sauvegardes */
  let VERS = [];
  RENDER.backups = async (el, tok) => {
    el.innerHTML = `<section class="panel">${head('Sauvegardes et restauration', 'Chaque enregistrement conserve automatiquement la version précédente (60 versions). Vous pouvez aussi créer une sauvegarde nommée.')}<p class="stg-sm">Chargement…</p></section>`;
    const r = await call('admin/versions'); if (tok !== S.tok) return; VERS = r.versions;
    el.innerHTML = `<section class="panel">${head('Sauvegardes et restauration', 'Chaque enregistrement conserve automatiquement la version précédente (60 versions maximum). Restaurer crée elle-même une nouvelle version : rien n’est perdu.')}
      <div class="field"><label for="bk-label">Créer une sauvegarde nommée de l’état actuel</label><div class="stg-colorrow"><input type="text" id="bk-label" maxlength="100" placeholder="Ex. : avant refonte de la page Projets"><button type="button" class="btn btn-primary" data-act="bk-create" data-w>Créer</button></div></div><p id="bk-live" class="stg-live" role="status" aria-live="polite"></p>
      <div class="stg-tablewrap"><table class="stg-table"><thead><tr><th>Date</th><th>Nom</th><th>Contenu</th><th>Par</th><th></th></tr></thead><tbody>${r.versions.map((v) => `<tr><td>${E(fmtDate(v.t))}</td><td>${E(v.label || '—')}</td><td>${v.counts.projects} proj. · ${v.counts.logos} logos · ${v.counts.clients} cl. · ${v.counts.reviews} avis · ${v.counts.sections} sect.</td><td>${E(v.by || '')}</td><td class="stg-nowrap"><button type="button" class="btn btn-light btn-sm" data-act="bk-restore" data-id="${E(v.id)}" data-w>Restaurer</button> <button type="button" class="btn btn-light btn-sm" data-act="bk-del" data-id="${E(v.id)}" data-w>Supprimer</button></td></tr>`).join('') || '<tr><td colspan="5">Aucune version pour l’instant : la première apparaît dès le deuxième enregistrement.</td></tr>'}</tbody></table></div></section>`;
  };

  /* 9 Historique */
  let LOG = [];
  RENDER.history = async (el, tok) => {
    el.innerHTML = `<section class="panel">${head('Historique des modifications', 'Journal des enregistrements (300 derniers).')}<p class="stg-sm">Chargement…</p></section>`;
    const r = await call('admin/log'); if (tok !== S.tok) return; LOG = r.entries;
    el.innerHTML = `<section class="panel">${head('Historique des modifications', `${r.entries.length} enregistrement(s) journalisé(s).`)}<div class="field"><label for="log-filter">Filtrer</label><input type="text" id="log-filter" placeholder="Mot du résumé, auteur…" data-ro-ok></div><div id="log-table"></div></section>`;
    const draw = () => { const f = val('log-filter').toLowerCase(); const rows = LOG.filter((e) => !f || (e.summary + ' ' + e.by + ' ' + e.label).toLowerCase().includes(f)); q('#log-table', S.el).innerHTML = `<div class="stg-tablewrap"><table class="stg-table"><thead><tr><th>Date</th><th>Auteur</th><th>Résumé</th><th>Motif</th></tr></thead><tbody>${rows.map((e) => `<tr><td>${E(fmtDate(e.t))}</td><td>${E(String(e.by || '').startsWith('viewer') ? 'Lecteur' : 'Propriétaire')} <span class="stg-sm">${E(String(e.by || '').split(':')[1] || '')}</span></td><td>${E(e.summary)}</td><td>${E(e.label || '')}</td></tr>`).join('') || '<tr><td colspan="4">Aucun enregistrement.</td></tr>'}</tbody></table></div>`; };
    draw(); q('#log-filter', S.el).addEventListener('input', draw);
  };

  /* 10 Utilisateurs */
  RENDER.users = async (el, tok) => {
    const [h, s] = await Promise.all([call('auth/history'), call('auth/sessions')]); if (tok !== S.tok) return;
    const nOwn = s.sessions.filter((x) => x.role === 'admin').length, nView = s.sessions.filter((x) => x.role === 'viewer').length;
    el.innerHTML = `<section class="panel">${head('Utilisateurs et autorisations', 'L’accès repose sur deux rôles, chacun avec son propre code géré par le serveur.')}
      <div class="stg-tablewrap"><table class="stg-table"><thead><tr><th>Rôle</th><th>Code</th><th>Sessions actives</th><th>Autorisations</th></tr></thead><tbody>
      <tr><td><strong>Propriétaire</strong></td><td>${chip('ok', 'Défini')}${window.__initialCode ? ' ' + chip('warn', 'code initial') : ''}</td><td>${nOwn}</td><td>Tout : modifier les contenus, sections et paramètres, publier, restaurer, gérer la sécurité.</td></tr>
      <tr><td><strong>Lecteur</strong></td><td>${h.config.hasViewer ? chip('ok', 'Actif') : chip('', 'Désactivé')}</td><td>${nView}</td><td>Consulter le gestionnaire, les sauvegardes et les statistiques. Aucun enregistrement, aucune suppression, aucun réglage.</td></tr></tbody></table></div>
      <div class="stg-actions"><button type="button" class="btn btn-primary" data-act="goto-security">Gérer les codes et les sessions ›</button></div></section>`;
  };

  /* 11 Formulaires */
  RENDER.forms = (el) => {
    const f = gv('public.forms');
    el.innerHTML = `<section class="panel">${head('Formulaires et contacts', 'Le formulaire « Démarrer un projet » envoie les messages via EmailJS. Les valeurs saisies ici remplacent celles intégrées au site ; <strong>laissées vides, ce sont les valeurs d’origine du site qui restent utilisées</strong>.')}
      <div class="fields">${inp('fm-service', 'Service ID', f.serviceId, { opt: 1, ph: 'service_…' })}${inp('fm-template', 'Template ID', f.templateId, { opt: 1, ph: 'template_…' })}${inp('fm-key', 'Clé publique (Public Key)', f.publicKey, { opt: 1 })}${inp('fm-to', 'E-mail destinataire (informatif)', f.toEmail, { opt: 1, type: 'email', hint: 'Le destinataire réel se règle dans le modèle EmailJS ; cette valeur sert de mémo.' })}</div>
      <div class="stg-protect">La clé publique EmailJS est faite pour être visible dans le navigateur : ne saisissez jamais de clé privée ici.</div>${saveBar('save-forms', 'fm-live')}</section>`;
  };

  /* 12 Stats */
  RENDER.stats = async (el, tok) => {
    el.innerHTML = `<section class="panel">${head('Statistiques et performances', '')}<p class="stg-sm">Chargement…</p></section>`;
    const st = await call('admin/stats'); if (tok !== S.tok) return;
    const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push([d, st.days[d] || 0]); }
    const max = Math.max(1, ...days.map((x) => x[1])), tot = days.reduce((a, x) => a + x[1], 0), w = 600, h = 150, bw = w / 30;
    const svg = `<svg viewBox="0 0 ${w} ${h + 24}" class="stg-chart" role="img" aria-label="Visites par jour sur 30 jours : ${tot} au total">${days.map(([d, n], i) => { const bh = Math.round((n / max) * h); return `<g><title>${d} : ${n} visite(s)</title><rect x="${i * bw + 2}" y="${h - bh}" width="${bw - 4}" height="${Math.max(bh, n ? 2 : 0)}" rx="2" fill="var(--accent)"/></g>`; }).join('')}<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="var(--line)"/><text x="0" y="${h + 16}" font-size="11" fill="var(--muted)">${days[0][0].slice(5)}</text><text x="${w}" y="${h + 16}" font-size="11" fill="var(--muted)" text-anchor="end">${days[29][0].slice(5)}</text><text x="${w}" y="12" font-size="11" fill="var(--muted)" text-anchor="end">max ${max}/jour</text></svg>`;
    el.innerHTML = `<section class="panel">${head('Statistiques et performances', 'Visites comptées une fois par session de navigation, sans donnée personnelle.')}
      <div class="stg-stats"><div class="stg-stat"><strong>${tot}</strong><span>Visites (30 j)</span></div><div class="stg-stat"><strong>${days.slice(-7).reduce((a, x) => a + x[1], 0)}</strong><span>7 derniers jours</span></div><div class="stg-stat"><strong>${days[29][1]}</strong><span>Aujourd’hui</span></div><div class="stg-stat"><strong>${fmtBytes(st.contentBytes)}</strong><span>Données</span></div><div class="stg-stat"><strong>${st.mediaCount}</strong><span>Médias · ${fmtBytes(st.mediaBytes)}</span></div></div>${svg}</section>
      <section class="panel">${head('Performances', 'Mesures prises depuis votre navigateur, maintenant.', '<button type="button" class="btn btn-primary btn-sm" data-act="perf-run">Mesurer</button>')}<div id="perf-out" class="stg-sm">Cliquez sur « Mesurer ».</div></section>`;
  };

  /* 13 Intégrations */
  RENDER.integr = async (el, tok) => {
    el.innerHTML = `<section class="panel">${head('Intégrations GitHub et Vercel', '')}<p class="stg-sm">Vérification…</p></section>`;
    const [st, gh] = await Promise.all([call('admin/status').catch((e) => ({ _err: e.message })), call('admin/github').catch((e) => ({ _err: e.message }))]); if (tok !== S.tok) return;
    const d = st.deploy || {};
    el.innerHTML = `<section class="panel">${head('Intégrations GitHub et Vercel', 'Ce qui est vérifié en direct est distingué de ce qui est seulement déduit.', '<button type="button" class="btn btn-light btn-sm" data-act="integr-test">↻ Tester la connexion</button>')}
      <div class="stg-cards">
        <div class="stg-card2"><h3>GitHub ${chip(gh._err ? 'bad' : gh.reachable ? 'ok' : 'warn', gh.reachable ? 'Vérifié' : 'Non vérifié')}</h3><dl><dt>Dépôt</dt><dd><a href="${GITHUB_URL}" target="_blank" rel="noopener">${E(gh.repo || 'pape2000/221-DIGITAL')}</a></dd><dt>Branche de production</dt><dd>main</dd>${gh.reachable ? `<dt>Dernier commit</dt><dd><code>${E(shortSha(gh.sha))}</code> ${E(gh.message || '')}</dd><dt>Date</dt><dd>${E(fmtDate(gh.date))}</dd>` : `<dt>État</dt><dd>${E(gh.note || gh._err || '')}</dd>`}</dl></div>
        <div class="stg-card2"><h3>Vercel ${chip(d.id ? 'warn' : 'bad', d.id ? 'Déduit' : 'Non détecté')}</h3><dl><dt>Projet</dt><dd><a href="${VERCEL_URL}" target="_blank" rel="noopener">221-digital</a></dd><dt>Environnement</dt><dd>${E(d.env || '—')}</dd><dt>Déploiement courant</dt><dd><code>${E(d.id || '—')}</code></dd><dt>Commit déployé</dt><dd><code>${E(shortSha(d.sha) || '—')}</code> ${E(String(d.message || '').split('\n')[0])}</dd><dt>Branche</dt><dd>${E(d.ref || '—')}</dd><dt>Région</dt><dd>${E(d.region || '—')}</dd></dl><p class="stg-sm">Ces valeurs viennent des variables système du déploiement en cours (non interrogées auprès de l’API Vercel).</p></div>
        <div class="stg-card2"><h3>Stockage ${chip(st.storage === 'blob' ? 'ok' : 'warn', st.storage === 'blob' ? 'Vérifié' : 'Local')}</h3><dl><dt>Type</dt><dd>${st.storage === 'blob' ? 'Vercel Blob (privé)' : E(st.storage || '—')}</dd><dt>Lecture</dt><dd>${E(st.storageMs)} ms</dd><dt>Contenu enregistré</dt><dd>${st.hasContent ? 'Oui' : 'Non — contenu d’origine du site'}</dd></dl></div>
      </div>
      <p class="stg-sm">Déploiement du code : chaque commit sur <code>main</code> déclenche la production sur Vercel ; une modification de contenu faite ici ne crée ni commit ni déploiement.</p><p id="integr-live" class="stg-live" role="status" aria-live="polite"></p></section>`;
  };

  /* 14 Synchronisation */
  RENDER.sync = (el) => {
    el.innerHTML = `<section class="panel">${head('État de synchronisation', 'Teste réellement la chaîne gestionnaire → serveur → stockage → site public.', '<button type="button" class="btn btn-primary" data-act="sync-run">Tester la synchronisation</button>')}<div id="sync-out" class="stg-checks" aria-live="polite"><p class="stg-sm">Aucun test lancé.</p></div></section>`;
  };

  /* 15 Avancé */
  RENDER.adv = async (el, tok) => {
    const notes = gv('private.notes'); const h = await call('auth/history').catch(() => null); if (tok !== S.tok) return;
    el.innerHTML = `<section class="panel">${head('Paramètres avancés', '')}
      <div class="fields">${inp('adv-notes', 'Notes privées (visibles uniquement ici)', notes, { area: 1, rows: 5, max: 4000, hint: 'Mémo interne enregistré sur le serveur, jamais publié.' })}</div>${saveBar('save-notes', 'adv-live')}</section>
    <section class="panel">${head('Durée de session', 'Même réglage que dans Sécurité.')}<div class="field"><label for="adv-days">Durée des sessions</label><select id="adv-days">${[1, 7, 30].map((n) => `<option value="${n}" ${h && h.config.sessionDays === n ? 'selected' : ''}>${n} jour${n > 1 ? 's' : ''}</option>`).join('')}</select></div><div class="stg-actions"><button type="button" class="btn btn-primary btn-sm" data-act="adv-days-save" data-w>Appliquer</button></div><p id="adv-days-live" class="stg-live" role="status" aria-live="polite"></p></section>
    <section class="panel">${head('Journal et nettoyage', '')}<div class="stg-actions"><button type="button" class="btn btn-light" data-act="log-export">Exporter le journal (JSON)</button></div>
      <div class="field" style="margin-top:16px"><label for="adv-keep">Nettoyer les anciennes versions : conserver les plus récentes</label><div class="stg-colorrow"><select id="adv-keep"><option>5</option><option selected>10</option><option>20</option></select><button type="button" class="btn btn-danger btn-sm" data-act="clean-versions" data-w>Supprimer les plus anciennes…</button></div></div><p id="adv-clean-live" class="stg-live" role="status" aria-live="polite"></p></section>
    <section class="panel">${head('Paramètres enregistrés (lecture seule)', 'Contenu brut de la section « settings » des données.')}<pre class="stg-pre" tabindex="0">${E(JSON.stringify(settingsNow(), null, 2))}</pre></section>`;
  };

  /* ======================================================================
     ACTIONS
     ====================================================================== */
  const ACTIONS = {
    'goto-security': () => { S.top = 'security'; renderShell(); },
    'change-code': async () => {
      const o = val('sec-old'), n = val('sec-new'), c = val('sec-conf');
      if (!o) return live('sec-live', 'bad', 'Saisissez votre ancien code.');
      if (n.length < 10) return live('sec-live', 'bad', 'Le nouveau code doit contenir au moins 10 caractères.');
      if (n !== c) return live('sec-live', 'bad', 'Les deux nouveaux codes ne correspondent pas.');
      if (n === o) return live('sec-live', 'bad', 'Le nouveau code doit être différent de l’ancien.');
      live('sec-live', 'busy', 'Enregistrement…');
      try {
        const r = await call('auth/change-code', { method: 'POST', body: { oldCode: o, newCode: n, confirmCode: c } });
        if (!r.verified) return live('sec-live', 'bad', 'Le serveur n’a pas confirmé la vérification du nouveau code.');
        ['sec-old', 'sec-new', 'sec-conf'].forEach((i) => { q('#' + i, S.el).value = ''; }); strength('');
        window.__initialCode = false;
        live('sec-live', 'ok', 'Nouveau code enregistré et vérifié par le serveur. L’ancien code ne fonctionne plus ; les autres sessions ont été déconnectées.');
        toast('Code d’accès modifié et vérifié.'); refreshControl();
        const ses = await call('auth/sessions').catch(() => null); if (ses) renderSessions(ses);
        const w = q('#sec-change .stg-warn', S.el); if (w) w.remove();
      } catch (e) { live('sec-live', 'bad', e.message); }
    },
    'revoke': async (t) => { const r = await call('auth/revoke', { method: 'POST', body: { id: t.dataset.id } }); renderSessions(r); live('sec-sess-live', 'ok', 'Session révoquée.'); },
    'revoke-others': async () => { if (!(await stgConfirm('Déconnecter les autres appareils ?', 'Toutes les sessions, sauf celle-ci, seront fermées immédiatement.', 'Déconnecter', {}))) return; const r = await call('auth/revoke-others', { method: 'POST', body: {} }); renderSessions(r); live('sec-sess-live', 'ok', 'Les autres appareils ont été déconnectés.'); },
    'logout-all': async () => { if (!(await stgConfirm('Vous déconnecter de tous les appareils ?', 'Toutes les sessions, y compris celle-ci, seront fermées. Vous devrez saisir votre code pour revenir.', 'Tout déconnecter', {}))) return; await call('auth/logout-all', { method: 'POST', body: {} }); location.reload(); },
    'save-sec-cfg': async () => {
      live('cfg-live', 'busy', 'Enregistrement…');
      try { const r = await call('auth/settings', { method: 'POST', body: { sessionDays: +val('cfg-days'), maxFails: +val('cfg-fails'), lockMinutes: +val('cfg-lock') } }); live('cfg-live', 'ok', 'Enregistré : sessions ' + r.config.sessionDays + ' j, blocage après ' + r.config.maxFails + ' échecs pendant ' + r.config.lockMinutes + ' min.'); } catch (e) { live('cfg-live', 'bad', e.message); }
    },
    'viewer-set': async () => {
      const v = val('cfg-viewer'); if (v.length < 10) return live('viewer-live', 'bad', 'Le code lecteur doit contenir au moins 10 caractères.');
      try { await call('auth/settings', { method: 'POST', body: { viewerCode: v } }); q('#cfg-viewer', S.el).value = ''; live('viewer-live', 'ok', 'Code lecteur enregistré.'); const h = await call('auth/history'); renderSecCfg(h); live('viewer-live', 'ok', 'Code lecteur enregistré.'); } catch (e) { live('viewer-live', 'bad', e.message); }
    },
    'viewer-del': async () => { if (!(await stgConfirm('Retirer le code lecteur ?', 'Les lecteurs ne pourront plus se connecter (leurs sessions en cours restent valides jusqu’à expiration ou révocation).', 'Retirer', {}))) return; try { await call('auth/settings', { method: 'POST', body: { viewerCode: '' } }); const h = await call('auth/history'); renderSecCfg(h); live('viewer-live', 'ok', 'Code lecteur retiré.'); } catch (e) { live('viewer-live', 'bad', e.message); } },

    'save-identity': () => saveSettings('identité', { 'public.identity.name': val('id-name').trim(), 'public.identity.tagline': val('id-tagline').trim(), 'public.identity.email': val('id-email').trim(), 'public.identity.phone': val('id-phone').trim(), 'public.identity.whatsapp': val('id-whatsapp').trim(), 'public.identity.address': val('id-address').trim(), 'public.identity.themeColor': val('id-themeColor').trim() }, 'id-live', () => RENDER.identity(q('#stgPane', S.el))),
    'export-all': () => { download('221-digital-contenu-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(saved, null, 2)); toast('Export téléchargé.'); },
    'import-go': async () => {
      if (!IMPORT) return;
      if (!(await stgConfirm('Importer ce fichier ?', 'Les champs concernés seront remplacés par ceux du fichier. L’état actuel reste restaurable depuis « Sauvegardes ».', 'Importer', { danger: false }))) return;
      live('imp-live', 'busy', 'Import en cours…');
      const ok = await commitL('import JSON', (d) => { IMPORT.keys.forEach((k) => { d[k] = clone(IMPORT.data[k]); }); });
      if (ok) { live('imp-live', 'ok', 'Import enregistré et vérifié sur le serveur.'); IMPORT = null; if (typeof renderAll === 'function') renderAll(); refreshControl(); RENDER.content(q('#stgPane', S.el)); live('imp-live', 'ok', 'Import enregistré et vérifié sur le serveur.'); }
      else live('imp-live', 'bad', 'Échec de l’import : ' + pageLastError());
    },
    'reset-origin': async () => {
      if (!(await stgConfirm('Réinitialiser aux contenus d’origine ?', 'Projets, logos, clients, avis, photo Projets et vitesse reviennent aux contenus livrés à l’origine. Vos sections et paramètres sont conservés.', 'Réinitialiser', { type: 'REINITIALISER' }))) return;
      const dflt = Store221.defaults();
      live('rst-live', 'busy', 'Réinitialisation…');
      const ok = await commitL('réinitialisation aux contenus d’origine', (d) => { ['logos', 'projects', 'clients', 'reviews', 'hero', 'speed'].forEach((k) => { d[k] = clone(dflt[k]); }); });
      if (ok) { if (typeof renderAll === 'function') renderAll(); live('rst-live', 'ok', 'Contenus d’origine rétablis et vérifiés sur le serveur. L’état précédent est dans « Sauvegardes ».'); refreshControl(); } else live('rst-live', 'bad', 'Échec : ' + pageLastError());
    },
    'save-seo': () => saveSettings('SEO', { 'public.seo.title': val('seo-title').trim(), 'public.seo.description': val('seo-desc').trim(), 'public.seo.keywords': val('seo-kw').trim(), 'public.seo.ogImage': val('seo-og').trim(), 'public.seo.canonical': val('seo-canon').trim(), 'public.seo.noindex': chk('seo-noindex'), 'public.seo.jsonLd': chk('seo-ld'), 'public.seo.robotsExtra': val('seo-robots') }, 'seo-live'),
    'fav-check': favCheck,
    'media-refresh': () => renderDetails(),
    'media-copy': async (t) => { await copyText(location.origin + t.dataset.v); toast('Adresse copiée.'); },
    'media-del': async (t) => {
      if (!(await stgConfirm('Supprimer cette image ?', 'Elle n’est utilisée nulle part. Cette action est définitive.', 'Supprimer', {}))) return;
      try { await call('admin/media/delete', { method: 'POST', body: { id: t.dataset.id } }); toast('Image supprimée.'); renderDetails(); } catch (e) { live('media-live', 'bad', e.message); }
    },
    'media-del-unused': async () => {
      const u = MEDIA.filter((m) => !m.used); if (!u.length) return;
      if (!(await stgConfirm('Supprimer ' + u.length + ' image(s) inutilisée(s) ?', 'Seules les images non référencées par les données enregistrées seront supprimées. Action définitive.', 'Tout supprimer', {}))) return;
      let n = 0, fail = 0; for (const m of u) { try { await call('admin/media/delete', { method: 'POST', body: { id: m.id } }); n++; } catch (e) { fail++; } }
      toast(n + ' image(s) supprimée(s)' + (fail ? ', ' + fail + ' conservée(s) (encore utilisées)' : '') + '.'); renderDetails();
    },
    'save-publish': () => saveSettings('publication', { 'public.publication.pollSeconds': +val('pub-poll') || 30, 'public.publication.maintenance': chk('pub-maint'), 'public.publication.maintenanceTitle': val('pub-mt').trim(), 'public.publication.maintenanceText': val('pub-mx').trim() }, 'pub-live', () => RENDER.publish(q('#stgPane', S.el))),
    'save-sdef': () => saveSettings('valeurs par défaut des sections', { 'private.sectionDefaults.status': val('sd-status'), 'private.sectionDefaults.padY': +val('sd-pad') || 0, 'private.sectionDefaults.align': val('sd-align') }, 'sd-live'),
    'purge-archived': async () => {
      const n = (saved.sections || []).filter((s) => s.status === 'archived').length;
      if (!(await stgConfirm('Vider ' + n + ' section(s) archivée(s) ?', 'Elles seront supprimées des données. Une version restaurable est conservée.', 'Vider', {}))) return;
      live('pa-live', 'busy', 'Suppression…');
      const ok = await commitL('suppression des sections archivées', (d) => { d.sections = (d.sections || []).filter((s) => s.status !== 'archived'); });
      if (ok) { if (typeof renderAll === 'function') renderAll(); live('pa-live', 'ok', 'Sections archivées supprimées (vérifié sur le serveur).'); RENDER.sections(q('#stgPane', S.el)); live('pa-live', 'ok', 'Sections archivées supprimées (vérifié sur le serveur).'); } else live('pa-live', 'bad', 'Échec : ' + pageLastError());
    },
    'bk-create': async () => { try { await call('admin/versions/create', { method: 'POST', body: { label: val('bk-label').trim() || 'Sauvegarde manuelle' } }); toast('Sauvegarde créée.'); renderDetails(); } catch (e) { live('bk-live', 'bad', e.message); } },
    'bk-restore': async (t) => {
      const v = VERS.find((x) => x.id === t.dataset.id); const dirty = typeof isDirty === 'function' && isDirty();
      if (!(await stgConfirm('Restaurer la version du ' + fmtDate(v && v.t) + ' ?', 'Les contenus reviennent à cette version et sont publiés sur le site. L’état actuel est conservé comme nouvelle version.' + (dirty ? ' Attention : vos modifications non enregistrées seront perdues.' : ''), 'Restaurer', { danger: false }))) return;
      try { await call('admin/versions/restore', { method: 'POST', body: { id: t.dataset.id } }); toast('Version restaurée. Rechargement…'); setTimeout(() => location.reload(), 700); } catch (e) { live('bk-live', 'bad', e.message); }
    },
    'bk-del': async (t) => { if (!(await stgConfirm('Supprimer cette sauvegarde ?', 'Cette version ne pourra plus être restaurée.', 'Supprimer', {}))) return; try { await call('admin/versions/delete', { method: 'POST', body: { id: t.dataset.id } }); renderDetails(); } catch (e) { live('bk-live', 'bad', e.message); } },
    'save-forms': () => saveSettings('formulaires', { 'public.forms.serviceId': val('fm-service').trim(), 'public.forms.templateId': val('fm-template').trim(), 'public.forms.publicKey': val('fm-key').trim(), 'public.forms.toEmail': val('fm-to').trim() }, 'fm-live'),
    'perf-run': async () => {
      const out = q('#perf-out', S.el); out.textContent = 'Mesure en cours…';
      const times = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); await fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()); times.push(performance.now() - t0); }
      times.sort((a, b) => a - b);
      const t1 = performance.now(); const txt = await (await fetch('/api/content?t=' + Date.now(), { cache: 'no-store' })).text(); const tc = performance.now() - t1;
      const t2 = performance.now(); await call('admin/status'); const ts = performance.now() - t2;
      out.innerHTML = `<div class="stg-stats"><div class="stg-stat"><strong>${Math.round(times[2])} ms</strong><span>Réponse API (médiane de 5)</span></div><div class="stg-stat"><strong>${Math.round(tc)} ms</strong><span>Données publiques</span></div><div class="stg-stat"><strong>${fmtBytes(txt.length)}</strong><span>Taille de /api/content</span></div><div class="stg-stat"><strong>${Math.round(ts)} ms</strong><span>Lecture du stockage</span></div></div>`;
    },
    'integr-test': async () => { live('integr-live', 'busy', 'Test en cours…'); await renderDetails(); setTimeout(() => live('integr-live', 'ok', 'Test terminé à ' + new Date().toLocaleTimeString('fr-FR') + '.'), 400); },
    'sync-run': async () => {
      const out = q('#sync-out', S.el); const rows = []; const paint = () => { out.innerHTML = rows.join(''); };
      rows.push('<p class="stg-sm">Test en cours…</p>'); paint(); rows.length = 0; let allOk = true; const t0 = performance.now();
      const dirty = typeof isDirty === 'function' && isDirty();
      if (viewer()) rows.push(checkRow(null, 'Écriture/relecture du stockage', 'Non testée : réservé au code principal.'));
      else { try { const r = await call('admin/selftest', { method: 'POST', body: {} }); const ok = r.written && r.readBack; allOk = allOk && ok; rows.push(checkRow(ok, 'Écriture puis relecture du stockage', ok ? 'Un fichier de test a été écrit, relu à l’identique puis supprimé en ' + r.ms + ' ms.' : 'La relecture ne correspond pas à l’écriture.')); } catch (e) { allOk = false; rows.push(checkRow(false, 'Écriture puis relecture du stockage', E(e.message))); } }
      try {
        const adm = await call('admin/content'); const same = String(adm.rev) === String(Store221.rev);
        rows.push(checkRow(same, 'Version du gestionnaire = version du serveur', same ? 'Révision ' + E(String(adm.rev).replace(/"/g, '').slice(0, 10)) + '.' : 'Le serveur a une version plus récente que celle chargée ici (modifiée ailleurs) : rechargez le gestionnaire avant d’enregistrer.')); allOk = allOk && same;
        const pub = await (await fetch('/api/content?t=' + Date.now(), { cache: 'no-store' })).json();
        const pubOk = pub.ok && pub.rev === '"p' + String(adm.rev).replace(/"/g, '') + '"'; allOk = allOk && pubOk;
        rows.push(checkRow(pubOk, 'Le site public sert la dernière version', pubOk ? 'Les visiteurs reçoivent la révision enregistrée.' : 'La révision publique diffère (cache de quelques secondes possible) : réessayez dans 10 s.'));
      } catch (e) { allOk = false; rows.push(checkRow(false, 'Comparaison avec le site public', E(e.message))); }
      rows.push(checkRow(!dirty ? true : null, 'Modifications non enregistrées', dirty ? 'Des modifications locales ne sont pas encore enregistrées : elles ne sont pas incluses dans ce test.' : 'Aucune : tout ce qui est affiché est enregistré.'));
      const ms = Math.round(performance.now() - t0);
      rows.unshift(`<div class="stg-verdict is-${allOk ? 'ok' : 'bad'}" role="status">${allOk ? '✓ Synchronisation vérifiée' : '✗ Synchronisation à vérifier'} <span class="stg-sm">(${ms} ms)</span></div>`); paint(); refreshControl();
    },
    'log-export': async () => { const r = await call('admin/log'); download('221-digital-journal-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(r.entries, null, 2)); toast('Journal exporté.'); },
    'adv-days-save': async () => { try { const r = await call('auth/settings', { method: 'POST', body: { sessionDays: +val('adv-days') } }); live('adv-days-live', 'ok', 'Durée de session : ' + r.config.sessionDays + ' jour(s), appliquée aux prochaines connexions.'); } catch (e) { live('adv-days-live', 'bad', e.message); } },
    'clean-versions': async () => {
      const keep = +val('adv-keep'); const r = await call('admin/versions'); const old = r.versions.slice(keep);
      if (!old.length) return live('adv-clean-live', 'ok', 'Rien à nettoyer : ' + r.versions.length + ' version(s) seulement.');
      if (!(await stgConfirm('Supprimer ' + old.length + ' ancienne(s) version(s) ?', 'Seules les ' + keep + ' versions les plus récentes seront conservées. Action définitive.', 'Supprimer', {}))) return;
      for (const v of old) await call('admin/versions/delete', { method: 'POST', body: { id: v.id } });
      live('adv-clean-live', 'ok', old.length + ' version(s) supprimée(s).');
    },
    'save-notes': () => saveSettings('notes privées', { 'private.notes': val('adv-notes') }, 'adv-live'),
  };

  window.SettingsUI = { init, open, renderControlNote };
})();
