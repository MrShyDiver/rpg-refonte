"use strict";
/* Arsenal : encyclopédie de tous les objets, en cartes ou en tableau comparatif. */
(function () {
const { el, icone, fmt, nombre, RARETES, ORDRE_RARETE, SLOTS, STATS, EFFETS, rangRarete } = App;
const COLS = ["arme", "offhand", "armure", "strategeme"];
const TRIS = [["numero", "Numéro"], ["rarete", "Rareté"], ["degats", "Dégâts max"]];
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const basculer = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
// ponytail: lootbox_sets n'est pas exposé par App.api ; repli sur la valeur du SQL (Sekiro ×3).
const PLURIEL = { commun: "communs", normal: "normaux", rare: "rares", epique: "épiques", legendaire: "légendaires" };
const SETS_DEFAUT = [{ set_nom: "Sekiro", multiplicateur: 3 }];

App.demarrer("arsenal", async (main, ctx) => {
  const p = new URLSearchParams(location.search);
  const liste = (k, ok) => new Set((p.get(k) || "").split(",").filter(ok));
  const f = {
    vue: p.get("vue") === "tableau" ? "tableau" : "cartes",
    niv: p.get("niv") === "max" ? "max" : "base",
    slot: SLOTS[p.get("slot")] ? p.get("slot") : "tout",
    raretes: liste("rarete", (r) => RARETES[r]),
    effets: liste("effet", (e) => EFFETS.some(([id]) => id === e)),
    q: p.get("q") || "",
    tri: TRIS.some(([t]) => t === p.get("tri")) ? p.get("tri") : "numero",
  };
  let objetOuvert = null;

  // Données communautaires : chargées en fond, attendues seulement par le tiroir.
  const donnees = Promise.all([
    App.api.inventaires(), App.api.loadouts(), App.api.lootboxRaretes(), App.api.prixBoutique(), App.api.reglagesBoutique(),
    App.api.lootboxSets ? App.api.lootboxSets() : SETS_DEFAUT,
  ]).then(([inventaires, loadouts, raretes, prix, reglages, sets]) => ({ inventaires, loadouts, raretes, prix, reglages, sets }));
  donnees.catch(() => {});

  const tous = App.objets.filter((o) => o.actif);
  const effetsDe = new Map(tous.map((o) => [o.numero, App.effetsDe(o)]));
  const max = (o) => App.niveauMax(o.rarete);
  const lvl = (o) => (f.niv === "max" ? max(o) : 0);
  const possede = (o) => ctx.inventaire.get(o.numero);
  const nivPossede = (o) => Math.min(possede(o).niveau, max(o));
  function degats(o, n) {
    const d = App.auNiveau(o, n);
    if (d.baseDegatsMax > 0) return { min: d.baseDegatsMin, max: d.baseDegatsMax, coups: d.coupsParUsage || 1 };
    if (d.degatsDirects > 0) return { min: d.degatsDirects, max: d.degatsDirects, coups: d.coupsParUsage || 1 };
    return null;
  }
  const texteDegats = (g) => (g ? (g.min === g.max ? nombre(g.max) : nombre(g.min) + "–" + nombre(g.max)) + (g.coups > 1 ? " ×" + g.coups : "") : "—");

  // ---------- En-tête ----------
  const parRarete = (l) => ORDRE_RARETE.map((r) => [r, l.filter((o) => o.rarete === r).length]).filter(([, n]) => n);
  main.append(
    el("header", { class: "entete-page" },
      el("div", {},
        el("h1", { texte: "Arsenal" }),
        el("p", { texte: `Les ${tous.length} objets de Stream RPG avec toutes leurs valeurs, où les trouver et qui les porte. Ce que tu possèdes est marqué.` })),
      el("div", { class: "actions" }, el("a", { class: "btn-second", href: "collection.html" }, icone("i-cartes"), "Ma collection"))),
    el("div", { class: "grille-chiffres" }, Object.entries(SLOTS).map(([k, s]) => {
      const l = tous.filter((o) => o.slot === k);
      return el("div", { class: "chiffre" }, el("b", { class: "num", texte: l.length }), el("span", { texte: s.pluriel }),
        el("small", { class: "repartition" }, parRarete(l).map(([r, n]) => el("span", { style: { "--c": `var(--${r})` }, title: RARETES[r].nom }, el("i", { texte: RARETES[r].lettre }), String(n)))));
    })),
    el("p", { class: "plafonds" }, "Chaque doublon fait monter un objet d'un niveau, jusqu'à un plafond : ",
      ORDRE_RARETE.flatMap((r, i) => [i ? " · " : "", el("span", { style: { "--c": `var(--${r})` }, texte: `${RARETES[r].nom} ${RARETES[r].max}` })]), "."));

  // ---------- Barre d'outils ----------
  const bouton = (v, nom, surClic) => el("button", { type: "button", "data-v": v, onclick: surClic }, nom);
  const btnVue = [["cartes", "Cartes"], ["tableau", "Tableau"]].map(([v, n]) => bouton(v, n, () => { f.vue = v; rendre(); }));
  const btnNiv = [["base", "Base"], ["max", "Niveau max"]].map(([v, n]) => bouton(v, n, () => { f.niv = v; rendre(); }));
  const TABS = [["tout", "Tout"], ...Object.entries(SLOTS).map(([k, s]) => [k, s.pluriel])];
  const btnSlots = TABS.map(([k, nom]) => el("button", { type: "button", "data-v": k, onclick: () => { f.slot = k; rendre(); } }, nom, el("span", { class: "n num" })));
  const btnRar = ORDRE_RARETE.map((r) => el("button", { type: "button", class: "etiquette", "data-v": r, style: { "--c": `var(--${r})` }, onclick: () => { basculer(f.raretes, r); rendre(); } },
    RARETES[r].nom, el("span", { class: "n" })));
  const btnEff = EFFETS.filter(([id]) => tous.some((o) => effetsDe.get(o.numero).includes(id)))
    .map(([id, nom]) => el("button", { type: "button", class: "etiquette " + id, "data-v": id, onclick: () => { basculer(f.effets, id); rendre(); } }, nom, el("span", { class: "n" })));
  const recherche = el("input", { type: "search", placeholder: "Chercher un objet", value: f.q, "aria-label": "Chercher un objet par son nom", oninput: (e) => { f.q = e.target.value; rendre(); } });
  const tri = el("select", { "aria-label": "Trier", onchange: (e) => { f.tri = e.target.value; rendre(); } }, TRIS.map(([v, n]) => el("option", { value: v, texte: n, selected: v === f.tri })));
  const compte = el("p", { class: "compte-resultats", "aria-live": "polite" });
  const zone = el("div");

  main.append(el("section", { class: "section-page" },
    el("div", { class: "outils-objets" },
      el("div", { class: "rangee" },
        el("div", { class: "onglets-b", role: "group", "aria-label": "Affichage" }, btnVue),
        el("div", { class: "onglets-b", role: "group", "aria-label": "Niveau d'aperçu des valeurs" }, btnNiv)),
      el("div", { class: "onglets-b defile", role: "group", "aria-label": "Emplacement" }, btnSlots),
      el("div", { class: "puces", role: "group", "aria-label": "Rareté" }, btnRar),
      el("div", { class: "puces", role: "group", "aria-label": "Effets et set" }, btnEff),
      el("div", { class: "rangee" },
        el("label", { class: "champ recherche" }, icone("i-recherche"), recherche),
        el("label", { class: "champ tri" }, el("span", { texte: "Trier par" }), tri),
        compte)),
    zone));

  // ---------- Filtres, tri, rendu ----------
  const passe = (o, sauf) =>
    (sauf === "slot" || f.slot === "tout" || o.slot === f.slot)
    && (sauf === "rarete" || !f.raretes.size || f.raretes.has(o.rarete))
    && (sauf === "effet" || !f.effets.size || effetsDe.get(o.numero).some((e) => f.effets.has(e)))
    && (!f.q || norm(o.nom).includes(norm(f.q)));
  const valDeg = (o) => { const g = degats(o, lvl(o)); return g ? g.max * g.coups : -1; };
  const cle = {
    numero: (a, b) => a.numero - b.numero,
    rarete: (a, b) => rangRarete(b.rarete) - rangRarete(a.rarete) || a.numero - b.numero,
    degats: (a, b) => valDeg(b) - valDeg(a) || a.numero - b.numero,
  };

  function majUrl() {
    const q = new URLSearchParams();
    if (f.vue !== "cartes") q.set("vue", f.vue);
    if (f.niv !== "base") q.set("niv", f.niv);
    if (f.slot !== "tout") q.set("slot", f.slot);
    if (f.raretes.size) q.set("rarete", [...f.raretes].join(","));
    if (f.effets.size) q.set("effet", [...f.effets].join(","));
    if (f.q) q.set("q", f.q);
    if (f.tri !== "numero") q.set("tri", f.tri);
    if (objetOuvert) q.set("objet", objetOuvert);
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }
  function reinitialiser() {
    Object.assign(f, { slot: "tout", q: "" });
    f.raretes.clear(); f.effets.clear();
    recherche.value = "";
    rendre();
  }

  function rendre() {
    btnVue.forEach((x) => x.setAttribute("aria-pressed", String(f.vue === x.dataset.v)));
    btnNiv.forEach((x) => x.setAttribute("aria-pressed", String(f.niv === x.dataset.v)));
    btnSlots.forEach((x) => { const k = x.dataset.v; x.setAttribute("aria-pressed", String(f.slot === k)); x.lastChild.textContent = tous.filter((o) => (k === "tout" || o.slot === k) && passe(o, "slot")).length; });
    btnRar.forEach((x) => { x.setAttribute("aria-pressed", String(f.raretes.has(x.dataset.v))); x.lastChild.textContent = tous.filter((o) => o.rarete === x.dataset.v && passe(o, "rarete")).length; });
    btnEff.forEach((x) => { x.setAttribute("aria-pressed", String(f.effets.has(x.dataset.v))); x.lastChild.textContent = tous.filter((o) => effetsDe.get(o.numero).includes(x.dataset.v) && passe(o, "effet")).length; });
    majUrl();

    const vis = tous.filter((o) => passe(o)).sort(cle[f.tri]);
    compte.textContent = vis.length + (vis.length > 1 ? " objets" : " objet");
    if (!vis.length) {
      zone.replaceChildren(el("div", { class: "vide vide-large" }, el("b", { texte: "Aucun objet ne correspond" }), "Essaie une autre rareté, un autre effet ou un autre nom.",
        el("div", { class: "actions" }, el("button", { type: "button", class: "btn-second", onclick: reinitialiser }, "Réinitialiser les filtres"))));
      return;
    }
    zone.replaceChildren(f.vue === "tableau" ? tableau(vis) : el("div", { class: "grille-cartes" }, vis.map(caseCarte)));
  }

  const marque = (o) => (possede(o) ? el("span", { class: "possede" }, icone("i-coche"), "Possédé · niv. " + (nivPossede(o) >= max(o) ? "MAX" : nivPossede(o))) : null);

  function caseCarte(o) {
    return el("div", { class: "case-carte" },
      el("button", { type: "button", class: "zone", onclick: () => ouvrir(o) }, App.carte(o, { niveau: null, fait: App.faitMarquant(o, lvl(o)) })),
      el("div", { class: "meta-carte" }, marque(o) || el("span", { texte: RARETES[o.rarete].nom })));
  }

  function tableau(vis) {
    const th = (t) => el("th", { scope: "col", texte: t });
    return el("div", { class: "table-defile", tabindex: "0", role: "region", "aria-label": "Tableau comparatif des objets" },
      el("table", { class: "table-objets" },
        el("thead", {}, el("tr", {}, ["Objet", "Emplacement", "Dégâts", "Statistiques", "Effets", "Scaling"].map(th))),
        el("tbody", {}, vis.map((o) => {
          const n = lvl(o), d = App.auNiveau(o, n);
          const stats = App.lignesStats(o, n), pa = App.passifs(o, n), sc = App.scalingsDe(d);
          return el("tr", { style: { "--c": `var(--${o.rarete})` }, onclick: () => ouvrir(o) },
            el("th", { scope: "row" },
              el("button", { type: "button", class: "nom-objet" }, el("span", { class: "num-objet num", texte: "N°" + o.numero }), el("span", { texte: o.nom })),
              el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom }), marque(o)),
            el("td", { texte: App.sousTitre(o) }),
            el("td", { class: "num nowrap", texte: texteDegats(degats(o, n)) }),
            el("td", {}, stats.length ? stats.map((s) => el("div", { class: s.negatif ? "negatif" : null }, el("b", { class: "num", texte: s.valeur }), " " + s.nom)) : "—"),
            el("td", { class: "effets" }, pa.length ? pa.map((x) => el("div", { texte: x.court })) : (App.usage(o, n)[0] ? App.usage(o, n).map(([k, v]) => el("div", { texte: `${k} : ${v}` })) : "—")),
            el("td", { class: "nowrap" }, sc.length ? sc.map((s) => el("div", { class: "scal" }, el("b", { texte: s.lettre || "–" }), " " + (STATS[s.stat] || s.stat))) : "—"));
        }))));
  }

  // ---------- Tiroir ----------
  const lig = (n, v, cls) => el("div", { class: "ligne" }, el("span", { texte: n }), el("b", { class: "num " + (cls || ""), texte: v }));
  const bloc = (t, ...c) => el("section", { class: "bloc-fiche" }, el("h4", { texte: t }), ...c);
  const enAttente = () => el("div", { class: "lignes" }, el("div", { class: "ligne" }, el("span", { class: "chargement-ligne", texte: "Chargement…" })));
  const pctTxt = (x) => fmt(x * 100, x * 100 < 1 ? 2 : 1) + " %";

  function ouvrir(o) {
    const l = possede(o);
    objetOuvert = o.numero;
    majUrl();
    const ouTrouver = bloc("Où l'obtenir", enAttente());
    const communaute = bloc("Dans la communauté", enAttente());
    const contenu = [App.fiche(o, { niveau: l ? nivPossede(o) : 0, possede: !!l, curseur: true }), ouTrouver, communaute,
      o.contributeur ? bloc("Imaginé par", el("p", { class: "passif" }, el("b", { texte: o.contributeur }), ", membre de la communauté, a imaginé cet objet.")) : null];
    const pied = l
      ? [el("a", { class: "btn-principal", href: "collection.html?objet=" + o.numero }, icone("i-cartes"), "Voir dans ma collection")]
      : [el("a", { class: "btn-principal", href: "lootbox.html" + (o.rarete === "legendaire" ? "?type=legendaire" : "") }, icone("i-coffre-ligne"), "Ouvrir une lootbox")];
    App.tiroir({ titre: o.nom, contenu, pied, surFermeture: () => { objetOuvert = null; majUrl(); } });

    donnees.then((D) => {
      ouTrouver.lastChild.replaceWith(el("div", { class: "lignes" }, lignesObtention(o, D)));
      communaute.lastChild.replaceWith(el("div", { class: "lignes" }, lignesCommunaute(o, D)));
    }, () => {
      for (const s of [ouTrouver, communaute]) s.lastChild.replaceWith(el("p", { class: "mention", texte: "Indisponible pour l'instant, réessaie dans un moment." }));
    });
  }

  // Probabilité par ouverture = poids de la rareté / total × poids de l'objet / total de sa rareté (même calcul que ouvrir_lootbox).
  function chance(o, D, leg) {
    const poids = (r) => Number(leg ? r.poids_legendaire : r.poids) || 0;
    const dispo = D.raretes.filter((r) => poids(r) > 0 && tous.some((i) => i.rarete === r.rarete));
    const r = dispo.find((x) => x.rarete === o.rarete);
    if (!r) return 0;
    const mult = (i) => Number((D.sets.find((s) => s.set_nom === i.set) || {}).multiplicateur) || 1;
    const pool = tous.filter((i) => i.rarete === o.rarete);
    return (poids(r) / dispo.reduce((s, x) => s + poids(x), 0)) * (mult(o) / pool.reduce((s, i) => s + mult(i), 0));
  }

  function lignesObtention(o, D) {
    const l = [];
    for (const [leg, nom] of [[false, "Lootbox"], [true, "Lootbox légendaire"]]) {
      const c = chance(o, D, leg);
      l.push(lig(nom, c ? `${pctTxt(c)} · 1 sur ${fmt(Math.round(1 / c))}` : "Jamais", c ? "" : "eteint"));
    }
    const m = Number((D.sets.find((s) => s.set_nom === o.set) || {}).multiplicateur) || 1;
    if (m > 1) l.push(el("div", { class: "ligne note" }, el("span", { texte: `Set ${o.set} : ×${m} de chances face aux autres objets ${PLURIEL[o.rarete]}.` })));
    const bp = D.prix.find((x) => x.rarete === o.rarete);
    const pool = tous.filter((i) => i.rarete === o.rarete).length;
    if (bp && bp.en_etal > 0) l.push(lig("Boutique", `${fmt(bp.achat)} médailles · ${bp.en_etal} sur ${pool} / heure`));
    else l.push(lig("Boutique", "Jamais à l'étal", "eteint"));
    const source = { normal: "commun", rare: "normal" }[o.rarete];
    const cout = (D.reglages.find((r) => r.cle === "troc_cout") || {}).valeur;
    if (source && cout) l.push(lig("Troc", `${cout} doublons ${PLURIEL[source]} · 1 sur ${pool}`));
    if (bp) l.push(lig("Revente", `${fmt(bp.vente)} médaille${bp.vente > 1 ? "s" : ""} l'exemplaire`));
    return l;
  }

  function lignesCommunaute(o, D) {
    const joueurs = new Set(D.inventaires.map((x) => x.player_id)).size;
    const det = D.inventaires.filter((x) => x.item_numero === o.numero);
    const equipent = D.loadouts.filter((lo) => COLS.some((c) => lo[c] === o.numero)).length;
    const meilleur = det.reduce((m, x) => Math.max(m, x.niveau), -1);
    return [
      lig("Joueurs qui l'ont", det.length ? `${fmt(det.length)}${joueurs ? " · " + Math.round((det.length / joueurs) * 100) + " %" : ""}` : "Personne pour l'instant"),
      lig("L'ont équipé", fmt(equipent)),
      lig("Plus haut niveau", meilleur < 0 ? "—" : meilleur >= max(o) ? "MAX" : "Niveau " + meilleur),
    ];
  }

  rendre();
  const demande = App.objet(p.get("objet"));
  if (demande) ouvrir(demande);
});
})();
