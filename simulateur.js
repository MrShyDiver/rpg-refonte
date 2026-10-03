"use strict";
/* Simulateur (réservé à MrShyDiver, même verrou que la recette) : des builds tirés au hasard dans le
   catalogue s'affrontent avec le moteur du serveur (moteur-bac.js) ; on en tire, pour chaque objet,
   son taux de victoire et la puissance que la formule lui attribue. Les simulations ne sont pas enregistrées.
   Mode « à l'essai » : les objets du brouillon de patchnote (modifiables ici, un clic sur une ligne) et les règles
   à l'essai (PV de base, puissance par budget) remplacent ceux du jeu, sans rien changer pour les joueurs. */
(function () {
const { el, fmt, RARETES, SLOTS, rangRarete } = App;
const COL = { weapon: "arme", offhand: "offhand", torso: "armure", strategeme: "strategeme" };
const STATS = ["atk", "def", "pv", "spd", "luck"];
const ECART_COMPARABLE = 0.15; // deux builds sont « de puissance comparable » à 15 % près
const LOT = 40;                // duels simulés entre deux rafraîchissements de l'écran

App.demarrer("simulateur", async (main, ctx) => {
  const refus = () => main.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Page introuvable." }), el("a", { class: "btn-second", href: "lootbox.html", texte: "Retour au jeu" })));
  if (!App.estRecetteur(ctx.joueur)) return refus();
  // Objets à l'essai (brouillon du patchnote). L'appel sert aussi de verrou : le serveur refuse tout autre compte.
  let essai = new Map();
  const chargerEssai = (B) => { essai = new Map((B.objets || []).map((x) => [x.numero, x.data])); };
  try { chargerEssai(await App.rpc("patchnote_brouillon")); } catch (e) { return refus(); }

  const objets = App.objets.filter((o) => o.actif && COL[o.slot]);
  const parSlot = Object.fromEntries(Object.keys(COL).map((s) => [s, objets.filter((o) => o.slot === s)]));
  const f = { source: essai.size ? "essai" : "ligne", duels: 4000, points: 40, niveau: "moitie", slot: "tout", tri: "taux", sens: -1 };
  const aLEssai = () => f.source === "essai";
  const donnees = (o) => (aLEssai() && essai.get(o.numero)) || o.data; // données de l'objet selon le catalogue choisi
  const vue = (o) => (donnees(o) === o.data ? o : { ...o, data: donnees(o) });
  let res = null, enCours = false, arret = false;

  const niveauDe = (o, mode = f.niveau) => { const m = App.niveauMax(o.rarete); return mode === "max" ? m : mode === "moitie" ? Math.round(m / 2) : 0; };
  const piece = (o) => (o ? { data: donnees(o), niveau: niveauDe(o), numero: o.numero } : null);
  const tirer = (l) => l[Math.floor(Math.random() * l.length)];
  const joueur = (login, stacks, equipement) => ({ login, display_name: login, avatar_url: null, stacks, equipement, infos: {} });
  function buildAuHasard(login) {
    const arme = tirer(parSlot.weapon), deuxMains = arme.data.hand === "two_handed";
    const poids = STATS.map(() => Math.random()), somme = poids.reduce((a, b) => a + b, 0);
    const stacks = Object.fromEntries(STATS.map((k, i) => [k, Math.round((f.points * poids[i]) / somme)]));
    const objetsBuild = [arme, deuxMains ? null : tirer(parSlot.offhand), tirer(parSlot.torso), tirer(parSlot.strategeme)].filter(Boolean);
    return { entree: joueur(login, stacks, Object.fromEntries(objetsBuild.map((o) => [COL[o.slot], piece(o)]))), objets: objetsBuild };
  }
  // Puissance propre d'un objet : ce qu'il ajoute, équipé seul, à un personnage sans points investis.
  const SANS = { atk: 0, def: 0, pv: 0, spd: 0, luck: 0 };
  const puissanceNue = MoteurDuel.construireCombattant(joueur("x", SANS, {})).powerBrut;
  // À l'essai : son budget (rareté et amélioration), puisque la puissance à l'essai est la somme des budgets.
  const puissanceDe = (o) => Math.round(aLEssai() ? budgetObjet(donnees(o), niveauDe(o)) : MoteurDuel.construireCombattant(joueur("x", SANS, { [COL[o.slot]]: piece(o) })).powerBrut - puissanceNue);

  // ---------- En-tête et réglages ----------
  const groupe = (lib, cle, choix) => el("div", { class: "sim-reglage" }, el("span", { class: "mention", texte: lib }),
    el("div", { class: "onglets-b", role: "group", "aria-label": lib }, choix.map(([v, t]) => el("button", { type: "button", "data-c": cle, "data-v": String(v), onclick: () => { if (enCours) return; f[cle] = v; majReglages(); if (cle === "source") rendre(); }, texte: t }))));
  const lancer = el("button", { type: "button", class: "btn-principal rc-lancer", onclick: () => (enCours ? (arret = true) : simuler()) });
  const exporter = el("button", { type: "button", class: "btn-second", hidden: true, onclick: () => exporterCsv() }, "Exporter en CSV");
  const barre = el("i"), progres = el("div", { class: "jauge-niv sim-progres", hidden: true }, barre), etatTxt = el("p", { class: "mention", "aria-live": "polite" });
  const chiffres = el("div", { class: "grille-chiffres" }), zone = el("div");
  const noteEssai = el("p", { class: "mention sim-essai" });
  const reglages = el("div", { class: "panneau-b sim-reglages" },
    groupe("Catalogue et règles", "source", [["ligne", "En ligne"], ["essai", "À l'essai"]]),
    groupe("Duels simulés", "duels", [[1000, "1 000"], [4000, "4 000"], [12000, "12 000"], [40000, "40 000"]]),
    groupe("Points de stats par joueur", "points", [[0, "0"], [20, "20"], [40, "40"], [80, "80"], [150, "150"]]),
    groupe("Amélioration des objets", "niveau", [["base", "Base (+0)"], ["moitie", "À mi-chemin"], ["max", "Au max"]]),
    noteEssai, el("div", { class: "sim-lancer" }, lancer, exporter, progres, etatTxt));
  const onglets = el("div", { class: "onglets-b defile", role: "group", "aria-label": "Emplacement" },
    [["tout", "Tout"], ...Object.entries(SLOTS).map(([k, s]) => [k, s.pluriel])].map(([k, t]) => el("button", { type: "button", "data-c": "slot", "data-v": k, onclick: () => { f.slot = k; majReglages(); rendre(); }, texte: t })));
  main.append(
    el("header", { class: "entete-page" }, el("div", {}, el("h1", { texte: "Simulateur" }),
      el("p", { texte: `Des builds tirés au hasard dans les ${objets.length} objets du catalogue s'affrontent avec le moteur du site (${MoteurDuel.VERSION_MOTEUR}). Les deux joueurs ont le même nombre de points, répartis au hasard, et des objets au même stade d'amélioration. Les simulations ne sont pas enregistrées.` }))),
    reglages, chiffres, el("section", { class: "section-page" }, onglets, zone));

  function majReglages() {
    for (const b of main.querySelectorAll("[data-c]")) b.setAttribute("aria-pressed", String(String(f[b.dataset.c]) === b.dataset.v));
    lancer.textContent = enCours ? "Arrêter" : res ? "Relancer la simulation" : "Lancer la simulation";
    exporter.hidden = !res || enCours;
    noteEssai.textContent = aLEssai()
      ? `À l'essai : ${essai.size} objet${essai.size > 1 ? "s" : ""} modifié${essai.size > 1 ? "s" : ""}, ${REGLES_ESSAI.BASE_PV} PV de base, puissance par budget (${BUDGET.POINT} par point, ${BUDGET.POINT_PV} en PV). Clique une ligne du tableau pour modifier un objet.`
      : `En ligne : les objets et les règles que voient les joueurs (${MoteurDuel.CST.BASE_PV} PV de base, puissance par la formule). ${essai.size} objet${essai.size > 1 ? "s" : ""} modifié${essai.size > 1 ? "s" : ""} à l'essai.`;
  }

  // ---------- Simulation, par petits lots pour laisser l'écran respirer ----------
  async function simuler() {
    enCours = true; arret = false; majReglages(); progres.hidden = false;
    const stat = new Map(objets.map((o) => [o.numero, { n: 0, v: 0, nc: 0, vc: 0 }]));
    const tot = { n: 0, tours: 0, attaquant: 0, fort: 0, nFort: 0, comparables: 0 };
    const duels = []; // [ln(puissance A / puissance B), gain de A, objets de A, objets de B] : sert au calcul « à puissance égale »
    // Règles à l'essai : appliquées au moteur du navigateur le temps de la simulation, puis remises (le jeu en ligne n'est pas touché).
    const essaiActif = aLEssai(), pvBaseEnLigne = MoteurDuel.CST.BASE_PV;
    const budgetDe = (x) => puissanceBudget(x.entree.stacks, Object.values(x.entree.equipement));
    if (essaiActif) MoteurDuel.CST.BASE_PV = REGLES_ESSAI.BASE_PV;
    try {
    for (let k = 0; k < f.duels && !arret; k++) {
      const a = buildAuHasard("a"), b = buildAuHasard("b");
      const r = MoteurDuel.simulerDuel(a.entree, b.entree, { seed: Math.floor(Math.random() * 4294967296), mode: "entrainement" });
      const pa = essaiActif ? budgetDe(a) : r.stats.power_attaquant, pb = essaiActif ? budgetDe(b) : r.stats.power_defenseur, comparable = Math.abs(pa - pb) / Math.max(1, Math.min(pa, pb)) <= ECART_COMPARABLE;
      const gainA = r.vainqueur === "attaquant" ? 1 : r.vainqueur === null ? 0.5 : 0;
      tot.n++; tot.tours += r.replay.rounds.length ? r.replay.rounds[r.replay.rounds.length - 1].tour : 0; tot.attaquant += gainA;
      if (comparable) tot.comparables++;
      if (pa > 0 && pb > 0) duels.push([Math.log(pa / pb), gainA, a.objets, b.objets]);
      if (pa !== pb) { tot.nFort++; tot.fort += pa > pb ? gainA : 1 - gainA; }
      for (const [x, gain] of [[a, gainA], [b, 1 - gainA]]) for (const o of x.objets) {
        const s = stat.get(o.numero); s.n++; s.v += gain;

      }
      if (k % LOT === LOT - 1) {
        barre.style.width = ((k + 1) / f.duels) * 100 + "%"; etatTxt.textContent = `${fmt(k + 1)} duels sur ${fmt(f.duels)}…`;
        await new Promise((ok) => setTimeout(ok, 0));
      }
    }
    } finally { MoteurDuel.CST.BASE_PV = pvBaseEnLigne; }
    // À puissance égale : on ajuste d'abord, sur tous les duels, la chance de gagner selon le rapport des puissances
    // (courbe logistique à une pente, méthode de Newton), puis on mesure pour chaque objet l'écart entre ses
    // victoires réelles et celles que sa puissance annonçait. 50 % = l'objet vaut exactement sa puissance.
    let pente = 3;
    for (let i = 0; i < 25 && duels.length; i++) {
      let g1 = 0, g2 = 0;
      for (const [x, g] of duels) { const p = 1 / (1 + Math.exp(-pente * x)); g1 += (g - p) * x; g2 += p * (1 - p) * x * x; }
      if (g2 < 1e-9) break;
      pente = Math.max(0, Math.min(60, pente + g1 / g2));
    }
    for (const [x, g, oa, ob] of duels) {
      const attendu = 1 / (1 + Math.exp(-pente * x));
      for (const [liste, ecart] of [[oa, g - attendu], [ob, attendu - g]]) for (const o of liste) { const s = stat.get(o.numero); s.nc++; s.vc += 0.5 + ecart; }
    }
    res = { stat, tot, reglages: { ...f }, puissances: new Map(objets.map((o) => [o.numero, puissanceDe(o)])) };
    enCours = false; progres.hidden = true; barre.style.width = "0";
    etatTxt.textContent = arret ? `Arrêté après ${fmt(tot.n)} duels.` : `${fmt(tot.n)} duels simulés.`;
    majReglages(); rendre();
  }

  // ---------- Résultats ----------
  const pct = (v, n) => (n ? (100 * v) / n : null);
  const marge = (v, n) => { if (!n) return 0; const p = v / n; return 196 * Math.sqrt((p * (1 - p)) / n); }; // intervalle à 95 %
  const COLONNES = [
    ["nom", "Objet", (o) => o.nom.toLowerCase(), 1],
    ["slot", "Emplacement", (o) => SLOTS[o.slot].nom, 1],
    ["puissance", "Puissance de l'objet", (o, s, R) => R.puissances.get(o.numero), -1],
    ["n", "Duels", (o, s) => s.n, -1],
    ["taux", "Victoires", (o, s) => pct(s.v, s.n) ?? -1, -1],
    ["tauxc", "À puissance égale", (o, s) => pct(s.vc, s.nc) ?? -1, -1],
  ];
  function verdict(t, m) {
    if (t === null) return ["—", ""];
    if (t - m > 55) return ["Trop fort", "hausse"];
    if (t + m < 45) return ["Trop faible", "baisse"];
    return ["Dans la norme", ""];
  }
  function rendre() {
    if (!res) { zone.replaceChildren(el("div", { class: "vide vide-large" }, el("b", { texte: "Aucune simulation pour l'instant" }), "Choisis tes réglages puis lance la simulation : le tableau des objets s'affichera ici.")); return; }
    const { stat, tot } = res;
    chiffres.replaceChildren(
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(tot.n) }), el("span", { texte: "Duels simulés" }), el("small", { texte: `${fmt(tot.n ? tot.tours / tot.n : 0, 1)} tours en moyenne` })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(pct(tot.attaquant, tot.n) || 0, 1) + " %" }), el("span", { texte: "Victoires de l'attaquant" }), el("small", { texte: "50 % = aucun avantage à attaquer" })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(pct(tot.fort, tot.nFort) || 0, 1) + " %" }), el("span", { texte: "Le plus puissant gagne" }), el("small", { texte: "Plus c'est haut, plus la puissance prédit bien" })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(pct(tot.comparables, tot.n) || 0, 0) + " %" }), el("span", { texte: "Duels à puissance comparable" }), el("small", { texte: `Écart de ${Math.round(ECART_COMPARABLE * 100)} % au plus` })));
    const col = COLONNES.find((c) => c[0] === f.tri) || COLONNES[4];
    const lignes = objets.filter((o) => f.slot === "tout" || o.slot === f.slot)
      .sort((a, b) => { const x = col[2](a, stat.get(a.numero), res), y = col[2](b, stat.get(b.numero), res); return (x < y ? -1 : x > y ? 1 : 0) * f.sens || rangRarete(b.rarete) - rangRarete(a.rarete) || a.nom.localeCompare(b.nom, "fr"); });
    const cellule = (v, n) => {
      const t = pct(v, n);
      if (t === null) return el("td", { texte: "—" });
      return el("td", {}, el("div", { class: "sim-taux" }, el("b", { class: "num", texte: fmt(t, 1) + " %" }), el("span", { class: "mention num", texte: "± " + fmt(marge(v, n), 1) }),
        el("div", { class: "jauge-niv", "aria-hidden": "true" }, el("i", { style: { width: Math.max(0, Math.min(100, t)) + "%" } }))));
    };
    zone.replaceChildren(el("div", { class: "table-defile", tabindex: "0", role: "region", "aria-label": "Résultats par objet" },
      el("table", { class: "table-objets sim-table" },
        el("thead", {}, el("tr", {}, COLONNES.map(([id, titre, , sensDefaut]) => el("th", { scope: "col", "aria-sort": f.tri === id ? (f.sens > 0 ? "ascending" : "descending") : null },
          el("button", { type: "button", class: "sim-tri", onclick: () => { if (f.tri === id) f.sens = -f.sens; else { f.tri = id; f.sens = sensDefaut; } rendre(); } }, titre, f.tri === id ? (f.sens > 0 ? " ▲" : " ▼") : ""))),
          el("th", { scope: "col", texte: "Verdict" }))),
        el("tbody", {}, lignes.map((o) => {
          const s = stat.get(o.numero), [mot, cls] = verdict(pct(s.vc, s.nc), marge(s.vc, s.nc));
          return el("tr", { style: { "--c": `var(--${o.rarete})` }, onclick: () => ouvrirObjet(o) },
            el("th", { scope: "row" }, el("span", { class: "nom-objet" }, o.nom, essai.has(o.numero) ? el("span", { class: "sim-modifie", texte: "modifié" }) : null), el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom + (niveauDe(o) ? " · +" + niveauDe(o) : "") })),
            el("td", { texte: SLOTS[o.slot].nom }),
            el("td", { class: "num", texte: (res.puissances.get(o.numero) > 0 ? "+" : "") + fmt(res.puissances.get(o.numero)) }),
            el("td", { class: "num", texte: fmt(s.n) }),
            cellule(s.v, s.n), cellule(s.vc, s.nc),
            el("td", {}, el("span", { class: "sim-verdict " + cls, texte: mot })));
        })))),
      el("p", { class: "mention sim-note", texte: "Victoires : part des duels gagnés par les builds qui portent l'objet (50 % = objet neutre). « À puissance égale » retire l'effet de l'écart de puissance : la simulation mesure d'abord combien un écart de puissance fait gagner, puis compare les victoires de l'objet à ce que sa puissance annonçait. Un objet au-dessus de 50 % vaut plus que sa puissance, en dessous il vaut moins. ± : marge d'erreur à 95 %, elle se resserre avec plus de duels. Verdict : trop fort au-dessus de 55 % à puissance égale, trop faible sous 45 %, marge comprise." }));
  }

  // ---------- Fiche et éditeur d'un objet à l'essai ----------
  // Tous les champs numériques de l'objet (y compris ceux des passifs secondaires et des modes de tir) sont modifiables.
  // Enregistrer écrit dans le brouillon du patchnote : rien ne change pour les joueurs avant la publication.
  function ouvrirObjet(o) {
    const enLigne = App.patch.aplatir(o.data), base = essai.get(o.numero) || o.data, feuilles = [...App.patch.aplatir(base)].filter(([, v]) => typeof v === "number");
    let tout = false;
    const champs = el("div", { class: "ed-champs" }), saisies = new Map();
    const afficher = () => champs.replaceChildren(...feuilles.filter(([k, v]) => tout || v !== 0 || Number(enLigne.get(k) || 0) !== 0 || saisies.has(k)).map(([k, v]) => {
      const ligne = Number(enLigne.get(k) || 0);
      const input = saisies.get(k) || el("input", { type: "number", step: "any", inputmode: "decimal", value: String(v), "aria-label": App.patch.libelle(k, base)[0] });
      saisies.set(k, input);
      const etiquette = el("label", { class: "ed-champ" + (Number(input.value) !== ligne ? " change" : "") }, App.patch.libelle(k, base)[0], input, el("small", { texte: Number(input.value) !== ligne ? "En ligne : " + App.nombre(ligne) : "" }));
      input.oninput = () => { const diff = Number(input.value) !== ligne; etiquette.classList.toggle("change", diff); etiquette.lastChild.textContent = diff ? "En ligne : " + App.nombre(ligne) : ""; };
      return etiquette;
    }));
    const plus = el("button", { type: "button", class: "btn-second", texte: "Afficher aussi les champs à zéro", onclick: () => { tout = !tout; plus.textContent = tout ? "Masquer les champs à zéro" : "Afficher aussi les champs à zéro"; afficher(); } });
    const appliquer = async (data, message) => {
      try { chargerEssai(await App.rpc("patchnote_enregistrer_objet", { p_numero: o.numero, p_data: data })); App.toast(message, { type: "succes" }); majReglages(); rendre(); ouvrirObjet(o); }
      catch (e) { App.erreur(e); }
    };
    const enregistrer = el("button", { type: "button", class: "btn-principal", texte: "Enregistrer à l'essai" });
    enregistrer.onclick = () => {
      const data = JSON.parse(JSON.stringify(base));
      for (const [k, input] of saisies) {
        const v = Number(input.value);
        if (input.value.trim() === "" || !Number.isFinite(v)) return App.toast("Chaque champ doit contenir un nombre.", { type: "erreur" });
        const chemin = k.split("."), dernier = chemin.pop();
        chemin.reduce((x, c) => x[c], data)[dernier] = v;
      }
      appliquer(data, o.nom + " : enregistré à l'essai.");
    };
    const retablir = essai.has(o.numero) ? el("button", { type: "button", class: "btn-second", texte: "Rétablir l'objet en ligne", onclick: () => appliquer(null, o.nom + " : objet en ligne rétabli.") }) : null;
    const modifie = essai.has(o.numero) ? App.patch.objets([{ numero: o.numero, nom: o.nom, slot: o.slot, rarete: o.rarete, avant: o.data, apres: essai.get(o.numero) }]) : null;
    afficher();
    App.tiroir({ titre: o.nom, contenu: el("div", {}, App.fiche(vue(o), { niveau: niveauDe(o) }),
      el("section", { class: "ed" }, el("h4", { texte: "Modifier à l'essai" }),
        el("p", { class: "mention", texte: "Les joueurs gardent l'objet en ligne tant que tu n'as pas publié depuis l'atelier patchnote. La fiche ci-dessus montre l'objet " + (aLEssai() ? "à l'essai." : "en ligne (catalogue choisi dans les réglages).") }),
        modifie, champs, el("div", { class: "at-actions" }, enregistrer, retablir, plus))) });
  }

  // Export : une ligne par objet, avec les réglages de la simulation rappelés sur chaque ligne.
  function exporterCsv() {
    const { stat, tot, reglages: g, puissances } = res;
    const d = (x, n = 2) => (x === null ? "" : x.toFixed(n)), champ = (v) => /[";\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const lignes = [["numero", "objet", "emplacement", "rarete", "amelioration", "puissance_objet", "duels", "victoires_pct", "marge_pct", "duels_comparables", "victoires_comparables_pct", "marge_comparables_pct", "verdict",
      "moteur", "duels_simules", "points_par_joueur", "niveau_objets", "tours_moyens", "attaquant_gagne_pct", "plus_puissant_gagne_pct", "catalogue"]];
    for (const o of objets) {
      const s = stat.get(o.numero), t = pct(s.v, s.n);
      lignes.push([o.numero, o.nom, SLOTS[o.slot].nom, o.rarete, niveauDe(o, g.niveau), puissances.get(o.numero), s.n, d(t), d(marge(s.v, s.n)), s.nc, d(pct(s.vc, s.nc)), d(marge(s.vc, s.nc)), verdict(pct(s.vc, s.nc), marge(s.vc, s.nc))[0],
        MoteurDuel.VERSION_MOTEUR, tot.n, g.points, g.niveau, d(tot.n ? tot.tours / tot.n : 0), d(pct(tot.attaquant, tot.n)), d(pct(tot.fort, tot.nFort)), g.source === "essai" ? "a_l_essai" : "en_ligne"]);
    }
    const lien = el("a", { href: URL.createObjectURL(new Blob(["\ufeff" + lignes.map((l) => l.map(champ).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" })),
      download: `simulation-${g.source === "essai" ? "essai-" : ""}${g.points}pts-${g.niveau}-${tot.n}duels.csv` });
    document.body.append(lien); lien.click(); lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
  }

  majReglages(); rendre();
});
})();
