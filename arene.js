/* Stream RPG — page Arène : draft façon Hearthstone. Animations des coffres : GSAP (gsap.min.js, chargé par arene.html). Tout le monde part d'une coquille sans objet ni point de stat et
   drafte son build en 30 tours (le serveur tire 5 cartes à chaque tour), puis enchaîne les combats : 10 victoires avant 3 défaites.
   En fin de parcours, des coffres de récompense à ouvrir un par un. Tes objets et tes stats ne comptent pas. */
"use strict";
(function () {
const { el, icone, fmt, RARETES } = App;
const COLS = App.ARENE_COLS, STATS = App.ARENE_STATS;   // [clé, abrégé, nom, valeur de base, valeur d'un point]
const LIB = Object.fromEntries(COLS);
const pluriel = (n, mot, mots) => fmt(n) + " " + (n > 1 ? mots || mot + "s" : mot);
const niveauDe = (o, n) => Math.min(n, App.niveauMax(o.rarete));

// Puissance d'un build drafté (même calcul que partout sur le site).
function puissanceKit(kit) {
  const eq = kit.equipement || {}, s = kit.stacks || {};
  const r = App.puissance({ atk_stacks: s.atk, def_stacks: s.def, pv_stacks: s.pv, spd_stacks: s.spd, luck_stacks: s.luck },
    new Map(COLS.map(([c]) => eq[c]).filter(Boolean).map((x) => [x.numero, x.niveau])), Object.fromEntries(COLS.map(([c]) => [c, eq[c] ? eq[c].numero : null])));
  return r ? Math.round(r.powerLevel) : 0;
}
App.puissanceKitArene = puissanceKit;

// Un build : les 4 emplacements (au niveau du draft) et les points de stats.
function vueKit(kit) {
  const eq = kit.equipement || {};
  return [
    el("div", { class: "lg-build" }, COLS.map(([c, lib]) => {
      const x = eq[c], o = x ? App.objet(x.numero) : null;
      return o ? App.carte(o, { niveau: niveauDe(o, x.niveau), equipe: false })
        : el("div", { class: "case-vide" }, el("span", { texte: lib }), el("small", { texte: c === "offhand" && App.deuxMains((eq.arme || {}).numero) ? "Deux mains" : "Vide" }));
    })),
    el("ul", { class: "ar-stats", "aria-label": "Points de stats du build" }, STATS.map(([k, lib, nom, , pas]) =>
      el("li", { title: nom }, el("b", { class: "num", texte: "+" + fmt(((kit.stacks || {})[k] || 0) * pas) }), el("span", { texte: lib })))),
  ];
}
App.vueKitArene = vueKit;

// Coffre de récompense (dessin distinct des lootbox) : le couvercle se soulève à l'ouverture.
const COFFRET = '<svg viewBox="0 0 120 112" aria-hidden="true" focusable="false">' +
  '<ellipse class="cf-ombre" cx="60" cy="103" rx="42" ry="6"/>' +
  '<g class="cf-corps"><rect x="15" y="52" width="90" height="46" rx="7"/><rect class="cf-metal" x="15" y="68" width="90" height="7"/>' +
  '<rect class="cf-metal" x="27" y="52" width="8" height="46"/><rect class="cf-metal" x="85" y="52" width="8" height="46"/></g>' +
  '<g class="cf-couvercle"><path d="M13 55 Q13 22 60 20 Q107 22 107 55 Z"/><path class="cf-metal" d="M27 55 Q27 27 35 24 L43 22.6 Q35 26 35 55 Z"/>' +
  '<path class="cf-metal" d="M93 55 Q93 27 85 24 L77 22.6 Q85 26 85 55 Z"/><rect class="cf-metal" x="13" y="50" width="94" height="6" rx="2"/></g>' +
  '<path class="cf-gemme" d="M60 46 L69 57 L60 68 L51 57 Z"/></svg>';
const BUTINS = {
  medailles: (v) => ["i-medaille", "+" + pluriel(v, "médaille")],
  lootbox: (v) => ["i-coffre-ligne", "+" + fmt(v) + " lootbox"],
  lootbox_legendaire: (v) => ["i-etoile", "+" + pluriel(v, "lootbox légendaire", "lootbox légendaires")],
  ticket_arene: (v) => ["i-ticket", "+" + pluriel(v, "ticket d'arène", "tickets d'arène")],
};
const butin = (c) => (BUTINS[c.type] || ((v) => ["i-coche", "+" + fmt(v)]))(c.valeur);

App.demarrer("arene", async (main, ctx) => {
  const zone = el("div", {}, el("div", { class: "chargement", texte: "Chargement de l'Arène…" }));
  const annonce = el("p", { class: "sr", "aria-live": "polite" });
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Arène" }),
      el("p", { texte: "Ici, tes objets et tes stats ne comptent pas. Tout le monde part de zéro et drafte son build, carte après carte : à toi de faire les bons choix." }))),
    zone, annonce);
  const lireHisto = () => App.api.areneHistorique(ctx.joueur.id).catch((e) => { console.warn(e); return []; });
  let [etat, histo] = await Promise.all([App.api.arene(), lireHisto()]), occupe = false;

  const viser = () => { const t = zone.querySelector("h2"); if (t) t.focus(); };
  const palierAtteint = () => [...etat.paliers].reverse().find((p) => etat.victoires >= p.victoires) || null;
  const pips = (n, max, cls, paliers) => el("span", { class: "ar-pips " + cls, role: "img", "aria-label": `${n} sur ${max}` },
    Array.from({ length: max }, (_, i) => el("i", { class: (i < n ? "plein" : "") + (paliers && paliers.includes(i + 1) ? " palier" : "") })));
  const score = () => el("div", { class: "ar-score" },
    el("div", {}, el("span", { texte: "Victoires" }), el("b", { class: "num", texte: `${fmt(etat.victoires)} / ${fmt(etat.max_victoires)}` }), pips(etat.victoires, etat.max_victoires, "v", etat.paliers.map((p) => p.victoires))),
    el("div", {}, el("span", { texte: "Défaites" }), el("b", { class: "num", texte: `${fmt(etat.defaites)} / ${fmt(etat.max_defaites)}` }), pips(etat.defaites, etat.max_defaites, "d")),
    el("div", {}, el("span", { texte: "Ton record" }), el("b", { class: "num", texte: pluriel(etat.record, "victoire") })));
  // Les paliers : le plus haut atteint donne ses coffres (ils ne se cumulent pas).
  function blocPaliers(joue) {
    const atteint = joue ? palierAtteint() : null;
    return el("ol", { class: "ar-paliers", "aria-label": "Récompenses du parcours" }, etat.paliers.map((p) => el("li", { class: atteint === p ? "atteint" : joue && etat.victoires >= p.victoires ? "passe" : "" },
      el("b", { class: "num", texte: pluriel(p.victoires, "victoire") }),
      el("span", { class: "ar-palier-coffres" }, pluriel(p.coffres + p.lootbox_legendaire, "coffre"), p.tickets ? " + ticket" : ""),
      el("small", {}, `Par coffre : 1 lootbox ou ${fmt(p.medailles_min)} à ${fmt(p.medailles_max)} médailles.`,
        p.lootbox_legendaire ? ` Dont ${pluriel(p.lootbox_legendaire, "coffre légendaire assuré", "coffres légendaires assurés")}.` : "",
        p.tickets ? ` ${pluriel(p.tickets, "ticket")} d'arène rendu${p.tickets > 1 ? "s" : ""}.` : ""))));
  }
  const blocBuild = (titre, sous) => el("section", { class: "section-page", "aria-labelledby": "t-kit" },
    el("div", { class: "ar-build-tete" }, el("div", {}, el("h2", { id: "t-kit", texte: titre }), sous ? el("p", { class: "sous", texte: sous }) : null),
      el("span", { class: "ar-puissance" }, el("b", { class: "num", texte: fmt(puissanceKit(etat.kit)) }), " de puissance")),
    el("div", { class: "ar-monkit" }, vueKit(etat.kit)));
  const note = () => el("p", { class: "mention ar-note", texte: "Les combats d'arène ne touchent ni ton bilan, ni ta ligue, ni tes objets." });

  async function commencer(b) {
    b.disabled = true;
    try { etat = await App.rpc("arene_commencer"); rendre(); viser(); }
    catch (e) { App.erreur(e); b.disabled = false; }
  }
  const boutonEntree = (fini) => etat.peut_commencer
    ? el("button", { type: "button", class: "btn-principal", onclick: (e) => commencer(e.currentTarget) }, icone(etat.entree === "ticket" ? "i-ticket" : "i-epees"),
      etat.entree === "ticket" ? `Utiliser un ticket d'arène (${fmt(etat.tickets)})` : fini ? "Nouveau draft" : "Commencer le draft")
    : el("button", { type: "button", class: "btn-principal", "aria-disabled": "true", onclick: () => App.toast("Tu as fait ton parcours du jour : l'Arène rouvre demain.", { titre: "À demain" }) }, icone("i-epees"), "Reviens demain");

  // ------------------------------------------------------------------ Draft
  const valeurStat = (k, pts) => { const s = STATS.find((x) => x[0] === k); return s[3] + pts * s[4]; };
  // Rareté d'une carte : celle de l'objet, ou celle tirée pour la carte de stat (elle fixe ses points). Elle donne la couleur et le son.
  const rareteDe = (x) => (x.type === "stat" ? x.rarete : (App.objet(x.numero) || {}).rarete) || "commun";
  function carteOffre(x, i) {
    const o = x.numero ? App.objet(x.numero) : null, rar = rareteDe(x);
    const avant = x.emplacement ? ((etat.kit.equipement || {})[x.emplacement] || {}).niveau || 0 : 0;   // niveau de l'objet en place
    let genre, visuel, titre, detail;
    if (x.type === "stat") {
      const s = STATS.find((y) => y[0] === x.stat), pts = (etat.kit.stacks || {})[x.stat] || 0;
      genre = "Stat"; titre = "+" + fmt(x.points * s[4]) + " " + s[2] + " (" + RARETES[rar].nom + ")";
      visuel = el("div", { class: "ar-carte-stat" }, el("i", { class: "ar-stat-rarete", texte: RARETES[rar].nom }), el("b", { class: "num", texte: "+" + fmt(x.points * s[4]) }), el("span", { texte: s[2] }));
      detail = `${s[2]} de base : ${fmt(valeurStat(x.stat, pts))} → ${fmt(valeurStat(x.stat, pts + x.points))}`;
    } else {
      if (!o) return null;
      visuel = App.carte(o, { niveau: niveauDe(o, x.niveau), equipe: false });
      titre = o.nom;
      if (x.type === "objet") { genre = LIB[x.emplacement]; detail = RARETES[o.rarete].nom + (App.deuxMains(o.numero) ? " · à deux mains" : ""); }
      else if (x.type === "amelioration") { genre = "Amélioration +" + fmt(x.niveau - avant); detail = `${LIB[x.emplacement]} : +${fmt(avant)} → +${fmt(x.niveau)}`; }
      else { const a = App.objet(x.remplace); genre = "Remplacement"; detail = `À la place de ${a ? a.nom : "ton objet"}` + (!avant ? "" : x.niveau === avant ? `, garde son +${fmt(avant)}` : ` : son +${fmt(avant)} devient +${fmt(x.niveau)}`); }
    }
    return el("li", { class: "ar-offre-case", style: { "--i": i } },
      el("button", { type: "button", class: "ar-offre " + x.type + " " + rar, "aria-label": `${genre} : ${titre}. ${detail}` + (x.perd_offhand ? ". Arme à deux mains : ta main gauche est retirée." : ""), onclick: (e) => prendre(i, e.currentTarget) },
        el("span", { class: "ar-offre-genre", texte: genre }), visuel, el("small", { texte: detail }),
        x.perd_offhand ? el("small", { class: "ar-alerte" }, icone("i-alerte"), "Deux mains : ta main gauche est retirée") : null),
      o ? el("button", { type: "button", class: "lien ar-fiche", onclick: () => App.tiroir({ titre: o.nom, contenu: App.fiche(o, { niveau: niveauDe(o, x.niveau), possede: null }) }) }, "Voir la fiche") : null);
  }
  // Où va une carte dans « Ton build » : la case de son emplacement, ou celle de sa stat.
  const cibleBuild = (x) => zone.querySelector(x.type === "stat" ? `.ar-monkit .ar-stats > :nth-child(${STATS.findIndex((s) => s[0] === x.stat) + 1})`
    : `.ar-monkit .lg-build > :nth-child(${COLS.findIndex((c) => c[0] === x.emplacement) + 1})`);
  // La carte choisie se soulève puis s'envole vers sa place dans le build, pendant que le serveur enregistre le choix (GSAP ; rien si les effets sont réduits).
  function envol(x, bouton) {
    const G = window.gsap, visuel = bouton && bouton.querySelector(".carte, .ar-carte-stat"), cible = cibleBuild(x);
    if (!G || App.reduit || !visuel || !cible) return Promise.resolve();
    const a = visuel.getBoundingClientRect(), b = cible.getBoundingClientRect(), vol = visuel.cloneNode(true);
    vol.classList.add("ar-vol");
    Object.assign(vol.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
    vol.style.setProperty("--c", getComputedStyle(visuel).getPropertyValue("--c"));
    document.body.append(vol); visuel.style.visibility = "hidden";
    return new Promise((fin) => G.timeline({ onComplete: () => { vol.remove(); fin(); } })
      .to(vol, { scale: 1.1, y: -16, duration: 0.14, ease: "power2.out" })
      .to(vol, { x: b.left + b.width / 2 - a.left - a.width / 2, y: b.top + b.height / 2 - a.top - a.height / 2, scale: Math.min(1, b.width / a.width), rotation: x.type === "stat" ? 0 : 4, duration: 0.42, ease: "power3.in" })
      .to(vol, { autoAlpha: 0, duration: 0.1 }, ">-0.1"));
  }
  // À l'arrivée, la case du build encaisse la carte : elle gonfle et brille un instant.
  function impact(x) {
    const G = window.gsap, c = cibleBuild(x);
    if (G && !App.reduit && c) G.fromTo(c, { scale: 1.18, filter: "brightness(1.8)" }, { scale: 1, filter: "brightness(1)", duration: 0.5, ease: "back.out(2.5)", clearProps: "transform,filter" });
  }
  async function prendre(i, bouton) {
    if (occupe) return;
    occupe = true; zone.classList.add("ar-attente");
    const x = etat.offres[i];
    App.sons.demarrer(); App.sons.arene("carte-" + rareteDe(x));
    try {
      [etat] = await Promise.all([App.rpc("arene_drafter", { p_index: i }), envol(x, bouton)]);
      if (etat.etat === "en_cours") histo = await lireHisto();   // le build tout juste drafté entre dans l'historique
      rendre(); viser(); impact(x);
      if (etat.etat === "en_cours") { annonce.textContent = "Draft terminé : ton build est prêt."; App.sons.arene("draft-fini"); }
    } catch (e) { App.erreur(e); rendre(); }
    occupe = false; zone.classList.remove("ar-attente");
  }
  function ecranDraft() {
    const o = etat.offres || [], vides = o.some((x) => x.type === "objet"), reste = etat.tours - etat.tour;
    zone.replaceChildren(
      el("section", { class: "section-page ar-draft", "aria-labelledby": "t-ar" },
        el("div", { class: "ar-draft-tete" },
          el("div", {}, el("h2", { id: "t-ar", tabindex: "-1", texte: `Tour ${fmt(etat.tour + 1)} sur ${fmt(etat.tours)}` }),
            el("p", { class: "sous", texte: vides ? "Remplis un emplacement vide, ou joue une autre carte : une stat, ou l'amélioration ou le remplacement d'un objet déjà pris."
              : "Les cartes sont tirées au sort : stats, améliorations, remplacements. Plus un objet est rare, plus son amélioration est rare." })),
          el("span", { class: "ar-reste num", texte: reste > 1 ? `${fmt(reste)} cartes à choisir` : "Dernière carte" })),
        el("div", { class: "ar-avance", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(etat.tours), "aria-valuenow": String(etat.tour), "aria-label": "Avancement du draft" },
          el("i", { style: { width: (100 * etat.tour) / etat.tours + "%" } })),
        el("ul", { class: "ar-offres" }, o.map(carteOffre))),
      blocBuild("Ton build", "Il se construit au fil des cartes. La puissance est donnée à titre indicatif : elle ne décide pas de tes adversaires."),
      note());
  }

  // ------------------------------------------------------------------ Coffres de fin de parcours
  // Avec GSAP (gsap.min.js) : arrivée des coffres, survol, ouverture en séquence (charge, couvercle, éclats, récompense).
  // Sans GSAP, ou avec les effets réduits : les états ouverts/fermés du CSS suffisent.
  const SON_BUTIN = { medailles: "recompense-medailles", lootbox: "recompense-lootbox", lootbox_legendaire: "recompense-legendaire", ticket_arene: "recompense-ticket" };
  function ecranCoffres() {
    const G = window.gsap, anime = !!G && !App.reduit;
    const pal = palierAtteint() || { lootbox_legendaire: 0, tickets: 0 }, n = etat.coffres_a_ouvrir;
    const genreDe = (i) => (pal.tickets && i === n - 1 ? "ticket" : i >= n - (pal.tickets ? 1 : 0) - pal.lootbox_legendaire ? "legendaire" : "commun");
    const NOMS = { commun: "coffre de récompense", legendaire: "coffre légendaire", ticket: "coffre du champion" };
    let contenu = null, apres = null, enCours = 0, fini = false, relance = null; const ouverts = new Set(), repos = [];
    const bilan = el("div", { class: "ar-bilan", hidden: true }), flash = el("div", { class: "ar-flash", "aria-hidden": "true" });
    const boutons = Array.from({ length: n }, (_, i) => {
      const b = el("button", { type: "button", class: "ar-coffret " + genreDe(i), style: { "--i": i }, "aria-label": `Coffre ${i + 1} sur ${n} : ${NOMS[genreDe(i)]}, fermé. Ouvrir`, onclick: () => ouvrir(i) });
      b.innerHTML = '<span class="ar-rayons" aria-hidden="true"></span><span class="ar-halo" aria-hidden="true"></span>' + COFFRET;
      b.append(el("span", { class: "ar-fx", "aria-hidden": "true" }), el("span", { class: "ar-butin" }));
      return b;
    });
    const rangee = el("div", { class: "ar-coffrets" + (anime ? " gsap" : ""), role: "group", "aria-label": "Tes coffres de récompense" }, boutons);
    const toutOuvrir = el("button", { type: "button", class: "lien ar-tout", onclick: async () => {
      toutOuvrir.hidden = true;
      for (let i = 0; i < n; i++) { if (ouverts.has(i)) continue; await ouvrir(i); if (anime) await new Promise((r) => G.delayedCall(0.42, r)); }
    } }, "Tout ouvrir");
    const pieces = (b) => ({ svg: b.querySelector("svg"), couv: b.querySelector(".cf-couvercle"), gemme: b.querySelector(".cf-gemme"), halo: b.querySelector(".ar-halo"), rayons: b.querySelector(".ar-rayons") });

    // Éclats qui jaillissent du coffre : montée, retombée, disparition.
    function eclats(b, type, nb) {
      const fx = b.querySelector(".ar-fx");
      for (let k = 0; k < nb; k++) {
        const p = el("i", { class: "ar-eclat " + type }); fx.append(p);
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.3, portee = 38 + Math.random() * 72, d = 0.7 + Math.random() * 0.55, haut = Math.sin(angle) * portee;
        G.set(p, { scale: 0.4 + Math.random() * 0.9 });
        G.to(p, { x: Math.cos(angle) * portee, duration: d, ease: "power1.out" });
        G.to(p, { keyframes: { y: [0, haut, haut + 45 + Math.random() * 45], easeEach: "sine.inOut" }, duration: d, ease: "none" });
        G.to(p, { autoAlpha: 0, scale: 0, duration: d * 0.35, delay: d * 0.65, onComplete: () => p.remove() });
      }
    }
    // L'ouverture d'un coffre : il se tasse et tremble, le couvercle saute, la lumière et les éclats sortent, la récompense monte.
    function animer(i, c) {
      const b = boutons[i], { svg, couv, gemme, halo, rayons } = pieces(b), [ico, val, lib] = b.querySelector(".ar-butin").children;
      const grand = c.type === "lootbox_legendaire";
      if (repos[i]) repos[i].kill();
      G.killTweensOf([b, svg, couv, halo]);
      G.set([ico, val, lib], { autoAlpha: 0 });   // tout de suite : la récompense ne doit pas apparaître avant son heure
      const tl = G.timeline({ defaults: { ease: "power2.out" } });
      tl.to(b, { y: 0, duration: 0.1 })
        .call(() => App.sons.arene("coffre-secousse", { vitesse: grand ? 0.8 : 1 }))
        .to(svg, { scale: 1, scaleY: 0.87, scaleX: 1.08, duration: 0.14, ease: "power2.in" }, "<")
        .to(couv, { y: 0, rotation: 0, duration: 0.1 }, "<")
        .fromTo(svg, { rotation: grand ? -5 : -3 }, { rotation: grand ? 5 : 3, duration: 0.045, repeat: grand ? 15 : 7, yoyo: true, ease: "sine.inOut" }, "<")
        .to(halo, { autoAlpha: 0.75, scale: 0.6, duration: 0.3 }, "<")
        .addLabel("ouvre")
        .call(() => App.sons.arene("coffre-ouverture"), null, "ouvre")
        .set(svg, { rotation: 0 }, "ouvre")
        .to(svg, { scaleY: 1.1, scaleX: 0.95, y: -10, duration: 0.16, ease: "power3.out" }, "ouvre")
        .to(couv, { y: -30, rotation: -16, duration: 0.5, ease: "back.out(2.6)" }, "ouvre")
        .to(gemme, { autoAlpha: 0, scale: 0, duration: 0.12 }, "ouvre")
        .to(halo, { autoAlpha: 1, scale: grand ? 1.5 : 1.15, duration: 0.3 }, "ouvre")
        .call(() => eclats(b, c.type, grand ? 34 : 16), null, "ouvre+=0.04")
        .to(svg, { scaleY: 1, scaleX: 1, y: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" }, "ouvre+=0.16")
        .to(couv, { y: -28, rotation: -10, duration: 0.6, ease: "sine.inOut" }, "ouvre+=0.5")
        .addLabel("prix", "ouvre+=0.14")
        .call(() => App.sons.arene(SON_BUTIN[c.type] || "recompense-lootbox"), null, "prix")
        .fromTo(ico, { y: 46, scale: 0.15, rotation: -30 }, { y: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: 0.65, ease: "back.out(2.2)", immediateRender: false }, "prix")
        .fromTo([val, lib], { y: 12 }, { y: 0, autoAlpha: 1, duration: 0.3, stagger: 0.07, immediateRender: false }, "prix+=0.22")
        .to(halo, { autoAlpha: grand ? 0.75 : 0.45, scale: grand ? 1.2 : 0.9, duration: 0.8, ease: "sine.inOut" }, "prix+=0.3")
        .call(() => G.to(ico, { y: -5, duration: 1.3, ease: "sine.inOut", yoyo: true, repeat: -1 }), null, "prix+=0.7");   // la récompense flotte au-dessus du coffre
      if (c.type === "medailles") {   // les médailles se comptent
        const cpt = { v: 0 };
        tl.to(cpt, { v: c.valeur, duration: 0.6, ease: "power1.out", onUpdate: () => { val.textContent = "+" + fmt(Math.round(cpt.v)); } }, "prix+=0.22");
      }
      if (grand) {   // coffre légendaire : éclair, secousse de l'écran, rayons qui tournent
        tl.fromTo(flash, { autoAlpha: 0.6 }, { autoAlpha: 0, duration: 0.7, ease: "power1.out", immediateRender: false }, "ouvre")
          .fromTo(rangee, { x: -6 }, { x: 6, duration: 0.05, repeat: 7, yoyo: true, ease: "sine.inOut", clearProps: "x", immediateRender: false }, "ouvre")
          .fromTo(rayons, { scale: 0.3, rotation: 0 }, { autoAlpha: 0.9, scale: 1, duration: 0.5, immediateRender: false }, "ouvre+=0.05")
          .call(() => G.to(rayons, { rotation: 360, duration: 16, ease: "none", repeat: -1 }), null, "ouvre+=0.05");
      }
      return tl;
    }
    async function ouvrir(i) {
      if (ouverts.has(i) || occupe) return;
      App.sons.demarrer();
      if (!contenu) {   // premier coffre : le serveur crédite tout et donne le contenu, la page le dévoile coffre par coffre
        occupe = true;
        try { const r = await App.rpc("arene_recuperer"); contenu = r.coffres; apres = r; }
        catch (e) { App.erreur(e); occupe = false; return; }
        occupe = false;
        if (ouverts.has(i)) return;
      }
      ouverts.add(i);
      const c = contenu[i], [ic, texte] = butin(c), b = boutons[i], coupe = texte.indexOf(" ");   // « +61 » en grand, « médailles » dessous
      b.classList.add("ouvert", c.type); b.setAttribute("aria-label", `Coffre ${i + 1} : ${texte}`); b.setAttribute("aria-disabled", "true");
      b.querySelector(".ar-butin").replaceChildren(icone(ic), el("b", { class: "num", texte: texte.slice(0, coupe) }), el("small", { texte: texte.slice(coupe + 1) }));
      annonce.textContent = `Coffre ${i + 1} : ${texte}`;
      if (ouverts.size === n) toutOuvrir.hidden = true;
      if (!anime) { App.sons.arene("coffre-ouverture"); App.sons.arene(SON_BUTIN[c.type] || "recompense-lootbox"); if (ouverts.size === n) terminer(); return; }
      enCours++;
      animer(i, c).then(() => { enCours--; if (ouverts.size === n && !enCours) terminer(); });
    }
    function terminer() {
      if (fini) return; fini = true;
      if (relance) relance.kill();
      Object.assign(ctx.joueur, apres.joueur); App.majRessources();
      etat = apres.arene;
      const total = {}; for (const c of contenu) total[c.type] = (total[c.type] || 0) + c.valeur;
      bilan.replaceChildren(
        el("p", { class: "ar-bilan-texte" }, "Tu repars avec ", Object.entries(total).flatMap(([type, valeur], k, l) => [k ? (k === l.length - 1 ? " et " : ", ") : "", el("b", { texte: butin({ type, valeur })[1].slice(1) })]), "."),
        el("div", { class: "ar-bilan-actions" },
          total.lootbox || total.lootbox_legendaire ? el("a", { class: "btn-principal", href: total.lootbox ? "lootbox.html" : "lootbox.html?type=legendaire" }, icone("i-coffre-ligne"), "Ouvrir mes lootbox") : null,
          etat.peut_commencer ? boutonEntree(true) : el("span", { class: "mention", texte: "L'Arène rouvre demain." })));
      bilan.hidden = false;
      App.sons.arene("bilan");
      if (anime) G.from(bilan.children, { y: 18, autoAlpha: 0, duration: 0.45, stagger: 0.12, ease: "power3.out", clearProps: "all" });
      const s = bilan.querySelector("a, button"); if (s) s.focus({ preventScroll: true });
    }
    zone.replaceChildren(
      el("section", { class: "section-page ar-tete ar-recompenses", "aria-labelledby": "t-ar" },
        flash,
        el("h2", { id: "t-ar", tabindex: "-1", texte: etat.victoires >= etat.max_victoires ? "Parcours parfait" : "Parcours terminé" }),
        el("p", { class: "sous", texte: `${pluriel(etat.victoires, "victoire")} : ${pluriel(n, "coffre")} à ouvrir. Touche chaque coffre pour découvrir ce qu'il contient.` }),
        rangee, toutOuvrir, bilan),
      blocBuild("Le build de ce parcours"), note());
    if (!anime) return;

    // Arrivée : les coffres tombent un par un et s'écrasent légèrement, puis flottent en attendant.
    const entree = G.timeline();
    boutons.forEach((b, i) => {
      const { svg } = pieces(b);
      G.set(svg, { transformOrigin: "50% 100%" });
      entree.from(b, { y: -90, autoAlpha: 0, duration: 0.4, ease: "power2.in" }, 0.15 + i * 0.13)
        .call(() => App.sons.arene("coffre-pose"), null, ">")
        .to(svg, { scaleY: 0.8, scaleX: 1.13, duration: 0.08, ease: "power1.out" }, ">")
        .to(svg, { scaleY: 1, scaleX: 1, duration: 0.55, ease: "elastic.out(1.1, 0.4)" }, ">")
        .call(() => { if (!ouverts.has(i)) repos[i] = G.to(b, { y: -5, duration: 1.5 + i * 0.12, ease: "sine.inOut", yoyo: true, repeat: -1 }); }, null, ">-0.3");
    });
    // De temps en temps, un coffre fermé s'agite pour appeler le clic.
    const agiter = () => {
      if (!rangee.isConnected || ouverts.size === n) return;
      const fermes = boutons.filter((_, i) => !ouverts.has(i)), { svg } = pieces(fermes[Math.floor(Math.random() * fermes.length)]);
      if (!G.isTweening(svg)) G.fromTo(svg, { rotation: -4 }, { rotation: 4, duration: 0.07, repeat: 5, yoyo: true, ease: "sine.inOut", onComplete: () => G.set(svg, { rotation: 0 }) });
      relance = G.delayedCall(2.6 + Math.random() * 1.6, agiter);
    };
    relance = G.delayedCall(2.4, agiter);
    // Survol et focus : le coffre se soulève, le couvercle s'entrouvre, la lumière filtre.
    boutons.forEach((b, i) => {
      const { svg, couv, halo } = pieces(b);
      const survol = (oui) => {
        if (ouverts.has(i)) return;
        G.to(svg, { scale: oui ? 1.09 : 1, duration: 0.25, ease: oui ? "back.out(2.5)" : "power2.out", overwrite: "auto" });
        G.to(couv, { y: oui ? -6 : 0, rotation: oui ? -4 : 0, duration: 0.25, overwrite: "auto" });
        G.to(halo, { autoAlpha: oui ? 0.55 : 0, scale: oui ? 0.7 : 0.5, duration: 0.25, overwrite: "auto" });
      };
      b.addEventListener("pointerenter", () => survol(true)); b.addEventListener("pointerleave", () => survol(false));
      b.addEventListener("focus", () => survol(true)); b.addEventListener("blur", () => survol(false));
    });
  }

  // ------------------------------------------------------------------ Entrée, parcours en cours, parcours terminé
  function rendre() {
    if (etat.etat === "draft") return ecranDraft();
    if (etat.etat === "coffres") return ecranCoffres();
    const enCours = etat.etat === "en_cours", fini = etat.etat === "termine", debut = enCours && etat.victoires + etat.defaites === 0;
    const titre = debut ? "Ton build est prêt" : enCours ? "Parcours en cours" : fini ? (etat.victoires >= etat.max_victoires ? "Parcours parfait" : "Parcours terminé") : "Entre dans l'Arène";
    const texte = debut ? `${fmt(etat.max_victoires)} victoires avant ${fmt(etat.max_defaites)} défaites. Tu affrontes le build drafté par d'autres joueurs, de plus en plus forts à mesure que tu gagnes.`
      : enCours ? `Encore ${pluriel(etat.max_victoires - etat.victoires, "victoire")} pour aller au bout, et ${pluriel(etat.max_defaites - etat.defaites, "défaite")} de marge.`
      : fini ? `Tu t'arrêtes à ${pluriel(etat.victoires, "victoire")}. ` + (etat.entree === "ticket" ? "Ton parcours gratuit du jour est fait, mais tu as un ticket d'arène." : etat.peut_commencer ? "Tu peux relancer un draft." : "L'Arène rouvre demain.")
      : `Un parcours gratuit par jour : ${fmt(etat.max_victoires)} victoires avant ${fmt(etat.max_defaites)} défaites.`;
    const gagnes = fini && etat.coffres && etat.coffres.length ? el("ul", { class: "ar-gagnes", "aria-label": "Récompenses de ce parcours" },
      etat.coffres.map((c) => { const [ic, t] = butin(c); return el("li", { class: c.type }, icone(ic), el("b", { class: "num", texte: t })); })) : null;
    zone.replaceChildren(...[
      el("section", { class: "section-page ar-tete", "aria-labelledby": "t-ar" },
        el("h2", { id: "t-ar", tabindex: "-1", texte: titre }), el("p", { class: "sous", texte }),
        enCours || fini ? score() : el("ol", { class: "ar-etapes" },
          el("li", {}, el("b", { texte: "Drafte" }), el("span", { texte: `${fmt(etat.tours)} tours, 5 cartes à chaque tour : une stat (+${fmt(etat.stat_points)} à +${fmt(etat.stat_points_max || etat.stat_points)} points selon sa rareté), un objet pour chaque emplacement vide, et pour le reste des améliorations (+1 à +3) ou des remplacements tirés au sort. Plus un objet est rare, plus son amélioration est rare.` })),
          el("li", {}, el("b", { texte: "Combats" }), el("span", { texte: "Avec ce build, contre ceux des autres joueurs qui ont autant de victoires que toi." })),
          el("li", {}, el("b", { texte: "Ouvre tes coffres" }), el("span", { texte: "Plus tu vas loin, plus il y en a, et mieux ils sont remplis." }))),
        gagnes,
        enCours ? el("a", { class: "btn-principal", href: "combat.html?mode=arene" }, icone("i-epees"), debut ? "Premier combat" : "Combat suivant") : boutonEntree(fini),
        !enCours && etat.tickets > 0 && etat.entree !== "ticket" ? el("p", { class: "mention", texte: `Tu as aussi ${pluriel(etat.tickets, "ticket")} d'arène pour rejouer après ton parcours gratuit.` }) : null),
      el("section", { class: "section-page", "aria-labelledby": "t-pal" },
        el("h2", { id: "t-pal", texte: "Récompenses" }),
        el("p", { class: "sous", texte: "Seul le plus haut palier atteint compte. Les coffres s'ouvrent à la fin du parcours." }),
        blocPaliers(enCours || fini)),
      (enCours || fini) && etat.kit ? blocBuild(fini ? "Le build de ce parcours" : "Ton build") : null,
      histo.length ? el("section", { class: "section-page", "aria-labelledby": "t-histo" },
        el("h2", { id: "t-histo", texte: "Tes derniers parcours" }),
        el("p", { class: "sous", texte: "Tes 10 derniers builds et leur résultat. Les autres joueurs les voient aussi sur ton profil." }),
        App.vueParcoursArene(histo, etat.max_victoires)) : null,
      note()].filter(Boolean));
  }
  rendre();
});
})();
