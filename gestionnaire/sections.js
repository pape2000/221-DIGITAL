/* ==========================================================================
   221 DIGITAL — Catégorie « SECTIONS » du gestionnaire
   Volets : Positions (ordre de la page, glisser-déposer) · Création (manuelle / par code) · Bibliothèque (modèles + mes sections)
   S'appuie sur : Sections221 (rendu), SectionTemplates221 (modèles), Schema221 (schéma partagé) et les fonctions du gestionnaire
   ($, esc, clone, uid, toast, confirmDelete, pickFile, readImage, commit, saved, draft, Store221).
   Toutes les écritures passent par commit() : enregistrement serveur + relecture de contrôle.
   ========================================================================== */
window.SectionsUI = (() => {
  const ST_LABEL = { draft: 'Brouillon', library: 'Bibliothèque', published: 'Publié', archived: 'Archivé' };
  const FIELD_LABEL = { eyebrow: 'Sur-titre', title: 'Titre', subtitle: 'Sous-titre', text: 'Texte', image: 'Image', buttons: 'Boutons' };
  const ITEM_LABEL = { icon: 'Icône (emoji)', title: 'Titre', text: 'Texte', image: 'Image', value: 'Valeur', label: 'Libellé', url: 'Lien', sub: 'Sous-titre', rating: 'Note (0 à 5)' };
  const ITEM_LONG = { text: 1 };
  const MAX_HISTORY = 15;

  const ui = { view: 'positions', libTab: 'models', filter: 'all', q: '', histFor: null };
  let ed = null;            // éditeur ouvert : { sec, isNew, device, codeTab, placeSel, err }
  let root = null, inited = false, previewTimer = 0, drag = null, thumbObs = null, busyUI = false;

  /* ---------- Outils ---------- */
  const SCH = () => window.Schema221;
  const ro = () => window.Store221 && Store221.role === 'viewer';
  const V = () => (window.Sections221 && Sections221.VARIANTS) || {};
  const TPL = () => window.SectionTemplates221 || [];
  const secs = () => (draft.sections || []);
  const layout = () => SCH().normalizeLayout(draft.sectionLayout, draft.sections || []);
  const byId = (id) => secs().find((s) => s.id === id);
  const norm = (s) => SCH().normalizeSection(s, {});
  const fmtDate = (t) => t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; };
  const plainCopy = (s) => { const c = clone(s); delete c.history; return c; };
  const secLabel = (s) => s.name || (s.content && s.content.title) || 'Section sans nom';

  /* Confirmation réutilisant la boîte existante, avec libellés adaptés */
  async function confirmAction(opt) {
    const t = $('#confirmTitle'), p = $('#confirmText'), y = $('#confirmYes');
    const old = [t.textContent, p.textContent, y.textContent];
    t.textContent = opt.title; p.textContent = opt.text; y.textContent = opt.yes || 'Confirmer';
    try { return await confirmDelete(opt.what || ''); }
    finally { t.textContent = old[0]; p.textContent = old[1]; y.textContent = old[2]; }
  }

  /* Défauts pour une nouvelle section (réglages Paramètres > Gestion des sections) */
  function defaultsCfg() { const d = (draft.settings && draft.settings.private && draft.settings.private.sectionDefaults) || {}; return { status: d.status || 'draft', padY: d.padY == null ? 72 : d.padY, align: d.align || 'left' }; }
  function blankSection(variant, kind) {
    const d = defaultsCfg(); const meta = V()[variant] || {};
    const it = meta.items ? [1, 2, 3].map((n) => ({ icon: '✦', title: 'Élément ' + n, text: 'Décrivez cet élément en une ou deux phrases.', value: '', label: '', url: '', sub: '', rating: 0, image: '' })) : [];
    return norm({
      id: uid('sx'), name: kind === 'code' ? 'Section personnalisée' : 'Nouvelle section ' + (meta.label || ''), kind, variant: variant || 'text', status: d.status,
      content: { title: 'Titre de la section', subtitle: '', text: '', columns: 3, buttons: [], items: it },
      style: { padY: d.padY, align: d.align },
      code: kind === 'code' ? { html: '<section class="demo">\n  <h2>Titre de ma section</h2>\n  <p>Collez ici votre code HTML.</p>\n</section>', css: '.demo { padding: 56px 24px; text-align: center; font-family: Inter, Arial, sans-serif; }\n.demo h2 { font-size: 32px; margin: 0 0 12px; }', height: 0 } : undefined,
    });
  }
  function freshFromTemplate(t) {
    const d = defaultsCfg(); const s = t.make(d);
    s.id = uid('sx'); s.status = d.status; s.history = []; s.publishedAt = 0; s.template = t.id;
    if (!s.name) s.name = t.name;
    return norm(s);
  }

  /* ---------- Rendu du volet ---------- */
  function init() {
    root = $('#sectionsRoot'); if (!root || inited) return; inited = true;
    root.className = 'sxu';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('dragstart', onDragStart); root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave); root.addEventListener('drop', onDrop); root.addEventListener('dragend', clearDrag);
    thumbObs = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { thumbObs.unobserve(e.target); fillThumb(e.target); } }), { rootMargin: '200px' }) : null;
  }
  function render() {
    if (!root) return;
    const n = $('#countSections'); if (n) n.textContent = secs().length;
    if (ed) return;                      // pendant l'édition, ne pas écraser le formulaire
    const ctx = root.scrollTop;
    root.innerHTML = head() + '<div class="sxu-body">' + (ui.view === 'positions' ? viewPositions() : ui.view === 'create' ? viewCreate() : viewLibrary()) + '</div>' + (ui.histFor ? histDialog() : '');
    root.classList.toggle('sxu-ro', !!ro());
    hydrateThumbs();
    if (window.__sxFocus) { const el = root.querySelector(window.__sxFocus); if (el) el.focus(); window.__sxFocus = null; }
  }
  function head() {
    const tabs = [['positions', 'Positions'], ['create', 'Création'], ['library', 'Bibliothèque']];
    const pub = secs().filter((s) => s.status === 'published').length;
    return `<div class="sxu-head"><div><h2>Sections de la page d'accueil</h2><p>Créez des sections, rangez-les dans votre bibliothèque privée ou publiez-les sur le site. ${pub} section${pub > 1 ? 's' : ''} publiée${pub > 1 ? 's' : ''} sur le site.</p></div>
      <div class="sxu-seg" role="tablist" aria-label="Volets Sections">${tabs.map(([k, l]) => `<button type="button" role="tab" class="sxu-segb" data-act="view" data-v="${k}" aria-selected="${ui.view === k}">${l}</button>`).join('')}</div></div>
      ${ro() ? '<p class="sxu-note">Accès en lecture seule : les actions de modification sont désactivées.</p>' : ''}`;
  }

  /* ----- Positions ----- */
  function viewPositions() {
    const L = layout(); const A = SCH().ANCHOR_LABELS;
    const pubs = L.filter((x) => !SCH().FIXED_ANCHORS.includes(x));
    const rows = L.map((id) => {
      if (SCH().FIXED_ANCHORS.includes(id)) return `<li class="sxu-row is-fixed" data-row="${id}" aria-label="Section du site : ${esc(A[id])}"><span class="sxu-lock" aria-hidden="true">🔒</span><span class="sxu-rname">${esc(A[id])}</span><span class="sxu-rmeta">Section du site (fixe)</span></li>`;
      const s = byId(id); if (!s) return '';
      const i = pubs.indexOf(id);
      return `<li class="sxu-row is-pub" data-row="${id}" draggable="${ro() ? 'false' : 'true'}">
        <span class="sxu-handle" title="Glisser pour déplacer" aria-hidden="true">⋮⋮</span><span class="sxu-dot" title="Publié sur le site" role="img" aria-label="Publié"></span>
        <span class="sxu-rname">${esc(secLabel(s))}</span><span class="sxu-rmeta">${esc((V()[s.variant] || {}).label || s.variant)}${s.kind === 'code' ? ' · code' : ''}</span>
        <span class="sxu-racts"><button type="button" class="btn btn-light btn-sm sxu-ibtn" data-act="up" data-id="${id}" aria-label="Monter « ${esc(secLabel(s))} »" ${ro() || L.indexOf(id) === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn btn-light btn-sm sxu-ibtn" data-act="down" data-id="${id}" aria-label="Descendre « ${esc(secLabel(s))} »" ${ro() || L.indexOf(id) === L.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn btn-light btn-sm" data-act="edit" data-id="${id}">Modifier</button></span></li>`;
    }).join('');
    return `<div class="panel"><div class="panel-head"><div><h2>Ordre de la page d'accueil</h2><p>Glissez une section publiée par sa poignée ⋮⋮ (ou utilisez ↑ ↓) pour la placer entre deux sections du site, avant ou après le pied de page. Les sections du site (🔒) ne bougent pas. Chaque déplacement est enregistré sur le serveur.</p></div></div>
      ${pubs.length ? '' : '<p class="sxu-empty-hint">Aucune section personnalisée n\'est publiée pour le moment. Créez-en une dans « Création » ou utilisez un modèle de la « Bibliothèque ».</p>'}
      <ol class="sxu-list" id="sxList" aria-label="Ordre des sections de la page">${rows}</ol></div>`;
  }

  /* ----- Création ----- */
  function viewCreate() {
    const vs = Object.entries(V());
    return `<div class="sxu-two">
      <div class="panel"><div class="panel-head"><div><h2>Création manuelle</h2><p>Construisez une section avec des contrôles visuels : textes, image, boutons, colonnes, couleurs, espacements et aperçu en direct.</p></div></div>
        <div class="field"><label for="sxVariant">Type de section de départ</label><select id="sxVariant" class="sxu-input">${vs.map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><p class="hint" id="sxVariantHint">${esc((vs[0] && vs[0][1].description) || '')}</p></div>
        <button type="button" class="btn btn-primary" data-act="new-manual" ${ro() ? 'disabled' : ''}>Créer une section</button></div>
      <div class="panel"><div class="panel-head"><div><h2>Création à partir du code</h2><p>Collez votre propre HTML et CSS. Le code est affiché dans un cadre isolé : les scripts sont supprimés et ne s'exécutent jamais.</p></div></div>
        <p class="sxu-warn">⚠ Pour la sécurité du site, <strong>JavaScript est interdit</strong> : balises script, iframe, formulaires et attributs « on… » sont retirés à l'enregistrement.</p>
        <button type="button" class="btn btn-primary" data-act="new-code" ${ro() ? 'disabled' : ''}>Créer une section par code</button></div></div>`;
  }

  /* ----- Bibliothèque ----- */
  function viewLibrary() {
    const tabs = `<div class="sxu-seg sxu-seg-sm" role="tablist"><button type="button" class="sxu-segb" role="tab" data-act="libtab" data-v="models" aria-selected="${ui.libTab === 'models'}">Modèles (${TPL().length})</button><button type="button" class="sxu-segb" role="tab" data-act="libtab" data-v="mine" aria-selected="${ui.libTab === 'mine'}">Mes sections (${secs().length})</button></div>`;
    if (ui.libTab === 'models') {
      return `<div class="panel"><div class="panel-head"><div><h2>Modèles de sections</h2><p>Choisissez un modèle, personnalisez son contenu, prévisualisez-le, puis rangez-le dans la bibliothèque ou publiez-le.</p></div>${tabs}</div>
        <div class="sxu-grid">${TPL().map((t) => `<article class="sxu-card"><div class="sxu-thumb" data-thumb="tpl:${esc(t.id)}" aria-hidden="true"></div><div class="sxu-cbody"><h3>${esc(t.name)}</h3><p>${esc(t.description || '')}</p><span class="sxu-tag">${esc((V()[t.variant] || {}).label || t.variant)}${t.make && t.kindHint === 'code' ? ' · code' : ''}</span></div><div class="sxu-cacts"><button type="button" class="btn btn-primary btn-sm" data-act="use-tpl" data-id="${esc(t.id)}" ${ro() ? 'disabled' : ''}>Utiliser ce modèle</button></div></article>`).join('')}</div></div>`;
    }
    const q = ui.q.trim().toLowerCase();
    const counts = { all: secs().length }; Object.keys(ST_LABEL).forEach((k) => { counts[k] = secs().filter((s) => s.status === k).length; });
    const list = secs().filter((s) => (ui.filter === 'all' || s.status === ui.filter) && (!q || (secLabel(s) + ' ' + (s.content.title || '')).toLowerCase().includes(q)));
    const chips = ['all', 'draft', 'library', 'published', 'archived'].map((k) => `<button type="button" class="sxu-chip" data-act="filter" data-v="${k}" aria-pressed="${ui.filter === k}">${k === 'all' ? 'Toutes' : ST_LABEL[k]} <span>${counts[k]}</span></button>`).join('');
    return `<div class="panel"><div class="panel-head"><div><h2>Mes sections</h2><p>Brouillons, bibliothèque privée (invisible du site), sections publiées et archivées.</p></div>${tabs}</div>
      <div class="sxu-filters">${chips}<input type="search" class="sxu-input sxu-search" id="sxSearch" placeholder="Rechercher une section…" value="${esc(ui.q)}" aria-label="Rechercher une section"></div>
      ${list.length ? `<div class="sxu-grid">${list.map(mineCard).join('')}</div>` : '<div class="empty-list">Aucune section ne correspond. Créez-en une dans « Création » ou utilisez un modèle.</div>'}</div>`;
  }
  function mineCard(s) {
    const d = ro() ? 'disabled' : '';
    const pub = s.status === 'published', arch = s.status === 'archived';
    return `<article class="sxu-card" data-card="${esc(s.id)}"><div class="sxu-thumb" data-thumb="sec:${esc(s.id)}" aria-hidden="true"></div>
      <div class="sxu-cbody"><h3>${esc(secLabel(s))}</h3><p>${esc((V()[s.variant] || {}).label || s.variant)}${s.kind === 'code' ? ' · code' : ''} · modifiée ${esc(fmtDate(s.updatedAt))}</p><span class="sxu-badge is-${s.status}">${ST_LABEL[s.status]}</span></div>
      <div class="sxu-cacts"><button type="button" class="btn btn-edit sxu-edit" data-act="edit" data-id="${esc(s.id)}">Modifier</button>
        ${arch ? `<button type="button" class="btn btn-light btn-sm" data-act="restore" data-id="${esc(s.id)}" ${d}>Restaurer</button>` : pub ? `<button type="button" class="btn btn-light btn-sm" data-act="unpublish" data-id="${esc(s.id)}" ${d}>Dépublier</button>` : `<button type="button" class="btn btn-light btn-sm" data-act="publish" data-id="${esc(s.id)}" ${d}>Publier</button>`}
        <button type="button" class="btn btn-light btn-sm" data-act="dup" data-id="${esc(s.id)}" ${d}>Dupliquer</button>
        <button type="button" class="btn btn-light btn-sm" data-act="hist" data-id="${esc(s.id)}">Historique</button>
        ${!arch ? `<button type="button" class="btn btn-light btn-sm" data-act="archive" data-id="${esc(s.id)}" ${d}>Archiver</button>` : ''}
        <button type="button" class="btn-del" data-act="del" data-id="${esc(s.id)}" aria-label="Supprimer « ${esc(secLabel(s))} »" ${d}>${typeof ICON_TRASH !== 'undefined' ? ICON_TRASH : '🗑'}</button></div></article>`;
  }

  /* ----- Miniatures (rendu réel réduit) ----- */
  function hydrateThumbs() { root.querySelectorAll('[data-thumb]').forEach((el) => { if (thumbObs) thumbObs.observe(el); else fillThumb(el); }); }
  function fillThumb(el) {
    const [kind, id] = el.dataset.thumb.split(/:(.+)/); let s = null;
    try { s = kind === 'tpl' ? freshFromTemplate(TPL().find((t) => t.id === id)) : byId(id); } catch (e) { s = null; }
    if (!s || !window.Sections221) { el.textContent = 'Aperçu indisponible'; return; }
    const inner = document.createElement('div'); inner.className = 'sxu-thumb-in';
    try { inner.appendChild(Sections221.render(clone(s), { preview: true })); } catch (e) { el.textContent = 'Aperçu indisponible'; return; }
    el.innerHTML = ''; el.appendChild(inner);
    const fit = () => { const k = el.clientWidth / 1200; inner.style.transform = 'scale(' + k + ')'; };
    fit(); if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el);
  }

  /* ---------- Actions de liste ---------- */
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, id = b.dataset.id;
    const W = ['new-manual', 'new-code', 'use-tpl', 'up', 'down', 'unpublish', 'publish', 'dup', 'archive', 'restore', 'del', 'save', 'restore-hist'];
    if (ro() && W.includes(act)) return;
    switch (act) {
      case 'view': ui.view = b.dataset.v; ui.histFor = null; return render();
      case 'libtab': ui.libTab = b.dataset.v; return render();
      case 'filter': ui.filter = b.dataset.v; return render();
      case 'new-manual': return openEditor(blankSection($('#sxVariant').value, 'blocks'), true);
      case 'new-code': return openEditor(blankSection('text', 'code'), true);
      case 'use-tpl': return openEditor(freshFromTemplate(TPL().find((t) => t.id === id)), true);
      case 'edit': return openEditor(clone(byId(id)), false);
      case 'up': return moveBy(id, -1);
      case 'down': return moveBy(id, 1);
      case 'publish': return quickPublish(id);
      case 'unpublish': return unpublish(id);
      case 'dup': return duplicate(id);
      case 'archive': return archive(id);
      case 'restore': return setStatus(id, 'library', 'Section restaurée dans la bibliothèque.');
      case 'del': return remove(id);
      case 'hist': ui.histFor = id; return render();
      case 'hist-close': ui.histFor = null; return render();
      case 'restore-hist': return restoreHistory(b.dataset.id, +b.dataset.t);
      default: return editorClick(act, b, e);
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'sxVariant') { const m = V()[t.value]; const h = $('#sxVariantHint'); if (h) h.textContent = (m && m.description) || ''; return; }
    if (t.id === 'sxSearch') { ui.q = t.value; const pos = t.selectionStart; render(); const s = $('#sxSearch'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } return; }
    if (ed) editorInput(t);
  }

  /* ---------- Écritures (toutes via commit) ---------- */
  function histEntry(label, s) { return { t: Date.now(), label, snapshot: plainCopy(s) }; }
  function layoutPlace(L, id, rel, target) {
    L = L.filter((x) => x !== id);
    let i = L.indexOf(target); if (i < 0) i = L.indexOf('footer');
    L.splice(rel === 'after' ? i + 1 : i, 0, id); return L;
  }
  async function writeSection(sec, opt) {
    /* opt: { place:'before:footer', label } — sec déjà normalisée, sans data URI */
    const pub = sec.status === 'published';
    const ok = await commit((d) => {
      d.sections = d.sections || [];
      const i = d.sections.findIndex((x) => x.id === sec.id);
      const prev = i >= 0 ? d.sections[i] : null;
      const s = clone(sec);
      s.history = [histEntry(opt.label, s)].concat((prev && prev.history) || []).slice(0, MAX_HISTORY);
      if (i >= 0) d.sections[i] = norm(s); else d.sections.push(norm(s));
      let L = SCH().normalizeLayout(d.sectionLayout, d.sections.filter((x) => x.id !== s.id || false));
      L = L.filter((x) => x !== s.id);
      if (pub) {
        const [rel, tgt] = (opt.place || 'before:footer').split(':');
        L = layoutPlace(L, s.id, rel, tgt);
      }
      d.sectionLayout = SCH().normalizeLayout(L, d.sections);
    });
    return ok;
  }
  async function moveBy(id, dir) {
    const ok = await commit((d) => {
      const L = SCH().normalizeLayout(d.sectionLayout, d.sections || []); const i = L.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= L.length) return;
      [L[i], L[j]] = [L[j], L[i]]; d.sectionLayout = SCH().normalizeLayout(L, d.sections || []);
    });
    if (ok) { toast('Position enregistrée.'); window.__sxFocus = `[data-act="${dir < 0 ? 'up' : 'down'}"][data-id="${id}"]`; render(); const f = window.__sxFocus && root.querySelector(window.__sxFocus); if (f && f.disabled) { const o = root.querySelector(`[data-act="${dir < 0 ? 'down' : 'up'}"][data-id="${id}"]`); if (o) o.focus(); } }
  }
  async function moveTo(id, rel, target) {
    if (id === target) return;
    const ok = await commit((d) => { d.sectionLayout = SCH().normalizeLayout(layoutPlace(SCH().normalizeLayout(d.sectionLayout, d.sections || []), id, rel, target), d.sections || []); });
    if (ok) { toast('Position enregistrée.'); render(); }
  }
  async function setStatus(id, status, msg) {
    const s = byId(id); if (!s) return;
    const n = norm(Object.assign(clone(s), { status, updatedAt: Date.now(), publishedAt: status === 'published' ? Date.now() : s.publishedAt }));
    if (await writeSection(n, { label: ST_LABEL[status] })) { toast(msg || 'Enregistré.'); render(); }
  }
  async function quickPublish(id) {
    const s = byId(id); if (!s) return;
    const n = norm(Object.assign(clone(s), { status: 'published', updatedAt: Date.now(), publishedAt: Date.now() }));
    if (await writeSection(n, { label: 'Publié', place: 'before:footer' })) { toast('Publié sur le site, avant le pied de page. Ajustez l\'emplacement dans « Positions ».'); render(); }
  }
  async function unpublish(id) {
    const s = byId(id); if (!s) return;
    if (!(await confirmAction({ title: 'Retirer cette section du site ?', text: 'La section ne sera plus visible par les visiteurs. Elle est conservée dans votre bibliothèque.', what: secLabel(s), yes: 'Retirer du site' }))) return;
    await setStatus(id, 'library', 'Section retirée du site et conservée dans la bibliothèque.');
  }
  async function archive(id) {
    const s = byId(id); if (!s) return;
    if (s.status === 'published' && !(await confirmAction({ title: 'Archiver une section publiée ?', text: 'Elle sera retirée du site public.', what: secLabel(s), yes: 'Archiver et retirer du site' }))) return;
    await setStatus(id, 'archived', 'Section archivée.');
  }
  async function duplicate(id) {
    const s = byId(id); if (!s) return;
    const c = clone(s); c.id = uid('sx'); c.name = secLabel(s) + ' (copie)'; c.status = 'library'; c.history = []; c.publishedAt = 0; c.updatedAt = Date.now();
    if (await writeSection(norm(c), { label: 'Copie' })) { toast('Section dupliquée dans la bibliothèque.'); render(); }
  }
  async function remove(id) {
    const s = byId(id); if (!s) return;
    const pub = s.status === 'published';
    const yes = await confirmAction({ title: pub ? 'Supprimer une section PUBLIÉE ?' : 'Supprimer cette section ?', text: pub ? 'Cette section est actuellement visible sur le site public : elle en disparaîtra immédiatement. Cette action ne pourra pas être annulée.' : 'Cette section et son historique seront supprimés définitivement.', what: secLabel(s), yes: 'Confirmer la suppression' });
    if (!yes) return;
    const ok = await commit((d) => { d.sections = (d.sections || []).filter((x) => x.id !== id); d.sectionLayout = SCH().normalizeLayout((d.sectionLayout || []).filter((x) => x !== id), d.sections); });
    if (ok) { toast('Section supprimée.'); render(); }
  }

  /* ----- Historique ----- */
  function histDialog() {
    const s = byId(ui.histFor); if (!s) return '';
    const h = s.history || [];
    return `<div class="overlay sxu-hist" role="dialog" aria-modal="true" aria-label="Historique de la section"><div class="dialog sxu-histbox"><h2>Historique · ${esc(secLabel(s))}</h2><p>Chaque enregistrement conserve une version (${MAX_HISTORY} maximum). Restaurer ne supprime rien : l'état actuel est lui aussi conservé.</p>
      <ul class="sxu-histlist">${h.length ? h.map((e) => `<li><span><strong>${esc(e.label || 'Version')}</strong><small>${esc(fmtDate(e.t))}</small></span><button type="button" class="btn btn-light btn-sm" data-act="restore-hist" data-id="${esc(s.id)}" data-t="${e.t}" ${ro() ? 'disabled' : ''}>Restaurer cette version</button></li>`).join('') : '<li>Aucune version enregistrée.</li>'}</ul>
      <div class="row"><button type="button" class="btn btn-light" data-act="hist-close">Fermer</button></div></div></div>`;
  }
  async function restoreHistory(id, t) {
    const s = byId(id); const e = s && (s.history || []).find((x) => x.t === t); if (!e || !e.snapshot) return;
    if (s.status === 'published' && !(await confirmAction({ title: 'Restaurer cette version ?', text: 'Cette section est publiée : la version restaurée sera visible tout de suite sur le site.', what: secLabel(s) + ' · ' + fmtDate(t), yes: 'Restaurer' }))) return;
    const n = norm(Object.assign(clone(e.snapshot), { id: s.id, status: s.status, publishedAt: s.publishedAt, updatedAt: Date.now(), history: s.history }));
    if (await writeSection(n, { label: 'Restauration du ' + fmtDate(t), place: undefined })) { toast('Version restaurée.'); ui.histFor = null; render(); }
  }

  /* ---------- Glisser-déposer (positions) ---------- */
  function rowOf(el) { return el.closest && el.closest('.sxu-row'); }
  function onDragStart(e) {
    const r = rowOf(e.target); if (!r || !r.classList.contains('is-pub') || ro()) { e.preventDefault(); return; }
    drag = { id: r.dataset.row }; r.classList.add('is-dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.id); } catch (x) {}
  }
  function dropSide(r, e) { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2 ? 'before' : 'after'; }
  function clearMarks() { root.querySelectorAll('.sxu-drop-before,.sxu-drop-after').forEach((n) => n.classList.remove('sxu-drop-before', 'sxu-drop-after')); }
  function clearDrag() { drag = null; clearMarks(); root.querySelectorAll('.is-dragging').forEach((n) => n.classList.remove('is-dragging')); }
  function onDragOver(e) {
    if (!drag) return; const r = rowOf(e.target); if (!r || r.dataset.row === drag.id) return;
    e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
    clearMarks(); r.classList.add(dropSide(r, e) === 'before' ? 'sxu-drop-before' : 'sxu-drop-after');
  }
  function onDragLeave(e) { if (!e.relatedTarget || !root.contains(e.relatedTarget)) clearMarks(); }
  function onDrop(e) {
    if (!drag) return; const r = rowOf(e.target); if (!r) return clearDrag();
    e.preventDefault(); const id = drag.id, side = dropSide(r, e), tgt = r.dataset.row; clearDrag(); moveTo(id, side, tgt);
  }

  /* ==========================================================================
     ÉDITEUR (manuel + code) avec aperçu en direct
     ========================================================================== */
  function openEditor(sec, isNew) {
    const L = layout();
    ed = { sec: clone(sec), isNew, device: 'desktop', codeTab: 'html', err: '', place: 'before:footer' };
    ed.orig = clone(sec);
    if (!isNew && sec.status === 'published') { const i = L.indexOf(sec.id); ed.place = i > 0 ? 'after:' + L[i - 1] : 'before:accueil'; }
    renderEditor(); root.scrollIntoView({ block: 'start' });
  }
  function closeEditor() { ed = null; render(); }

  /* Champs génériques liés par chemin (data-p) */
  const fText = (label, p, val, o) => { o = o || {}; return `<div class="field"><label>${label}</label>${o.long ? `<textarea class="sxu-input" data-p="${p}" rows="${o.rows || 4}">${esc(val)}</textarea>` : `<input type="${o.type || 'text'}" class="sxu-input" data-p="${p}" value="${esc(val)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>`}</div>`; };
  const fNum = (label, p, val, min, max, step) => `<div class="field sxu-range"><label>${label} <output>${val}</output></label><input type="range" data-p="${p}" data-t="n" min="${min}" max="${max}" step="${step || 1}" value="${val}"></div>`;
  const fColor = (label, p, val) => `<div class="field sxu-color"><label>${label}</label><div class="sxu-colrow"><input type="color" data-p="${p}" value="${/^#[0-9a-f]{6}$/i.test(val) ? val : '#ffffff'}" aria-label="${esc(label)}"><span>${val ? esc(val) : 'par défaut'}</span><button type="button" class="btn btn-text" data-act="clr" data-p="${p}">Par défaut</button></div></div>`;
  const imgField = (label, p, val, alt) => `<div class="field"><label>${label}</label><div class="sxu-imgrow"><div class="sxu-imgprev">${val ? `<img src="${esc(Store221.resolve(val))}" alt="">` : '<span>Aucune image</span>'}</div><div class="sxu-imgbtns"><button type="button" class="btn btn-light btn-sm" data-act="img" data-p="${p}">${val ? 'Changer' : 'Choisir une image'}</button>${val ? `<button type="button" class="btn btn-light btn-sm" data-act="imgdel" data-p="${p}" style="color:var(--danger)">Retirer</button>` : ''}</div></div>${alt || ''}</div>`;

  function renderEditor() {
    const s = ed.sec, meta = V()[s.variant] || { label: s.variant, fields: ['title', 'subtitle', 'text'], items: null };
    const code = s.kind === 'code', wasPub = !ed.isNew && (byId(s.id) || {}).status === 'published';
    const L = layout().filter((x) => x !== s.id), A = SCH().ANCHOR_LABELS;
    const lbl = (id) => SCH().FIXED_ANCHORS.includes(id) ? A[id] : secLabel(byId(id) || { name: id });
    const opts = [`<option value="before:accueil">Tout en haut de la page (avant l'accueil)</option>`].concat(L.map((id) => `<option value="after:${esc(id)}">Après : ${esc(lbl(id))}</option>`)).concat(['<option value="before:footer">Avant le pied de page</option>']);
    const ctl = code ? codeControls(s) : blockControls(s, meta);
    root.innerHTML = `<div class="sxu-edhead"><button type="button" class="btn btn-light btn-sm" data-act="ed-cancel">← Retour</button><h2>${ed.isNew ? 'Nouvelle section' : 'Modifier la section'} ${wasPub ? '<span class="sxu-badge is-published">Publié</span>' : ''}</h2></div>
      ${ed.err ? `<p class="sxu-error" role="alert">${esc(ed.err)}</p>` : ''}
      <div class="sxu-edgrid"><div class="sxu-controls">${ctl}</div>
        <div class="sxu-previewcol"><div class="sxu-prevbar"><strong>Aperçu</strong><div class="sxu-seg sxu-seg-sm">${[['desktop', 'Ordinateur'], ['tablet', 'Tablette'], ['mobile', 'Mobile']].map(([k, l]) => `<button type="button" class="sxu-segb" data-act="dev" data-v="${k}" aria-selected="${ed.device === k}">${l}</button>`).join('')}</div></div>
          <div class="sxu-stage"><div class="sxu-frame is-${ed.device}" id="sxPrev"></div></div><p class="hint sxu-prevnote" id="sxPrevNote"></p></div></div>
      <div class="sxu-destbar"><div class="field sxu-place"><label for="sxPlace">Emplacement si publiée</label><select id="sxPlace" class="sxu-input" data-place>${opts.join('')}</select></div>
        <div class="sxu-destbtns"><button type="button" class="btn btn-light" data-act="save" data-dest="draft" ${ro() ? 'disabled' : ''}>Enregistrer comme brouillon</button>
        <button type="button" class="btn btn-light" data-act="save" data-dest="library" ${ro() ? 'disabled' : ''}>Enregistrer dans la bibliothèque</button>
        <button type="button" class="btn btn-primary" data-act="save" data-dest="published" ${ro() ? 'disabled' : ''}>${wasPub ? 'Mettre à jour sur le site' : 'Publier sur le site'}</button></div></div>`;
    const sel = $('#sxPlace'); if (sel) { sel.value = ed.place; if (sel.value !== ed.place) sel.value = 'before:footer'; }
    updatePreview();
  }

  function blockControls(s, meta) {
    const c = s.content, st = s.style, F = meta.fields || [];
    const variants = Object.entries(V());
    let h = `<details class="sxu-grp" open><summary>Général</summary>${fText('Nom de la section (usage interne)', 'name', s.name)}
      <div class="field"><label>Type de mise en page</label><select class="sxu-input" data-p="variant" data-rerender="1">${variants.map(([k, v]) => `<option value="${k}" ${k === s.variant ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select><p class="hint">${esc(meta.description || '')}</p></div></details>`;
    h += `<details class="sxu-grp" open><summary>Contenu</summary>`;
    if (F.includes('eyebrow')) h += fText(FIELD_LABEL.eyebrow, 'content.eyebrow', c.eyebrow);
    if (F.includes('title')) h += fText(FIELD_LABEL.title, 'content.title', c.title);
    if (F.includes('subtitle')) h += fText(FIELD_LABEL.subtitle, 'content.subtitle', c.subtitle);
    if (F.includes('text')) h += fText(FIELD_LABEL.text, 'content.text', c.text, { long: true, rows: 5 });
    if (F.includes('image')) h += imgField(FIELD_LABEL.image, 'content.image', c.image, fText('Texte alternatif (accessibilité)', 'content.imageAlt', c.imageAlt));
    if (F.includes('image') && meta.supportsImagePos) h += `<div class="field"><label>Position de l'image</label><select class="sxu-input" data-p="style.imagePos"><option value="right" ${st.imagePos === 'right' ? 'selected' : ''}>À droite</option><option value="left" ${st.imagePos === 'left' ? 'selected' : ''}>À gauche</option></select></div>`;
    h += '</details>';
    if (F.includes('buttons')) {
      h += `<details class="sxu-grp" open><summary>Boutons et liens (${c.buttons.length}/4)</summary>${c.buttons.map((b, i) => `<div class="sxu-sub"><div class="sxu-subhead"><strong>Bouton ${i + 1}</strong><button type="button" class="btn btn-text" data-act="btn-del" data-i="${i}">Retirer</button></div>
        ${fText('Libellé', `content.buttons.${i}.label`, b.label)}${fText('Lien (https://…, #contact, mailto:…, tel:…)', `content.buttons.${i}.url`, b.url, { ph: 'https://' })}
        <div class="field"><label>Style</label><select class="sxu-input" data-p="content.buttons.${i}.style"><option value="primary" ${b.style === 'primary' ? 'selected' : ''}>Plein (principal)</option><option value="ghost" ${b.style === 'ghost' ? 'selected' : ''}>Contour (secondaire)</option></select></div></div>`).join('')}
        <button type="button" class="btn btn-light btn-sm" data-act="btn-add" ${c.buttons.length >= 4 ? 'disabled' : ''}>+ Ajouter un bouton</button></details>`;
    }
    if (meta.items) {
      const it = meta.items, n = c.items.length;
      h += `<details class="sxu-grp" open><summary>${esc(it.label || 'Éléments')} (${n})</summary>`;
      if (meta.columns) h += `<div class="field"><label>Colonnes (1 à 4)</label><select class="sxu-input" data-p="content.columns" data-t="n">${[1, 2, 3, 4].map((k) => `<option value="${k}" ${c.columns === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`;
      h += c.items.map((x, i) => `<div class="sxu-sub"><div class="sxu-subhead"><strong>${esc((it.label || 'Élément').replace(/s$/, ''))} ${i + 1}</strong><span><button type="button" class="btn btn-light btn-sm sxu-ibtn" data-act="it-up" data-i="${i}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-light btn-sm sxu-ibtn" data-act="it-down" data-i="${i}" aria-label="Descendre" ${i === n - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn btn-text" data-act="it-del" data-i="${i}" ${it.min != null && n <= it.min ? 'disabled' : ''}>Retirer</button></span></div>
        ${(it.fields || []).map((f) => f === 'image' ? imgField('Image', `content.items.${i}.image`, x.image, '') : f === 'rating' ? fNum('Note', `content.items.${i}.rating`, x.rating, 0, 5, 1) : fText(ITEM_LABEL[f] || f, `content.items.${i}.${f}`, x[f], { long: !!ITEM_LONG[f], rows: 3 })).join('')}</div>`).join('');
      h += `<button type="button" class="btn btn-light btn-sm" data-act="it-add" ${it.max != null && n >= it.max ? 'disabled' : ''}>+ Ajouter</button></details>`;
    }
    h += `<details class="sxu-grp"><summary>Mise en page et espacements</summary>
      <div class="field"><label>Alignement du texte</label><div class="sxu-seg sxu-seg-sm">${[['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']].map(([k, l]) => `<button type="button" class="sxu-segb" data-act="align" data-v="${k}" aria-pressed="${st.align === k}" aria-selected="${st.align === k}">${l}</button>`).join('')}</div></div>
      ${fNum('Espacement vertical (haut/bas)', 'style.padY', st.padY, 0, 240, 4)}${fNum('Marge horizontale', 'style.padX', st.padX, 0, 200, 4)}${fNum('Écart entre éléments', 'style.gap', st.gap, 0, 80, 2)}</details>
      <details class="sxu-grp"><summary>Couleurs et arrière-plan</summary>${fColor('Couleur de fond', 'style.bg', st.bg)}${fColor('Couleur du texte', 'style.color', st.color)}${fColor('Couleur d\'accent (boutons, détails)', 'style.accent', st.accent)}
      ${imgField('Image d\'arrière-plan', 'style.bgImage', st.bgImage, '')}${st.bgImage ? fNum('Voile sombre sur l\'image (%)', 'style.overlay', st.overlay, 0, 90, 5) : ''}</details>
      <details class="sxu-grp"><summary>Dimensions</summary>${fNum('Largeur maximale du contenu (px)', 'style.maxWidth', st.maxWidth, 320, 2000, 20)}${fNum('Hauteur minimale (px, 0 = automatique)', 'style.minHeight', st.minHeight, 0, 1200, 20)}${fNum('Arrondi des cartes et images (px)', 'style.radius', st.radius, 0, 48, 2)}</details>
      <details class="sxu-grp"><summary>Visibilité (responsive)</summary>
      <label class="sxu-check"><input type="checkbox" data-p="visibility.desktop" data-t="b" ${s.visibility.desktop ? 'checked' : ''}> Afficher sur ordinateur et tablette</label>
      <label class="sxu-check"><input type="checkbox" data-p="visibility.mobile" data-t="b" ${s.visibility.mobile ? 'checked' : ''}> Afficher sur téléphone</label></details>`;
    return h;
  }
  function codeControls(s) {
    const tab = ed.codeTab;
    return `<details class="sxu-grp" open><summary>Général</summary>${fText('Nom de la section (usage interne)', 'name', s.name)}</details>
      <details class="sxu-grp" open><summary>Code HTML / CSS</summary><p class="sxu-warn">⚠ <strong>JavaScript interdit.</strong> Les balises script, iframe, object, formulaires et les attributs « on… » sont supprimés ; le rendu se fait dans un cadre isolé sans exécution de script.</p>
      <div class="sxu-seg sxu-seg-sm" role="tablist"><button type="button" class="sxu-segb" role="tab" data-act="codetab" data-v="html" aria-selected="${tab === 'html'}">HTML</button><button type="button" class="sxu-segb" role="tab" data-act="codetab" data-v="css" aria-selected="${tab === 'css'}">CSS</button></div>
      <textarea class="sxu-code" spellcheck="false" data-p="code.${tab}" aria-label="Code ${tab.toUpperCase()}" rows="16">${esc(s.code[tab])}</textarea>
      ${fNum('Hauteur fixe (px, 0 = automatique)', 'code.height', s.code.height, 0, 3000, 20)}</details>
      <details class="sxu-grp"><summary>Visibilité (responsive)</summary>
      <label class="sxu-check"><input type="checkbox" data-p="visibility.desktop" data-t="b" ${s.visibility.desktop ? 'checked' : ''}> Afficher sur ordinateur et tablette</label>
      <label class="sxu-check"><input type="checkbox" data-p="visibility.mobile" data-t="b" ${s.visibility.mobile ? 'checked' : ''}> Afficher sur téléphone</label></details>`;
  }

  function updatePreview() {
    const host = $('#sxPrev'); if (!host || !ed) return;
    host.innerHTML = '';
    try { host.appendChild(Sections221.render(norm(clone(ed.sec)), { preview: true })); } catch (e) { host.textContent = 'Aperçu indisponible : ' + e.message; }
    const n = $('#sxPrevNote'); const v = ed.sec.visibility;
    if (n) n.textContent = (ed.device === 'mobile' && !v.mobile) ? 'Cette section est masquée sur téléphone (aperçu à titre indicatif).' : (ed.device !== 'mobile' && !v.desktop) ? 'Cette section est masquée sur ordinateur et tablette (aperçu à titre indicatif).' : 'L\'aperçu reprend exactement le rendu du site public.';
  }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 120); }

  function editorInput(t) {
    if (t.matches('[data-place]')) { ed.place = t.value; return; }
    const p = t.dataset.p; if (!p) return;
    let v = t.value;
    if (t.dataset.t === 'n') v = parseInt(v, 10) || 0;
    if (t.dataset.t === 'b') v = t.checked;
    setP(ed.sec, p, v);
    const out = t.closest('.field') && t.closest('.field').querySelector('output'); if (out) out.textContent = v;
    if (t.type === 'color') { const sp = t.closest('.sxu-colrow').querySelector('span'); if (sp) sp.textContent = v; }
    if (t.dataset.rerender) { reshapeForVariant(); return; }
    schedulePreview();
  }
  function reshapeForVariant() {
    const meta = V()[ed.sec.variant] || {};
    if (meta.items && !ed.sec.content.items.length) ed.sec.content.items = [1, 2, 3].map((n) => ({ icon: '✦', title: 'Élément ' + n, text: 'Décrivez cet élément.', value: '', label: '', url: '', sub: '', rating: 0, image: '' }));
    keepScroll(renderEditor);
  }
  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  async function editorClick(act, b) {
    if (!ed) return;
    const s = ed.sec;
    switch (act) {
      case 'ed-cancel': {
        if (JSON.stringify(norm(ed.sec)) !== JSON.stringify(norm(ed.orig)) && !(await confirmAction({ title: 'Quitter sans enregistrer ?', text: 'Les modifications de cette section ne sont pas enregistrées.', yes: 'Quitter sans enregistrer' }))) return;
        return closeEditor();
      }
      case 'dev': ed.device = b.dataset.v; root.querySelectorAll('[data-act=dev]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); $('#sxPrev').className = 'sxu-frame is-' + ed.device; return updatePreview();
      case 'codetab': ed.codeTab = b.dataset.v; return keepScroll(renderEditor);
      case 'align': s.style.align = b.dataset.v; root.querySelectorAll('[data-act=align]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-selected', String(x === b)); }); return updatePreview();
      case 'clr': setP(s, b.dataset.p, ''); return keepScroll(renderEditor);
      case 'img': {
        const p = b.dataset.p;
        try { const f = await pickFile(); if (!f) return; const big = /bgImage|content\.image$/.test(p); const r = await readImage(f, big ? 1800 : 900, big ? 1400 : 700); setP(s, p, r.src); keepScroll(renderEditor); }
        catch (e) { toast(e.message, true); }
        return;
      }
      case 'imgdel': setP(s, b.dataset.p, ''); return keepScroll(renderEditor);
      case 'btn-add': if (s.content.buttons.length < 4) s.content.buttons.push({ label: 'En savoir plus', url: '', style: s.content.buttons.length ? 'ghost' : 'primary' }); return keepScroll(renderEditor);
      case 'btn-del': s.content.buttons.splice(+b.dataset.i, 1); return keepScroll(renderEditor);
      case 'it-add': s.content.items.push({ icon: '✦', title: 'Nouvel élément', text: '', value: '', label: '', url: '', sub: '', rating: 0, image: '' }); return keepScroll(renderEditor);
      case 'it-del': s.content.items.splice(+b.dataset.i, 1); return keepScroll(renderEditor);
      case 'it-up': case 'it-down': { const i = +b.dataset.i, j = i + (act === 'it-up' ? -1 : 1); const a = s.content.items; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; return keepScroll(renderEditor); }
      case 'save': return saveEditor(b.dataset.dest);
    }
  }

  /* Envoie les images importées (data URI) au service de médias : jamais de data URI dans les sections enregistrées ni dans l'historique */
  async function uploadImages(s) {
    const cache = new Map();
    async function up(v) {
      if (typeof v !== 'string' || !v.startsWith('data:image/')) return v;
      if (cache.has(v)) return cache.get(v);
      const blob = await (await fetch(v)).blob();
      const j = await Store221.api('admin/media', { method: 'POST', body: blob, raw: true, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
      cache.set(v, j.url); return j.url;
    }
    s.content.image = await up(s.content.image); s.style.bgImage = await up(s.style.bgImage);
    for (const i of s.content.items) i.image = await up(i.image);
  }
  const URL_OK = /^(https?:\/\/|\/api\/media\/|mailto:|tel:|#|\/[^\/])/i;
  function validateEditor(s, dest) {
    if (!String(s.name).trim()) return 'Donnez un nom à cette section (usage interne).';
    if (s.kind === 'code') { if (!s.code.html.trim()) return 'Le code HTML est vide.'; return ''; }
    const c = s.content;
    if (!(c.title.trim() || c.text.trim() || c.image || c.items.length)) return 'La section est vide : ajoutez un titre, un texte, une image ou des éléments.';
    for (const b of c.buttons) { if (!b.label.trim()) return 'Un bouton n\'a pas de libellé.'; if (b.url && !URL_OK.test(b.url)) return 'Le lien « ' + b.url + ' » est invalide (utilisez https://…, #ancre, mailto: ou tel:).'; }
    for (const i of c.items) if (i.url && !URL_OK.test(i.url)) return 'Le lien « ' + i.url + ' » est invalide.';
    return '';
  }
  async function saveEditor(dest) {
    if (ro() || busyUI) return;
    const s = clone(ed.sec); const err = validateEditor(s, dest);
    if (err) { ed.err = err; keepScroll(renderEditor); window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 80 }); return; }
    const prev = byId(s.id), wasPub = prev && prev.status === 'published';
    if (wasPub && dest !== 'published' && !(await confirmAction({ title: 'Retirer cette section du site ?', text: 'En l\'enregistrant ' + (dest === 'draft' ? 'comme brouillon' : 'dans la bibliothèque') + ', elle ne sera plus visible par les visiteurs.', what: secLabel(s), yes: 'Retirer du site' }))) return;
    if (wasPub && dest === 'published' && !(await confirmAction({ title: 'Mettre à jour la section publiée ?', text: 'Les visiteurs verront cette nouvelle version dès l\'enregistrement.', what: secLabel(s), yes: 'Mettre à jour' }))) return;
    busyUI = true; ed.err = '';
    try {
      await uploadImages(s);
      s.status = dest === 'published' ? 'published' : dest === 'library' ? 'library' : 'draft';
      s.updatedAt = Date.now(); if (dest === 'published' && !(prev && prev.publishedAt)) s.publishedAt = Date.now(); else if (prev) s.publishedAt = prev.publishedAt;
      const label = dest === 'published' ? 'Publié' : dest === 'library' ? 'Bibliothèque' : 'Brouillon';
      const ok = await writeSection(norm(s), { label, place: ed.place });
      if (ok) { toast(dest === 'published' ? 'Section publiée sur le site.' : dest === 'library' ? 'Section enregistrée dans la bibliothèque (non visible sur le site).' : 'Brouillon enregistré.'); ed = null; ui.view = dest === 'published' ? 'positions' : 'library'; ui.libTab = 'mine'; ui.filter = 'all'; render(); }
    } catch (e) { ed.err = e.message || 'Échec de l\'enregistrement'; keepScroll(renderEditor); toast(ed.err, true); }
    finally { busyUI = false; }
  }

  return { init, render };
})();
