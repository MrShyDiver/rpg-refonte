"use strict";
/* Boutique : étal de l'heure, lootbox et tickets, revente, troc, journal. Monnaie : les médailles. */
(function () {
const { $, $$, el, icone, fmt, ilYa, date, attendre, RARETES, ORDRE_RARETE, rangRarete } = App;

const ONGLETS = [
  { id: "etal", titre: "Étal", icone: "i-boutique" },
  { id: "lootbox", titre: "Lootbox", suite: " & tickets", icone: "i-coffre-ligne" },
  { id: "vendre", titre: "Vendre", icone: "i-medaille" },
  { id: "troc", titre: "Troc", icone: "i-cartes" },
  { id: "journal", titre: "Journal", icone: "i-livre" },
];
const EMPLACEMENTS = ["arme", "offhand", "armure", "strategeme"];
const HEURE = 3600e3;

App.demarrer("boutique", async (main, ctx) => {
  // ---------- État ----------
  let etal = null, etalErreur = null;
  let prix = null, reglages = null, chances = null, vitrine = new Set(), baseErreur = null;
  let journal = null, journalSale = true;
  let courant = "etal";
  const troc = { rarete: "commun", choix: new Map() };
  const quantites = { lootbox: 1 };

  const solde = () => ctx.joueur.medailles || 0;
  const maxDe = (o) => App.niveauMax(o.rarete);
  const equipe = (n) => EMPLACEMENTS.some((k) => ctx.loadout && ctx.loadout[k] === n);
  const prixVente = (r) => (prix && prix[r] ? prix[r].vente : 0);
  const reglage = (cle, defaut) => (reglages && reglages[cle] != null ? reglages[cle] : defaut);
  const sonsOk = () => ctx.prefs && ctx.prefs.sons !== false;
  const pluriel = (n, s, p) => (n > 1 ? p || s + "s" : s);
  const adjRarete = (r, n) => { const b = RARETES[r].nom.toLowerCase(); return n > 1 ? (b.endsWith("al") ? b.slice(0, -2) + "aux" : b + "s") : b; };

  // Tous mes objets, avec copies, niveau effectif et doublons au-delà du max.
  function possessions() {
    return [...ctx.inventaire.values()].map((l) => {
      const o = App.objet(l.item_numero);
      if (!o) return null;
      const max = maxDe(o);
      return { o, l, max, copies: l.niveau + 1, eff: Math.min(l.niveau, max), trop: Math.max(0, l.niveau - max) };
    }).filter(Boolean);
  }

  // ---------- Petits composants ----------
  const medailles = (n, cls) => el("span", { class: "prix-med" + (cls ? " " + cls : "") }, icone("i-medaille"), el("b", { class: "num", texte: fmt(n) }));
  const niveauTexte = (eff, max) => (eff >= max ? "MAX" : "+" + eff);

  function stepper({ min = 1, max, valeur, libelle, surChange }) {
    let v = valeur, borne = max;
    const moins = el("button", { type: "button", class: "pas", "aria-label": "Retirer un" }, "−");
    const plus = el("button", { type: "button", class: "pas", "aria-label": "Ajouter un" }, "+");
    const champ = el("input", { type: "number", class: "num", inputmode: "numeric", min, max, value: v, "aria-label": libelle });
    function maj(n, notifier = true) {
      v = Math.max(min, Math.min(borne, Math.round(Number(n)) || min));
      champ.value = v; champ.max = borne;
      moins.disabled = v <= min; plus.disabled = v >= borne;
      if (notifier) surChange(v);
    }
    moins.addEventListener("click", () => maj(v - 1));
    plus.addEventListener("click", () => maj(v + 1));
    champ.addEventListener("change", () => maj(champ.value));
    maj(v, false);
    const racine = el("div", { class: "stepper" }, moins, champ, plus);
    return { el: racine, get valeur() { return v; }, borner(b) { borne = Math.max(min, b); maj(Math.min(v, borne), false); } };
  }

  function etatErreur(texte, reessayer) {
    return el("div", { class: "vide" }, el("b", { texte: "Le marchand ne répond pas." }), texte + " ",
      reessayer ? el("div", { style: { marginTop: "12px" } }, el("button", { type: "button", class: "btn-second", onclick: reessayer }, "Réessayer")) : null);
  }
  const chargement = (t) => el("div", { class: "chargement bq-chargement", texte: t || "Chargement…" });

  // ---------- En-tête : solde, sources de médailles ----------
  const soldeChiffre = el("b", { class: "num", texte: fmt(solde()) });
  let soldeAffiche = solde();
  function majSolde() {
    const cible = solde(), depart = soldeAffiche;
    soldeAffiche = cible;
    if (App.reduit || depart === cible) { soldeChiffre.textContent = fmt(cible); return; }
    const t0 = performance.now(), duree = 650;
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - k, 3);
      soldeChiffre.textContent = fmt(Math.round(depart + (cible - depart) * e));
      if (k < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
    bourse.classList.remove("pulse-gain", "pulse-perte");
    void bourse.offsetWidth;
    bourse.classList.add(cible > depart ? "pulse-gain" : "pulse-perte");
  }
  const bourse = el("div", { class: "bourse" },
    icone("i-medaille", "bourse-ic"),
    el("div", {}, el("span", { class: "bourse-lib" }, "Ta bourse", el("a", { class: "lien-aide", href: "aide.html#medailles", "aria-label": "Aide : les médailles", title: "Aide : les médailles", texte: "?" })), el("div", { class: "bourse-chiffre", "aria-live": "polite" }, soldeChiffre, el("span", { texte: " médailles" }))));
  const cumulDuel = el("b", { class: "num" }), cumulRevente = el("b", { class: "num" });
  function majCumuls() { cumulDuel.textContent = fmt(ctx.joueur.medailles_duel || 0); cumulRevente.textContent = fmt(ctx.joueur.medailles_revente || 0); }
  majCumuls();

  const entete = el("header", { class: "entete-page entete-boutique" },
    el("div", { class: "entete-texte" },
      el("h1", {}, "La ", el("span", { class: "or", texte: "boutique" })),
      el("p", { texte: "Le marchand de Super-Terre ne prend qu'une monnaie : les médailles. Dépense-les à l'étal, en lootbox ou en ticket de reset, et fais de la place en revendant ce qui dort dans ta collection." })),
    bourse);
  const sources = el("div", { class: "sources" },
    el("a", { class: "source", href: "duels.html" }, icone("i-epees"),
      el("div", {}, el("b", { texte: "Gagne des duels" }), el("span", { texte: "Chaque victoire remplit ta bourse. " }), el("small", {}, cumulDuel, " médailles gagnées en duel"))),
    el("a", { class: "source", href: "#vendre" }, icone("i-cartes"),
      el("div", {}, el("b", { texte: "Revends tes doublons" }), el("span", { texte: "Au-delà des améliorations max, chaque copie est du bénéfice pur. " }), el("small", {}, cumulRevente, " médailles gagnées en revente"))));

  // ---------- Onglets ----------
  const liste = el("div", { class: "onglets-b onglets-boutique", role: "tablist", "aria-label": "Rayons de la boutique" },
    ONGLETS.map((o) => el("button", { type: "button", role: "tab", id: "tab-" + o.id, "aria-controls": o.id, "aria-selected": "false", tabindex: "-1", onclick: () => ouvrir(o.id, true) },
      icone(o.icone), el("span", {}, o.titre, o.suite ? el("span", { class: "long", texte: o.suite }) : null), el("span", { class: "compte num", hidden: true }))));
  liste.addEventListener("keydown", (e) => {
    const i = ONGLETS.findIndex((o) => o.id === courant);
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? ONGLETS.length - 1 : null;
    if (j === null) return;
    e.preventDefault();
    const cible = ONGLETS[(j + ONGLETS.length) % ONGLETS.length].id;
    ouvrir(cible, true); $("#tab-" + cible).focus();
  });
  const panneaux = Object.fromEntries(ONGLETS.map((o) => [o.id, el("section", { class: "rayon", id: o.id, role: "tabpanel", "aria-labelledby": "tab-" + o.id, tabindex: "-1", hidden: true })]));

  function ouvrir(id, memoriser) {
    if (!panneaux[id]) id = "etal";
    courant = id;
    for (const o of ONGLETS) {
      const b = $("#tab-" + o.id), actif = o.id === id;
      b.setAttribute("aria-selected", String(actif)); b.tabIndex = actif ? 0 : -1;
      panneaux[o.id].hidden = !actif;
    }
    if (memoriser && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    if (id === "journal" && journalSale) chargerJournal();
  }
  window.addEventListener("hashchange", () => { ouvrir(location.hash.slice(1)); liste.scrollIntoView({ block: "nearest", behavior: App.reduit ? "auto" : "smooth" }); });

  main.append(entete, sources, liste, ...Object.values(panneaux));

  // ---------- Après une action : compteurs, collection, succès ----------
  async function apresAction({ collection = false } = {}) {
    try {
      await Promise.all([App.rafraichirJoueur(), collection ? App.rafraichirCollection() : null]);
      if (collection) vitrine = new Set((await App.api.vitrine(ctx.joueur.id)).map((v) => v.item_numero));
    } catch (e) { App.erreur(e); }
    majSolde(); majCumuls();
    journalSale = true;
    rendreEtal(); rendreLootbox(); rendreVendre(); rendreTroc();
    if (courant === "journal") chargerJournal();
    App.verifierSucces();
  }

  // ---------- Révélation d'une carte (achat, troc) ----------
  async function reveler(tiroir, res, { suspense = false, titre, actions = [] }) {
    const o = App.objet(res.numero);
    if (!o) return;
    const max = maxDe(o), rang = rangRarete(o.rarete);
    const corps = $(".tiroir-corps", tiroir), pied = $(".tiroir-pied", tiroir);
    $(".tiroir-tete h2", tiroir).textContent = titre;
    const charge = suspense ? 700 + rang * 420 : 380 + rang * 120;
    const dc = el("div", { class: "dcarte", style: { "--c": `var(--${o.rarete})`, "--vib": charge + "ms" } },
      el("div", { class: "eclat" }),
      el("div", { class: "dcarte-in" }, el("div", { class: "dos" }, icone("i-marque")), el("div", { class: "face" }, App.carte(o, { niveau: Math.min(res.niveau, max) }))),
      el("div", { class: "libelle-rarete", texte: RARETES[o.rarete].nom }));
    const scene = el("div", { class: "scene-revelation", style: { "--c": `var(--${o.rarete})` } }, dc);
    const legende = el("div", { class: "legende-revelation", "aria-live": "polite" });
    corps.replaceChildren(scene, legende);
    pied.replaceChildren();
    await attendre(260);
    dc.classList.add("charge");
    if (suspense && sonsOk()) {
      const n = rang + 1;
      for (let i = 0; i < n; i++) { App.sons.tic(i); await attendre(charge / n); }
    } else await attendre(charge);
    dc.classList.add("retournee", "eclate");
    if (rang >= 2) dc.classList.add("haute");
    scene.classList.add("revelee");
    if (sonsOk()) App.sons.rarete(rang);
    const trop = Math.max(0, res.niveau - max);
    legende.replaceChildren(
      el("p", { class: "legende-titre" }, res.nouveau ? el("span", { class: "badge-nouveau", texte: "Nouveau" }) : null, el("b", { texte: o.nom })),
      el("p", { texte: res.nouveau ? "rejoint ta collection. Équipe-le depuis ton arsenal."
        : trop > 0 ? `était déjà amélioré au max : ce doublon part dans tes « en trop » (+${trop}), revends-le ou troque-le.`
        : `passe ${res.niveau >= max ? "à MAX" : "à +" + res.niveau} dans ta collection.` }));
    pied.replaceChildren(...actions);
    if (actions[0]) actions[0].focus();
  }

  // ======================================================================
  // ÉTAL
  // ======================================================================
  const rebours = el("b", { class: "num", texte: "--:--" });
  const jaugeHeure = el("i");
  const blocRebours = el("div", { class: "rebours", role: "timer", "aria-live": "off" },
    el("span", { texte: "Nouvel étal dans" }), rebours, el("div", { class: "jauge-heure", "aria-hidden": "true" }, jaugeHeure));
  let prochaineHeure = Math.ceil(Date.now() / HEURE) * HEURE, rotationEnCours = false;
  function tic() {
    const reste = prochaineHeure - Date.now();
    if (reste <= 0) {
      if (!rotationEnCours) {
        rotationEnCours = true;
        rebours.textContent = "00:00";
        setTimeout(async () => {
          prochaineHeure = Math.ceil((Date.now() + 1000) / HEURE) * HEURE;
          await chargerEtal();
          rotationEnCours = false;
          App.toast("Le marchand vient de renouveler son étal.", { titre: "Nouvel étal", icone: "i-boutique" });
        }, 1500);
      }
      return;
    }
    const s = Math.ceil(reste / 1000), m = Math.floor(s / 60);
    rebours.textContent = String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    blocRebours.setAttribute("aria-label", `Nouvel étal dans ${m} minute${m > 1 ? "s" : ""}`);
    jaugeHeure.style.transform = "scaleX(" + (1 - reste / HEURE).toFixed(4) + ")";
  }
  tic(); setInterval(tic, 1000);

  async function chargerEtal() {
    etalErreur = null;
    try { etal = await App.api.etal(); } catch (e) { etalErreur = e; console.error(e); }
    rendreEtal();
  }

  function rendreEtal() {
    const p = panneaux.etal;
    const tete = el("div", { class: "tete-rayon" },
      el("div", {}, el("h2", { texte: "Étal du moment" }),
        el("p", { class: "sous", texte: "Le même pour tout le monde, renouvelé à chaque heure pile. Un objet acheté arrive comme un tirage : nouveau pour ta collection, ou une amélioration (+1) s'il y est déjà." })),
      blocRebours);
    if (etalErreur) return p.replaceChildren(tete, etatErreur("Impossible de charger l'étal.", () => { p.replaceChildren(tete, chargement()); chargerEtal(); }));
    if (!etal) return p.replaceChildren(tete, chargement("Le marchand déballe sa marchandise…"));
    const offres = etal.map((e) => ({ e, o: App.objet(e.numero) })).filter((x) => x.o)
      .sort((a, b) => rangRarete(b.o.rarete) - rangRarete(a.o.rarete) || a.e.rang - b.e.rang);
    if (!offres.length) return p.replaceChildren(tete, el("div", { class: "vide" }, el("b", { texte: "L'étal est vide cette heure-ci." }), "Repasse à la prochaine rotation, ou jette un œil aux lootbox en attendant."));
    const grille = el("div", { class: "grille-cartes grille-etal" }, offres.map(({ e, o }) => {
      const l = ctx.inventaire.get(o.numero), max = maxDe(o);
      const auMax = !!l && l.niveau >= max, manque = e.prix - solde();
      const raison = auMax ? "Déjà amélioré au max" : manque > 0 ? `Il te manque ${fmt(manque)} médailles` : null;
      return el("article", { class: "case-carte offre", style: { "--c": `var(--${o.rarete})` } },
        el("button", { type: "button", class: "zone", "aria-label": "Voir la fiche : " + o.nom, onclick: () => ficheAchat(e) }, App.carte(o, { niveau: l ? Math.min(l.niveau, max) : null })),
        el("div", { class: "infos-offre" },
          medailles(e.prix, "grand"),
          l ? el("span", { class: "possede" }, "Possédé · ", el("b", { class: "num", texte: niveauTexte(Math.min(l.niveau, max), max) }))
            : el("span", { class: "badge-nouveau", texte: "Nouveau pour toi" })),
        el("button", { type: "button", class: "btn-principal", disabled: !!raison, "aria-describedby": raison ? "raison-" + o.numero : null, onclick: () => ficheAchat(e) }, "Acheter"),
        raison ? el("p", { class: "raison", id: "raison-" + o.numero, texte: raison }) : null);
    }));
    p.replaceChildren(tete, grille);
  }

  function ficheAchat(e) {
    const o = App.objet(e.numero), l = ctx.inventaire.get(o.numero), max = maxDe(o);
    const auMax = !!l && l.niveau >= max, apres = solde() - e.prix;
    const effet = !l ? "Nouvel objet pour ta collection" : auMax ? "Déjà amélioré au max" : `+${l.niveau} → ${l.niveau + 1 >= max ? "MAX" : "+" + (l.niveau + 1)}`;
    const recap = el("div", { class: "lignes recap" },
      el("div", { class: "ligne" }, el("span", { texte: "Prix" }), el("b", {}, medailles(e.prix))),
      el("div", { class: "ligne" }, el("span", { texte: "Ta bourse après l'achat" }), el("b", { class: apres < 0 ? "negatif" : null }, medailles(apres))),
      el("div", { class: "ligne" }, el("span", { texte: "Effet" }), el("b", { texte: effet })));
    const acheter = el("button", { type: "button", class: "btn-principal", disabled: auMax || apres < 0 }, "Acheter pour ", el("span", { class: "num", texte: fmt(e.prix) }));
    const pied = [el("button", { type: "button", class: "btn-second", onclick: () => App.fermerTiroir() }, "Annuler"), acheter];
    if (apres < 0 && !auMax) pied.push(el("p", { class: "raison", texte: `Il te manque ${fmt(-apres)} médailles.` }));
    const t = App.tiroir({ titre: "Acheter à l'étal", contenu: el("div", { class: "pile" }, recap, App.fiche(o, { niveau: l ? Math.min(l.niveau, max) : 0, possede: !!l })), pied: el("div", { class: "pied-actions" }, pied) });
    acheter.addEventListener("click", async () => {
      if (sonsOk()) App.sons.demarrer();
      acheter.disabled = true; acheter.textContent = "Achat…";
      try {
        const r = await App.rpc("acheter", { p_article: "objet", p_numero: o.numero, p_quantite: 1 });
        const res = r.objet || { numero: o.numero, niveau: l ? l.niveau + 1 : 0, nouveau: !l };
        apresAction({ collection: true });
        await reveler(t, res, { titre: "Marché conclu", actions: [
          el("button", { type: "button", class: "btn-principal", onclick: () => App.fermerTiroir() }, "Super"),
          el("a", { class: "btn-second", href: "arsenal.html" }, "Voir mon arsenal")] });
      } catch (err) {
        App.erreur(err);
        acheter.disabled = false; acheter.replaceChildren("Acheter pour ", el("span", { class: "num", texte: fmt(e.prix) }));
        if (/plus à l'étal/.test(err.message)) { App.fermerTiroir(); chargerEtal(); }
      }
    });
  }

  // ======================================================================
  // LOOTBOX & TICKETS
  // ======================================================================
  function rendreLootbox() {
    const p = panneaux.lootbox;
    const tete = el("div", { class: "tete-rayon" }, el("div", {}, el("h2", { texte: "Lootbox & tickets" }),
      el("p", { class: "sous", texte: "Toujours en stock, au même prix pour tout le monde." })));
    if (baseErreur) return p.replaceChildren(tete, etatErreur("Impossible de lire les prix.", chargerBase));
    if (!reglages) return p.replaceChildren(tete, chargement());
    const j = ctx.joueur;
    const prixLb = reglage("prix_lootbox", 0), prixTk = reglage("prix_ticket_reset", 0);
    const maxLb = Math.max(1, Math.min(10, Math.floor(solde() / Math.max(1, prixLb)) || 1));
    quantites.lootbox = Math.min(quantites.lootbox, 10);

    // Lootbox
    const total = el("b", {}), apres = el("span", { class: "apres" });
    const btnLb = el("button", { type: "button", class: "btn-principal" });
    const pas = stepper({ min: 1, max: 10, valeur: quantites.lootbox, libelle: "Nombre de lootbox", surChange: (v) => { quantites.lootbox = v; majLb(); } });
    function majLb() {
      const q = quantites.lootbox, t = q * prixLb, reste = solde() - t;
      total.replaceChildren(medailles(t, "grand"));
      apres.replaceChildren(reste >= 0 ? el("span", {}, "Il te restera ", el("b", { class: "num", texte: fmt(reste) }), " médailles") : el("span", { class: "manque" }, "Il te manque ", el("b", { class: "num", texte: fmt(-reste) }), " médailles"));
      btnLb.disabled = reste < 0;
      btnLb.replaceChildren(icone("i-coffre-ligne"), `Acheter ${q} lootbox`);
    }
    majLb();
    const cta = el("div", { class: "cta-apres", "aria-live": "polite" });
    btnLb.addEventListener("click", async () => {
      const q = quantites.lootbox;
      btnLb.disabled = true;
      try {
        await App.rpc("acheter", { p_article: "lootbox", p_quantite: q });
        App.toast(`${q} lootbox ${pluriel(q, "ajoutée")} à ton stock.`, { type: "info", titre: "Achat réussi", icone: "i-coffre-ligne" });
        await apresAction();
        const zone = $(".cta-apres", panneaux.lootbox);
        zone.replaceChildren(el("div", { class: "cta-ouvrir" }, el("span", {}, "Tu as ", el("b", { class: "num", texte: fmt(ctx.joueur.lootbox) }), " lootbox qui t'attendent."),
          el("a", { class: "btn-principal", href: "lootbox.html" }, "Ouvrir maintenant", icone("i-fleche"))));
      } catch (e) { App.erreur(e); btnLb.disabled = false; }
    });
    const totalPoids = (chances || []).reduce((s, r) => s + Number(r.poids || 0), 0);
    const odds = totalPoids ? el("div", { class: "chances", "aria-label": "Chances par rareté" },
      ORDRE_RARETE.map((r) => (chances.find((x) => x.rarete === r) || {})).filter((x) => Number(x.poids) > 0)
        .map((x) => el("span", { class: "pilule " + x.rarete }, RARETES[x.rarete].nom, " ", el("span", { class: "num", texte: Math.round((x.poids / totalPoids) * 100) + " %" })))) : null;
    const carteLb = el("article", { class: "panneau-b comptoir" },
      el("div", { class: "comptoir-tete" },
        el("div", { class: "comptoir-art", html: '<svg viewBox="0 0 32 26" aria-hidden="true"><use href="#i-coffre"/></svg>' }),
        el("div", {}, el("h3", { texte: "Lootbox" }), el("p", { texte: "Un objet tiré au hasard, avec la même table de chances que les lootbox gagnées en live." }),
          el("p", { class: "stock" }, "En stock chez toi : ", el("b", { class: "num", texte: fmt(j.lootbox || 0) })))),
      odds,
      el("div", { class: "comptoir-achat" },
        el("div", { class: "ligne-prix" }, el("span", {}, "Prix unitaire"), medailles(prixLb)),
        el("div", { class: "ligne-qte" }, el("span", { id: "lib-qte-lb", texte: "Quantité" }), pas.el),
        el("div", { class: "ligne-total" }, el("span", {}, "Total"), total),
        apres, btnLb,
        solde() < prixLb ? null : el("button", { type: "button", class: "lien-max", onclick: () => { quantites.lootbox = maxLb; rendreLootbox(); } }, `Le maximum que je peux m'offrir (${maxLb})`)),
      cta);

    // Ticket de reset
    const investis = (j.atk_stacks || 0) + (j.def_stacks || 0) + (j.pv_stacks || 0) + (j.spd_stacks || 0) + (j.luck_stacks || 0);
    const manqueTk = prixTk - solde();
    const btnTk = el("button", { type: "button", class: "btn-principal", disabled: manqueTk > 0 }, icone("i-ticket"), "Acheter un ticket");
    const ctaTk = el("div", { class: "cta-apres", "aria-live": "polite" });
    btnTk.addEventListener("click", async () => {
      btnTk.disabled = true;
      try {
        await App.rpc("acheter", { p_article: "ticket_reset", p_quantite: 1 });
        App.toast("Ticket de reset ajouté. Utilise-le depuis ton profil.", { titre: "Achat réussi", icone: "i-ticket" });
        await apresAction();
        $$(".cta-apres", panneaux.lootbox)[1].replaceChildren(el("div", { class: "cta-ouvrir" }, el("span", {}, "Tu as ", el("b", { class: "num", texte: fmt(ctx.joueur.tickets_reset) }), " " + pluriel(ctx.joueur.tickets_reset, "ticket") + " de reset."),
          el("a", { class: "btn-principal", href: "profil.html" }, "Utiliser sur mon profil", icone("i-fleche"))));
      } catch (e) { App.erreur(e); btnTk.disabled = false; }
    });
    const carteTk = el("article", { class: "panneau-b comptoir" },
      el("div", { class: "comptoir-tete" },
        el("div", { class: "comptoir-art ticket" }, icone("i-ticket")),
        el("div", {}, el("h3", { texte: "Ticket de reset" }),
          el("p", { texte: "Tu t'es trompé de build ? Le ticket te rend tous tes points de stats investis (Attaque, Défense, PV, Vitesse, Chance) pour que tu les replaces comme tu veux sur ton profil." }),
          el("p", { class: "stock" }, "En stock chez toi : ", el("b", { class: "num", texte: fmt(j.tickets_reset || 0) })))),
      el("div", { class: "lignes" },
        el("div", { class: "ligne" }, el("span", { texte: "Points que le ticket te rendrait" }), el("b", { class: "num", texte: fmt(investis) })),
        (j.credits_reset || 0) > 0 ? el("div", { class: "ligne" }, el("span", { texte: "Points déjà en attente de placement" }), el("b", { class: "num", texte: fmt(j.credits_reset) })) : null),
      el("div", { class: "comptoir-achat" },
        el("div", { class: "ligne-total" }, el("span", {}, "Prix"), medailles(prixTk, "grand")),
        manqueTk > 0 ? el("span", { class: "apres" }, el("span", { class: "manque" }, "Il te manque ", el("b", { class: "num", texte: fmt(manqueTk) }), " médailles"))
          : el("span", { class: "apres" }, "Il te restera ", el("b", { class: "num", texte: fmt(solde() - prixTk) }), " médailles"),
        btnTk,
        (j.tickets_reset || 0) > 0 ? el("a", { class: "lien-max", href: "profil.html" }, "Utiliser un ticket que j'ai déjà") : null),
      ctaTk);
    p.replaceChildren(tete, el("div", { class: "comptoirs" }, carteLb, carteTk));
  }

  // ======================================================================
  // VENDRE
  // ======================================================================
  const filtres = { texte: "", rarete: "", tropSeulement: false };
  const qteVente = new Map();

  function consequence(x, q) {
    if (q <= x.trop) return { cls: "ok", texte: `Bénéfice pur : ${q > 1 ? "ces copies sont" : "cette copie est"} au-delà des améliorations max, ton objet reste MAX.` };
    if (q >= x.copies) return { cls: "danger", texte: `Dernier exemplaire : l'objet quitte ta collection${equipe(x.o.numero) ? ", il sera déséquipé" : ""}${vitrine.has(x.o.numero) ? " et retiré de ta vitrine" : ""}.` };
    const nouv = Math.min(x.l.niveau - q, x.max);
    return { cls: "attention", texte: `Ton objet passera de ${niveauTexte(x.eff, x.max)} à +${nouv}.` };
  }

  function rendreVendre() {
    const p = panneaux.vendre;
    const tete = el("div", { class: "tete-rayon" }, el("div", {}, el("h2", { texte: "Vendre" }),
      el("p", { class: "sous", texte: "Pour un objet en +N, tu possèdes N + 1 exemplaires. Les copies au-delà des améliorations max ne servent plus à rien : c'est là que se cache ton argent de poche." })));
    if (baseErreur) return p.replaceChildren(tete, etatErreur("Impossible de lire les prix de rachat.", chargerBase));
    if (!prix) return p.replaceChildren(tete, chargement());
    const tout = possessions();
    const enTrop = tout.filter((x) => x.trop > 0);
    const nbTrop = enTrop.reduce((s, x) => s + x.trop, 0), valeurTrop = enTrop.reduce((s, x) => s + x.trop * prixVente(x.o.rarete), 0);
    majCompte("vendre", nbTrop);

    const bareme = el("div", { class: "bareme" }, el("span", { class: "mention", texte: "Rachat par exemplaire :" }),
      ORDRE_RARETE.map((r) => el("span", { class: "pilule " + r }, RARETES[r].nom, " ", el("span", { class: "num", texte: fmt(prixVente(r)) }))));
    const recolte = el("div", { class: "panneau-b recolte" + (nbTrop ? " a-vendre" : "") },
      el("div", { class: "recolte-texte" },
        nbTrop ? el("b", {}, el("span", { class: "num", texte: fmt(nbTrop) }), ` ${pluriel(nbTrop, "doublon")} en trop sur ${enTrop.length} ${pluriel(enTrop.length, "objet")}`) : el("b", { texte: "Aucun doublon en trop pour l'instant" }),
        el("span", { texte: nbTrop ? "Ils sont au-delà des améliorations max : les vendre ne change rien à ta puissance." : "Ils apparaissent quand un objet déjà amélioré au max retombe d'une lootbox ou de l'étal." })),
      nbTrop ? el("div", { class: "recolte-action" }, medailles(valeurTrop, "grand gain"),
        el("button", { type: "button", class: "btn-principal", onclick: () => venteGroupee(enTrop) }, "Vendre tous les doublons en trop")) : null);

    if (!tout.length) return p.replaceChildren(tete, recolte, el("div", { class: "vide" }, el("b", { texte: "Ta collection est vide." }), "Ouvre des lootbox pour avoir quelque chose à revendre. ", el("a", { href: "lootbox.html", texte: "Aller aux lootbox" })));

    const recherche = el("input", { type: "search", placeholder: "Chercher un objet", value: filtres.texte, "aria-label": "Chercher un objet" });
    const choixRarete = el("select", { "aria-label": "Filtrer par rareté" }, el("option", { value: "", texte: "Toutes les raretés" }),
      ORDRE_RARETE.map((r) => el("option", { value: r, texte: RARETES[r].nom, selected: filtres.rarete === r })));
    const inter = el("button", { type: "button", class: "interrupteur", role: "switch", "aria-checked": String(filtres.tropSeulement), "aria-labelledby": "lib-trop" });
    const zoneListe = el("div", { class: "liste-objets", "aria-live": "polite" });
    const majListe = () => {
      const t = filtres.texte.trim().toLowerCase();
      const vis = tout.filter((x) => (!t || x.o.nom.toLowerCase().includes(t)) && (!filtres.rarete || x.o.rarete === filtres.rarete) && (!filtres.tropSeulement || x.trop > 0))
        .sort((a, b) => b.trop * prixVente(b.o.rarete) - a.trop * prixVente(a.o.rarete) || b.copies - a.copies || a.o.numero - b.o.numero);
      zoneListe.replaceChildren(...(vis.length ? vis.map(ligneVente) : [el("div", { class: "vide" }, el("b", { texte: "Rien ne correspond." }), "Change la recherche ou les filtres.")]));
    };
    recherche.addEventListener("input", () => { filtres.texte = recherche.value; majListe(); });
    choixRarete.addEventListener("change", () => { filtres.rarete = choixRarete.value; majListe(); });
    inter.addEventListener("click", () => { filtres.tropSeulement = !filtres.tropSeulement; inter.setAttribute("aria-checked", String(filtres.tropSeulement)); majListe(); });
    const barre = el("div", { class: "barre-filtres" },
      el("label", { class: "champ champ-recherche" }, icone("i-recherche"), recherche),
      el("label", { class: "champ" }, choixRarete),
      el("div", { class: "bascule" }, inter, el("span", { id: "lib-trop", texte: "Seulement les doublons en trop" })));
    majListe();
    p.replaceChildren(tete, recolte, bareme, barre, zoneListe);
  }

  function ligneVente(x) {
    const n = x.o.numero, unit = prixVente(x.o.rarete);
    const defaut = Math.min(qteVente.get(n) || (x.trop > 0 ? x.trop : 1), x.copies);
    const gain = el("span", { class: "gain-ligne" });
    const note = el("p", { class: "consequence" });
    const btn = el("button", { type: "button", class: "btn-second btn-vendre" });
    const pas = stepper({ min: 1, max: x.copies, valeur: defaut, libelle: "Exemplaires de " + x.o.nom + " à vendre", surChange: (v) => { qteVente.set(n, v); maj(); } });
    function maj() {
      const q = pas.valeur, c = consequence(x, q);
      gain.replaceChildren("+", medailles(q * unit));
      note.className = "consequence " + c.cls; note.textContent = c.texte;
      btn.className = "btn-vendre " + (c.cls === "ok" ? "btn-principal" : "btn-second") + (c.cls === "danger" ? " dernier" : "");
      btn.textContent = c.cls === "danger" ? "Tout vendre" : "Vendre";
    }
    maj();
    btn.addEventListener("click", () => vendre(x, pas.valeur, btn));
    return el("article", { class: "ligne-objet", style: { "--c": `var(--${x.o.rarete})` } },
      el("button", { type: "button", class: "mini", "aria-label": "Voir la fiche : " + x.o.nom, onclick: () => App.tiroir({ titre: x.o.nom, contenu: App.fiche(x.o, { niveau: x.eff, possede: true }) }) }, App.carte(x.o, { niveau: x.eff, equipe: equipe(n) })),
      el("div", { class: "infos" },
        el("b", { class: "nom", texte: x.o.nom }),
        el("div", { class: "pilules" },
          el("span", { class: "pilule " + x.o.rarete, texte: RARETES[x.o.rarete].nom }),
          el("span", { class: "pilule num", texte: niveauTexte(x.eff, x.max) + (x.eff >= x.max ? "" : " / +" + x.max) }),
          x.trop ? el("span", { class: "pilule trop num", texte: "+" + x.trop + " en trop" }) : null),
        el("span", { class: "mention" }, el("span", { class: "num", texte: fmt(x.copies) }), ` ${pluriel(x.copies, "exemplaire")} · `, el("span", { class: "num", texte: fmt(unit) }), " l'unité")),
      el("div", { class: "controles" }, pas.el, gain, btn),
      note);
  }

  async function vendre(x, q, btn) {
    const c = consequence(x, q), gain = q * prixVente(x.o.rarete);
    const executer = async (bouton) => {
      bouton.disabled = true;
      try {
        const r = await App.rpc("vendre", { p_numero: x.o.numero, p_quantite: q });
        qteVente.delete(x.o.numero);
        App.fermerTiroir();
        App.toast(`${q} × ${x.o.nom} ${r.restant ? "vendu" + (q > 1 ? "s" : "") : "vendu, objet retiré de ta collection"}.`, { titre: `+${fmt(r.gain)} médailles`, icone: "i-medaille" });
        await apresAction({ collection: true });
      } catch (e) { App.erreur(e); bouton.disabled = false; }
    };
    if (c.cls === "ok") return executer(btn);
    const recap = el("div", { class: "lignes recap" },
      el("div", { class: "ligne" }, el("span", { texte: "Exemplaires vendus" }), el("b", { class: "num", texte: `${q} sur ${x.copies}` })),
      el("div", { class: "ligne" }, el("span", { texte: "Gain" }), el("b", {}, "+", medailles(gain))));
    const avert = el("div", { class: "alerte " + c.cls }, icone("i-alerte"), el("p", { texte: c.texte }));
    const confirmer = el("button", { type: "button", class: c.cls === "danger" ? "btn-danger" : "btn-principal" }, c.cls === "danger" ? "Vendre le dernier exemplaire" : `Vendre ${q} ${pluriel(q, "exemplaire")}`);
    const contenu = el("div", { class: "pile" }, el("div", { class: "confirm-tete" }, el("div", { class: "mini" }, App.carte(x.o, { niveau: x.eff })), el("div", {}, el("h3", { texte: x.o.nom }), el("span", { class: "pilule " + x.o.rarete, texte: RARETES[x.o.rarete].nom }))), avert, recap);
    if (c.cls === "danger") {
      confirmer.disabled = true;
      const coche = el("input", { type: "checkbox", id: "confirme-dernier" });
      coche.addEventListener("change", () => { confirmer.disabled = !coche.checked; });
      contenu.append(el("label", { class: "case-confirm", for: "confirme-dernier" }, coche, el("span", { texte: `Je comprends que ${x.o.nom} disparaît de ma collection et qu'il faudra le reloot pour le récupérer.` })));
    }
    confirmer.addEventListener("click", () => executer(confirmer));
    App.tiroir({ titre: c.cls === "danger" ? "Vendre le dernier exemplaire ?" : "Confirmer la vente", contenu,
      pied: el("div", { class: "pied-actions" }, el("button", { type: "button", class: "btn-second", onclick: () => App.fermerTiroir() }, "Garder"), confirmer) });
  }

  function venteGroupee(enTrop) {
    const total = enTrop.reduce((s, x) => s + x.trop * prixVente(x.o.rarete), 0), nb = enTrop.reduce((s, x) => s + x.trop, 0);
    const liste = el("div", { class: "lignes" }, enTrop.map((x) => el("div", { class: "ligne" },
      el("span", {}, el("span", { class: "point-rarete", style: { "--c": `var(--${x.o.rarete})` } }), x.o.nom, " ", el("span", { class: "num mention", texte: "× " + x.trop })),
      el("b", {}, "+", el("span", { class: "num", texte: fmt(x.trop * prixVente(x.o.rarete)) })))));
    const progres = el("div", { class: "progres-vente", hidden: true, role: "status" }, el("div", { class: "jauge-niv" }, el("i", { style: { transform: "scaleX(0)" } })), el("span", { class: "num" }));
    const go = el("button", { type: "button", class: "btn-principal" }, "Tout vendre pour ", el("span", { class: "num", texte: fmt(total) }));
    const annuler = el("button", { type: "button", class: "btn-second", onclick: () => App.fermerTiroir() }, "Annuler");
    App.tiroir({ titre: "Vendre les doublons en trop", contenu: el("div", { class: "pile" },
      el("p", {}, "Tu vends ", el("b", { class: "num", texte: fmt(nb) }), ` ${pluriel(nb, "exemplaire")} au-delà des améliorations max. Tes objets restent tous MAX.`), liste, progres),
    pied: el("div", { class: "pied-actions" }, annuler, go) });
    go.addEventListener("click", async () => {
      go.disabled = true; annuler.disabled = true; progres.hidden = false;
      let gagne = 0, fait = 0;
      const barre = $("i", progres), txt = $("span", progres);
      for (const x of enTrop) {
        txt.textContent = `Vente ${fait + 1} / ${enTrop.length} · +${fmt(gagne)} médailles`;
        try { const r = await App.rpc("vendre", { p_numero: x.o.numero, p_quantite: x.trop }); gagne += r.gain || 0; }
        catch (e) { App.erreur(e); break; }
        fait++;
        barre.style.transform = "scaleX(" + fait / enTrop.length + ")";
      }
      txt.textContent = `${fait} / ${enTrop.length} vendus · +${fmt(gagne)} médailles`;
      App.toast(`${fait} ${pluriel(fait, "objet")} ${pluriel(fait, "allégé")} de leurs doublons.`, { titre: `+${fmt(gagne)} médailles`, icone: "i-medaille" });
      await apresAction({ collection: true });
      annuler.disabled = false; annuler.textContent = "Fermer"; go.hidden = true;
    });
  }

  // ======================================================================
  // TROC
  // ======================================================================
  const CIBLE = { commun: "normal", normal: "rare" };
  function rendreTroc() {
    const p = panneaux.troc;
    const cout = reglage("troc_cout", 10);
    const tete = el("div", { class: "tete-rayon" }, el("div", {}, el("h2", { texte: "Troc" }),
      el("p", { class: "sous", texte: `Donne ${cout} doublons d'une même rareté, reçois 1 objet au hasard de la rareté au-dessus. Tu peux mélanger les objets ou donner ${cout} copies du même. L'exemplaire de base reste toujours dans ta collection, et aucune médaille n'entre en jeu.` })));
    if (baseErreur) return p.replaceChildren(tete, etatErreur("Impossible de lire les règles du troc.", chargerBase));
    if (!reglages) return p.replaceChildren(tete, chargement());
    const tout = possessions();
    const dispoPar = (r) => tout.filter((x) => x.o.rarete === r && x.l.niveau > 0);
    const totalPar = (r) => dispoPar(r).reduce((s, x) => s + x.l.niveau, 0);

    const recettes = el("div", { class: "recettes", role: "radiogroup", "aria-label": "Recette de troc" }, Object.keys(CIBLE).map((r) => {
      const n = totalPar(r), c = CIBLE[r];
      return el("button", { type: "button", class: "recette", role: "radio", "aria-checked": String(troc.rarete === r), onclick: () => { if (troc.rarete !== r) { troc.rarete = r; troc.choix.clear(); rendreTroc(); } } },
        el("span", { class: "recette-flux" }, el("span", { class: "pilule " + r }, el("span", { class: "num", texte: String(cout) }), " × " + RARETES[r].nom), icone("i-fleche"), el("span", { class: "pilule " + c }, "1 " + RARETES[c].nom)),
        el("span", { class: "mention" }, el("span", { class: "num", texte: fmt(n) }), ` ${pluriel(n, "doublon")} ${adjRarete(r, n)} ${pluriel(n, "disponible")}`));
    }));

    const r = troc.rarete, cible = CIBLE[r], elig = dispoPar(r), total = totalPar(r);
    const pool = App.objets.filter((o) => o.actif && o.rarete === cible).length;
    for (const [n, c] of troc.choix) { const x = elig.find((y) => y.o.numero === n); if (!x || c <= 0) troc.choix.delete(n); else troc.choix.set(n, Math.min(c, x.l.niveau)); }

    if (total < cout) {
      return p.replaceChildren(tete, recettes, el("div", { class: "vide" },
        el("b", {}, "Il te faut ", el("span", { class: "num", texte: String(cout) }), ` doublons ${adjRarete(r, 2)}, tu en as `, el("span", { class: "num", texte: String(total) }), "."),
        "Chaque lootbox peut t'en donner. L'exemplaire de base de chaque objet ne compte pas : seules les copies en plus s'échangent. ",
        el("a", { href: "lootbox.html", texte: "Ouvrir des lootbox" })));
    }

    const somme = () => [...troc.choix.values()].reduce((s, c) => s + c, 0);
    const banc = el("div", { class: "banc", "aria-hidden": "true" });
    const progresTxt = el("b", { class: "num" });
    const baisses = el("p", { class: "consequence" });
    const btnTroc = el("button", { type: "button", class: "btn-principal" }, "Troquer");
    const steppers = new Map();
    function majTroc() {
      const s = somme();
      progresTxt.textContent = `${s} / ${cout}`;
      const copies = [];
      for (const [n, c] of troc.choix) for (let i = 0; i < c; i++) copies.push(App.objet(n));
      banc.replaceChildren(...Array.from({ length: cout }, (_, i) => copies[i]
        ? el("span", { class: "place pleine", style: { "--c": `var(--${copies[i].rarete})` } }, el("img", { src: App.image(copies[i].image), alt: "" }))
        : el("span", { class: "place" })));
      for (const x of elig) { const st = steppers.get(x.o.numero); if (st) st.borner(Math.min(x.l.niveau, st.valeur + (cout - s))); }
      const touches = elig.filter((x) => { const c = troc.choix.get(x.o.numero) || 0; return c > x.trop; });
      baisses.className = "consequence " + (touches.length ? "attention" : s ? "ok" : "");
      baisses.textContent = !s ? "Choisis tes doublons ci-dessous, ou laisse le marchand remplir pour toi." : touches.length
        ? `Améliorations en baisse pour ${touches.map((x) => x.o.nom).join(", ")}.` : "Que des doublons en trop : aucune de tes améliorations ne bouge.";
      btnTroc.disabled = s !== cout;
      btnTroc.replaceChildren(s === cout ? `Troquer contre 1 ${RARETES[cible].nom}` : `Encore ${cout - s} à choisir`);
    }
    function remplirAuto() {
      troc.choix.clear();
      let reste = cout;
      while (reste > 0) {
        let meilleur = null, score = -1;
        for (const x of elig) {
          const pris = troc.choix.get(x.o.numero) || 0, libre = x.l.niveau - pris;
          if (libre <= 0) continue;
          const sc = (x.trop - pris > 0 ? 1e6 + (x.trop - pris) : 0) + libre; // d'abord les copies en trop, puis les plus redondants
          if (sc > score) { score = sc; meilleur = x; }
        }
        if (!meilleur) break;
        troc.choix.set(meilleur.o.numero, (troc.choix.get(meilleur.o.numero) || 0) + 1);
        reste--;
      }
      rendreTroc();
    }
    const lignes = elig.sort((a, b) => b.trop - a.trop || b.l.niveau - a.l.niveau || a.o.numero - b.o.numero).map((x) => {
      const n = x.o.numero;
      const st = stepper({ min: 0, max: x.l.niveau, valeur: troc.choix.get(n) || 0, libelle: "Doublons de " + x.o.nom + " à donner", surChange: (v) => { if (v) troc.choix.set(n, v); else troc.choix.delete(n); majTroc(); } });
      steppers.set(n, st);
      return el("article", { class: "ligne-objet troc", style: { "--c": `var(--${x.o.rarete})` } },
        el("button", { type: "button", class: "mini", "aria-label": "Voir la fiche : " + x.o.nom, onclick: () => App.tiroir({ titre: x.o.nom, contenu: App.fiche(x.o, { niveau: x.eff, possede: true }) }) }, App.carte(x.o, { niveau: x.eff })),
        el("div", { class: "infos" }, el("b", { class: "nom", texte: x.o.nom }),
          el("div", { class: "pilules" }, el("span", { class: "pilule num", texte: niveauTexte(x.eff, x.max) }), x.trop ? el("span", { class: "pilule trop num", texte: "+" + x.trop + " en trop" }) : null),
          el("span", { class: "mention" }, el("span", { class: "num", texte: fmt(x.l.niveau) }), ` ${pluriel(x.l.niveau, "doublon")} ${pluriel(x.l.niveau, "échangeable")}`)),
        el("div", { class: "controles" }, st.el));
    });
    btnTroc.addEventListener("click", () => confirmerTroc(cout, cible, pool));
    const atelier = el("div", { class: "panneau-b atelier" },
      el("div", { class: "atelier-tete" },
        el("div", {}, el("span", { class: "mention", texte: "Doublons choisis" }), el("div", { class: "progres-troc" }, progresTxt)),
        el("div", { class: "atelier-actions" },
          el("button", { type: "button", class: "btn-second", onclick: remplirAuto }, "Remplir automatiquement"),
          el("button", { type: "button", class: "btn-second", onclick: () => { troc.choix.clear(); rendreTroc(); } }, "Vider"))),
      banc, baisses,
      el("div", { class: "atelier-pied" }, el("span", { class: "mention" }, `1 ${RARETES[cible].nom.toLowerCase()} au hasard parmi `, el("span", { class: "num", texte: String(pool) }), " objets"), btnTroc));
    p.replaceChildren(tete, recettes, atelier, el("div", { class: "liste-objets" }, lignes));
    majTroc();
  }

  function confirmerTroc(cout, cible, pool) {
    const donnes = [];
    for (const [n, c] of troc.choix) for (let i = 0; i < c; i++) donnes.push(n);
    if (donnes.length !== cout) return;
    const resume = el("div", { class: "lignes" }, [...troc.choix].map(([n, c]) => {
      const o = App.objet(n), l = ctx.inventaire.get(n), max = maxDe(o), avant = Math.min(l.niveau, max), apres = Math.min(l.niveau - c, max);
      return el("div", { class: "ligne" }, el("span", {}, o.nom, " ", el("span", { class: "num mention", texte: "× " + c })),
        el("b", { class: "num" + (apres < avant ? " negatif" : "") , texte: apres < avant ? `+${avant} → +${apres}` : niveauTexte(avant, max) }));
    }));
    const lancer = el("button", { type: "button", class: "btn-principal" }, "Lancer le troc");
    const t = App.tiroir({ titre: "Troc", contenu: el("div", { class: "pile" },
      el("div", { class: "recette-grande" }, el("span", { class: "pilule " + troc.rarete }, el("span", { class: "num", texte: String(cout) }), " × " + RARETES[troc.rarete].nom), icone("i-fleche"),
        el("div", { class: "dos mini-dos", style: { "--c": `var(--${cible})` } }, el("b", { texte: "?" })), el("span", { class: "pilule " + cible }, "1 " + RARETES[cible].nom)),
      el("p", {}, "Le marchand tire 1 objet ", el("b", { texte: RARETES[cible].nom }), " au hasard parmi ", el("span", { class: "num", texte: String(pool) }), ". Ce que tu donnes :"),
      resume),
    pied: el("div", { class: "pied-actions" }, el("button", { type: "button", class: "btn-second", onclick: () => App.fermerTiroir() }, "Annuler"), lancer) });
    lancer.addEventListener("click", async () => {
      if (sonsOk()) App.sons.demarrer();
      lancer.disabled = true; lancer.textContent = "Le marchand fouille…";
      try {
        const res = await App.rpc("troquer", { p_numeros: donnes });
        troc.choix.clear();
        apresAction({ collection: true });
        await reveler(t, res, { suspense: true, titre: "Troc conclu", actions: [
          el("button", { type: "button", class: "btn-principal", onclick: () => App.fermerTiroir() }, "Super"),
          el("button", { type: "button", class: "btn-second", onclick: () => { App.fermerTiroir(); ouvrir("troc", true); } }, "Troquer encore")] });
      } catch (e) { App.erreur(e); lancer.disabled = false; lancer.textContent = "Lancer le troc"; }
    });
  }

  // ======================================================================
  // JOURNAL
  // ======================================================================
  async function chargerJournal() {
    journalSale = false;
    const p = panneaux.journal;
    if (!journal) p.replaceChildren(teteJournal(), chargement());
    try { journal = await App.api.journal(ctx.joueur.id); rendreJournal(); }
    catch (e) { console.error(e); journalSale = true; p.replaceChildren(teteJournal(), etatErreur("Impossible de charger ton journal.", chargerJournal)); }
  }
  function teteJournal() {
    return el("div", { class: "tete-rayon" }, el("div", {}, el("h2", { texte: "Journal" }), el("p", { class: "sous", texte: "Tes 30 dernières opérations chez le marchand. Il n'est visible que par toi." })));
  }
  function decrire(j) {
    const d = j.detail || {};
    const q = Number(d.quantite) || 1;
    switch (j.operation) {
      case "achat":
        if (d.article === "objet") return { ic: "i-boutique", titre: "Achat à l'étal", objet: d.nom || "Objet n°" + d.numero, rarete: d.rarete };
        if (d.article === "lootbox") return { ic: "i-coffre-ligne", titre: `Achat de ${q} lootbox` };
        return { ic: "i-ticket", titre: q > 1 ? `Achat de ${q} tickets de reset` : "Achat d'un ticket de reset" };
      case "vente": return { ic: "i-medaille", titre: `Vente de ${q} ${pluriel(q, "exemplaire")}`, objet: d.nom, rarete: d.rarete };
      case "troc": return { ic: "i-cartes", titre: `Troc de ${(d.donnes || []).length} doublons`, objet: d.nom ? "→ " + d.nom : null, rarete: d.rarete };
      case "reset": return { ic: "i-profil", titre: `Reset de stats · ${fmt(d.points || 0)} points rendus` };
      default: return { ic: "i-livre", titre: j.operation };
    }
  }
  function rendreJournal() {
    const p = panneaux.journal;
    if (!journal.length) return p.replaceChildren(teteJournal(), el("div", { class: "vide" }, el("b", { texte: "Aucune opération pour l'instant." }),
      "Ton premier achat, ta première vente ou ton premier troc apparaîtra ici. ", el("button", { type: "button", class: "lien-max", onclick: () => ouvrir("etal", true) }, "Voir l'étal du moment")));
    p.replaceChildren(teteJournal(), el("ol", { class: "journal" }, journal.map((j) => {
      const x = decrire(j), m = j.medailles || 0;
      return el("li", { class: "entree" },
        el("span", { class: "entree-ic" }, icone(x.ic)),
        el("div", { class: "entree-texte" }, el("b", { texte: x.titre }),
          x.objet ? el("span", {}, x.rarete ? el("span", { class: "point-rarete", style: { "--c": `var(--${x.rarete})` } }) : null, x.objet) : null,
          el("time", { datetime: j.cree_le, title: date(j.cree_le, true), texte: ilYa(j.cree_le) })),
        el("span", { class: "delta num " + (m > 0 ? "plus" : m < 0 ? "moins" : "nul") }, m ? (m > 0 ? "+" : "−") + fmt(Math.abs(m)) : "—", m ? icone("i-medaille") : null));
    })));
  }

  // ---------- Compteurs d'onglets ----------
  function majCompte(id, n) {
    const b = $("#tab-" + id + " .compte");
    if (!b) return;
    b.hidden = !n; b.textContent = n; b.title = n + " doublons en trop";
  }

  // ---------- Chargement ----------
  async function chargerBase() {
    baseErreur = null;
    try {
      const [p, r, c, v] = await Promise.all([App.api.prixBoutique(), App.api.reglagesBoutique(), App.api.lootboxRaretes().catch(() => null), App.api.vitrine(ctx.joueur.id).catch(() => [])]);
      prix = Object.fromEntries(p.map((x) => [x.rarete, x]));
      reglages = Object.fromEntries(r.map((x) => [x.cle, x.valeur]));
      chances = c; vitrine = new Set((v || []).map((x) => x.item_numero));
    } catch (e) { baseErreur = e; console.error(e); }
    rendreLootbox(); rendreVendre(); rendreTroc();
  }

  rendreEtal(); rendreLootbox(); rendreVendre(); rendreTroc();
  ouvrir(location.hash.slice(1) || "etal", false);
  if (location.hash) requestAnimationFrame(() => liste.scrollIntoView({ block: "nearest" }));
  await Promise.all([chargerEtal(), chargerBase()]);
});
})();
