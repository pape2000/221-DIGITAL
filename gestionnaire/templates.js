/* ==========================================================================
   221 DIGITAL — Bibliothèque de modèles de sections
   window.SectionTemplates221 = [{ id, name, description, variant, make(defaults) → section complète }]
   Chaque modèle produit une section conforme à schema.js, entièrement modifiable depuis le gestionnaire.
   ========================================================================== */
(function () {
  'use strict';
  const uid = () => 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const it = (o) => Object.assign({ icon: '', title: '', text: '', image: '', value: '', label: '', url: '', sub: '', rating: 0 }, o);
  const btn = (label, url, style) => ({ label, url, style: style || 'primary' });

  function build(t, d) {
    d = d || {};
    const style = Object.assign({ align: 'left', bg: '', color: '', accent: '', bgImage: '', overlay: 0, padY: d.padY || 72, padX: 0, gap: 24, maxWidth: 1180, minHeight: 0, radius: 16, imagePos: 'right' }, t.style || {});
    if (d.align && !(t.style && t.style.align)) style.align = d.align;
    return {
      id: uid(), name: t.name, kind: t.kind || 'blocks', variant: t.variant, status: 'draft', template: t.id,
      content: Object.assign({ eyebrow: '', title: '', subtitle: '', text: '', image: '', imageAlt: '', buttons: [], columns: 3, items: [] }, t.content || {}),
      style, visibility: { desktop: true, mobile: true },
      code: Object.assign({ html: '', css: '', height: 0 }, t.code || {}), history: [], updatedAt: 0, publishedAt: 0,
    };
  }

  const T = [
    { id: 'hero', name: 'Hero / présentation principale', description: 'Grand bandeau d’accueil sombre avec titre, sous-titre et deux boutons.', variant: 'hero',
      style: { align: 'center', padY: 120, minHeight: 480, overlay: 0 },
      content: { eyebrow: 'Agence digitale · Dakar', title: 'Vos ambitions prennent vie dans le digital', subtitle: 'Sites web, e-commerce, intelligence artificielle et branding : nous construisons des expériences qui font grandir votre activité.', buttons: [btn('Démarrer un projet', '#contact'), btn('Voir nos réalisations', '#projets', 'ghost')] } },
    { id: 'about', name: 'À propos', description: 'Image et texte côte à côte avec points clés.', variant: 'about',
      content: { eyebrow: 'Qui sommes-nous', title: 'Une équipe sénégalaise, une exigence internationale', text: '221 Digital accompagne les entreprises, les marques et les entrepreneurs dans leur transformation numérique.\n\nDe la stratégie à la mise en ligne, nous restons à vos côtés pour livrer des produits soignés, rapides et pensés pour convertir.', buttons: [btn('Parler à l’équipe', '#contact')], items: [it({ title: 'Conception 100 % sur mesure' }), it({ title: 'Livraison dans les délais annoncés' }), it({ title: 'Suivi et assistance après la mise en ligne' })] } },
    { id: 'services', name: 'Services', description: 'Cartes de services avec icône, description et lien.', variant: 'services',
      content: { eyebrow: 'Nos services', title: 'Tout ce qu’il faut pour réussir en ligne', subtitle: 'Des solutions complètes, de la conception à la croissance.', columns: 3, items: [
        it({ icon: 'globe', title: 'Sites web', text: 'Sites vitrines et institutionnels rapides, élégants et optimisés pour le référencement.', url: '#contact' }),
        it({ icon: 'cart', title: 'E-commerce', text: 'Boutiques en ligne avec paiement mobile et gestion simple des commandes.', url: '#contact' }),
        it({ icon: 'brain', title: 'Intelligence artificielle', text: 'Assistants, automatisations et outils qui font gagner du temps à vos équipes.', url: '#contact' }),
        it({ icon: 'palette', title: 'Branding', text: 'Identité visuelle, logo et univers de marque cohérents sur tous vos supports.', url: '#contact' }),
        it({ icon: 'chart', title: 'Marketing digital', text: 'Stratégie, contenus et campagnes pour attirer et fidéliser vos clients.', url: '#contact' }),
        it({ icon: 'shield', title: 'Maintenance', text: 'Hébergement, sécurité et évolutions pour un site toujours à jour.', url: '#contact' })] } },
    { id: 'advantages', name: 'Nos avantages', description: 'Liste numérotée d’atouts sur fond sombre.', variant: 'advantages',
      content: { eyebrow: 'Pourquoi nous choisir', title: 'Ce qui fait la différence', items: [
        it({ icon: 'bolt', title: 'Rapidité', text: 'Un premier aperçu en quelques jours, une mise en ligne sans longueurs.' }),
        it({ icon: 'target', title: 'Résultats mesurables', text: 'Chaque décision est guidée par vos objectifs et vos chiffres.' }),
        it({ icon: 'users', title: 'Accompagnement humain', text: 'Un interlocuteur dédié qui comprend votre métier.' }),
        it({ icon: 'shield', title: 'Qualité et sécurité', text: 'Code propre, sites protégés et sauvegardés.' })] } },
    { id: 'stats', name: 'Statistiques', description: 'Chiffres clés en grand, séparés par des filets.', variant: 'stats',
      style: { align: 'center' },
      content: { eyebrow: 'En chiffres', title: 'Une expérience qui parle d’elle-même', columns: 4, items: [
        it({ value: '50+', label: 'Projets livrés', text: 'Sites, boutiques et applications' }),
        it({ value: '30+', label: 'Clients accompagnés', text: 'Au Sénégal et à l’international' }),
        it({ value: '98 %', label: 'Clients satisfaits', text: 'Recommandent 221 Digital' }),
        it({ value: '24 h', label: 'Temps de réponse', text: 'Pour chaque demande' })] } },
    { id: 'portfolio', name: 'Portfolio', description: 'Grille de réalisations avec catégorie et lien.', variant: 'portfolio',
      content: { eyebrow: 'Réalisations', title: 'Quelques projets dont nous sommes fiers', columns: 3, buttons: [btn('Voir tous les projets', '#projets', 'ghost')], items: [
        it({ title: 'Boutique en ligne', sub: 'E-commerce', url: '#projets' }), it({ title: 'Site institutionnel', sub: 'Site web', url: '#projets' }), it({ title: 'Identité de marque', sub: 'Branding', url: '#projets' })] } },
    { id: 'clients', name: 'Clients et partenaires', description: 'Grille de logos ou de noms de clients et partenaires.', variant: 'clients',
      style: { align: 'center' },
      content: { eyebrow: 'Ils nous font confiance', title: 'Clients et partenaires', columns: 4, items: [it({ title: 'Client 1' }), it({ title: 'Client 2' }), it({ title: 'Client 3' }), it({ title: 'Client 4' }), it({ title: 'Partenaire 1' }), it({ title: 'Partenaire 2' }), it({ title: 'Partenaire 3' }), it({ title: 'Partenaire 4' })] } },
    { id: 'testimonials', name: 'Témoignages', description: 'Cartes d’avis clients avec étoiles.', variant: 'testimonials',
      content: { eyebrow: 'Témoignages', title: 'Ce que disent nos clients', columns: 3, items: [
        it({ text: 'Une équipe réactive et professionnelle. Notre site a transformé la façon dont nos clients nous trouvent.', title: 'Awa Diop', sub: 'Directrice, Maison Téranga', rating: 5 }),
        it({ text: 'Livraison dans les délais et résultat au-delà de nos attentes. Je recommande sans hésiter.', title: 'Moussa Ndiaye', sub: 'Fondateur, Dakar Logistics', rating: 5 }),
        it({ text: 'Notre boutique en ligne tourne parfaitement, les ventes ont doublé en trois mois.', title: 'Fatou Sow', sub: 'Gérante, Éclat Beauté', rating: 5 })] } },
    { id: 'faq', name: 'FAQ', description: 'Questions fréquentes en accordéon.', variant: 'faq',
      content: { eyebrow: 'FAQ', title: 'Vos questions, nos réponses', items: [
        it({ title: 'Combien de temps pour créer mon site ?', text: 'Un site vitrine prend en général 2 à 4 semaines, selon le nombre de pages et la rapidité des validations.' }),
        it({ title: 'Quels moyens de paiement acceptez-vous ?', text: 'Virement, Wave, Orange Money et paiement en plusieurs fois selon le projet.' }),
        it({ title: 'Puis-je modifier mon site moi-même ?', text: 'Oui : vous disposez d’un espace de gestion simple pour mettre à jour vos contenus sans compétence technique.' }),
        it({ title: 'Proposez-vous la maintenance ?', text: 'Oui, nous assurons hébergement, sécurité, sauvegardes et évolutions.' })] } },
    { id: 'cta', name: 'Contact / appel à l’action', description: 'Bandeau d’invitation avec deux boutons.', variant: 'cta',
      style: { align: 'center', padY: 88 },
      content: { eyebrow: 'Prêt à démarrer ?', title: 'Parlons de votre projet', subtitle: 'Réponse sous 24 heures, devis gratuit et sans engagement.', buttons: [btn('Démarrer un projet', '#contact'), btn('Nous écrire', 'mailto:contact@221.digital', 'ghost')] } },
    { id: 'process', name: 'Méthode / étapes', description: 'Étapes numérotées reliées entre elles.', variant: 'process',
      content: { eyebrow: 'Notre méthode', title: 'De l’idée à la mise en ligne', items: [
        it({ title: 'Écoute', text: 'Nous cadrons vos objectifs, votre cible et votre budget.' }), it({ title: 'Conception', text: 'Maquettes et validation avant la moindre ligne de code.' }),
        it({ title: 'Développement', text: 'Construction du site avec points d’étape réguliers.' }), it({ title: 'Lancement', text: 'Mise en ligne, formation et suivi.' })] } },
    { id: 'team', name: 'Équipe', description: 'Portraits (ou initiales) avec nom et rôle.', variant: 'team',
      content: { eyebrow: 'L’équipe', title: 'Les personnes derrière vos projets', columns: 3, items: [
        it({ title: 'Prénom Nom', sub: 'Fondateur · Stratégie', text: 'Présentation courte de la personne.' }), it({ title: 'Prénom Nom', sub: 'Développement', text: 'Présentation courte de la personne.' }), it({ title: 'Prénom Nom', sub: 'Design', text: 'Présentation courte de la personne.' })] } },
    { id: 'pricing', name: 'Tarifs', description: 'Offres avec prix et liste d’avantages.', variant: 'pricing',
      content: { eyebrow: 'Tarifs', title: 'Des offres claires', columns: 3, items: [
        it({ title: 'Essentiel', value: '350 000', label: 'FCFA', text: 'Site vitrine 5 pages\nDesign responsive\nFormulaire de contact', url: '#contact' }),
        it({ title: 'Business', value: '750 000', label: 'FCFA', text: 'Site jusqu’à 10 pages\nRéférencement de base\nEspace de gestion\nFormation incluse', url: '#contact', sub: 'Recommandé' }),
        it({ title: 'Sur mesure', value: 'Devis', label: '', text: 'E-commerce ou application\nFonctionnalités spécifiques\nAccompagnement dédié', url: '#contact' })] } },
    { id: 'gallery', name: 'Galerie', description: 'Mosaïque d’images avec légende (ajoutez vos photos).', variant: 'gallery',
      content: { eyebrow: 'Galerie', title: 'En images', columns: 3, items: [it({ title: 'Image 1' }), it({ title: 'Image 2' }), it({ title: 'Image 3' })] } },
    { id: 'text', name: 'Texte libre', description: 'Bloc de texte centré pour un message ou un article.', variant: 'text',
      style: { align: 'center', maxWidth: 780 },
      content: { eyebrow: 'Annonce', title: 'Un message important', text: 'Rédigez ici votre texte. Séparez les paragraphes par une ligne vide.', buttons: [btn('En savoir plus', '#contact', 'ghost')] } },
    { id: 'contact', name: 'Coordonnées', description: 'Invitation et cartes de contact (e-mail, téléphone, adresse).', variant: 'contact',
      content: { eyebrow: 'Contact', title: 'Restons en contact', text: 'Une question, un projet ? Écrivez-nous ou appelez-nous, nous vous répondons rapidement.', buttons: [btn('Démarrer un projet', '#contact')], items: [
        it({ icon: 'mail', title: 'E-mail', text: 'contact@221.digital', url: 'mailto:contact@221.digital' }), it({ icon: 'phone', title: 'Téléphone', text: '+221 00 000 00 00', url: 'tel:+221000000000' }), it({ icon: 'pin', title: 'Adresse', text: 'Dakar, Sénégal' })] } },
    /* ---- modèles « code » (HTML + CSS isolés, sans script) ---- */
    { id: 'code-banner', name: 'Bandeau annonce (code)', description: 'Bandeau d’annonce en HTML/CSS personnalisable.', variant: 'text', kind: 'code', style: { padY: 0 },
      code: { height: 0, html: '<div class="bn"><span class="tag">Nouveau</span><p>Offre de lancement : <strong>-20 %</strong> sur votre site web jusqu’à la fin du mois.</p><a href="#contact">J’en profite</a></div>',
        css: 'body{margin:0;font-family:system-ui,sans-serif}.bn{display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;padding:18px 24px;background:linear-gradient(90deg,#142C6E,#2F6BFF);color:#fff}.bn p{margin:0;font-size:16px}.tag{background:#2BC4EC;color:#0A1020;font-weight:700;padding:4px 10px;border-radius:99px;font-size:12px;text-transform:uppercase}.bn a{background:#fff;color:#142C6E;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:99px}' } },
    { id: 'code-cards', name: 'Trois blocs (code)', description: 'Trois blocs de présentation en HTML/CSS personnalisable.', variant: 'text', kind: 'code', style: { padY: 40 },
      code: { height: 0, html: '<section class="w"><h2>Pourquoi 221 Digital ?</h2><div class="g"><div class="c"><b>1</b><h3>Sur mesure</h3><p>Chaque projet est conçu pour vous.</p></div><div class="c"><b>2</b><h3>Rapide</h3><p>Des délais courts et tenus.</p></div><div class="c"><b>3</b><h3>Accompagné</h3><p>Un suivi après la mise en ligne.</p></div></div></section>',
        css: 'body{margin:0;font-family:system-ui,sans-serif;color:#0E1628}.w{max-width:1100px;margin:0 auto;padding:24px}h2{font-size:32px;text-align:center;margin:0 0 28px}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}.c{border:1px solid #E1E6F0;border-radius:16px;padding:24px;background:#fff}.c b{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#2F6BFF;color:#fff}.c h3{margin:14px 0 6px}.c p{margin:0;color:#5B6780}' } },
  ];

  window.SectionTemplates221 = T.map((t) => ({ id: t.id, name: t.name, description: t.description, variant: t.variant, kind: t.kind || 'blocks', make: (d) => build(t, d) }));
})();
