"use strict";
/* Codex (arsenal.html) : encyclopédie de tous les objets du jeu, en cartes ou en tableau comparatif.
   Rien de ce que le joueur possède n'y figure : c'est le rôle de l'inventaire. */
(function () {
const { el, icone, fmt, nombre, RARETES, ORDRE_RARETE, SLOTS, STATS, EFFETS, rangRarete } = App;
const COLS = ["arme", "offhand", "armure", "strategeme"];
const TRIS = [["rarete", "Rareté"], ["nom", "Nom"], ["puissance", "Puissance"]];
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const basculer = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
// Set du jour : seul le set à l'honneur aujourd'hui a ses chances multipliées (rotation_lootbox).
const PLURIEL = { commun: "communs", normal: "normaux", rare: "rares", epique: "épiques", legendaire: "légendaires" };

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
    tri: TRIS.some(([t]) => t === p.get("tri")) ? p.get("tri") : "rarete",
  };
  let objetOuvert = null;

  // Données communautaires : chargées en fond, attendues seulement par le tiroir.
  const donnees = Promise.all([
    App.api.inventaires(), App.api.loadouts(), App.api.lootboxRaretes(), App.api.prixBoutique(), App.api.reglagesBoutique(),
    App.api.rotationLootbox().catch(() => null),
  ]).then(([inventaires, loadouts, raretes, prix, reglages, rotation]) => ({ inventaires, loadouts, raretes, prix, reglages, setJour: App.setDuJour(rotation) }));
  donnees.catch(() => {});

  const tous = App.objets.filter((o) => o.actif);
  const effetsDe = new Map(tous.map((o) => [o.numero, App.effetsDe(o)]));
  const max = (o) => App.niveauMax(o.rarete);
  const lvl = (o) => (f.niv === "max" ? max(o) : 0);
  // Puissance d'un objet : ce qu'il ajoute, équipé seul, à un personnage sans points investis.
  const SANS_POINTS = {}, memoPl = new Map();
  const plNu = App.puissance(SANS_POINTS, new Map(), {});
  function puissanceDe(o) {
    const k = o.numero + ":" + lvl(o);
    if (!memoPl.has(k)) {
      const r = App.puissance(SANS_POINTS, new Map([[o.numero, lvl(o)]]), { [SLOTS[o.slot].col]: o.numero });
      memoPl.set(k, r && plNu ? Math.round(r.powerLevel - plNu.powerLevel) : null);
    }
    return memoPl.get(k);
  }
  function degats(o, n) {
    const d = App.auNiveau(o, n);
    if (d.baseDegatsMax > 0) return { min: d.baseDegatsMin, max: d.baseDegatsMax, coups: d.coupsParUsage || 1 };
    if (d.degatsDirects > 0) return { min: d.degatsDirects, max: d.degatsDirects, coups: d.coupsParUsage || 1 };
    return null;
  }
  const signePl = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  const texteDegats = (g) => (g ? (g.min === g.max ? nombre(g.max) : nombre(g.min) + "–" + nombre(g.max)) + (g.coups > 1 ? " ×" + g.coups : "") : "—");

  // ---------- En-tête ----------
  const parRarete = (l) => ORDRE_RARETE.map((r) => [r, l.filter((o) => o.rarete === r).length]).filter(([, n]) => n);
  const stats = el("div", { class: "stats-objets", id: "stats-objets" });
  const resume = el("button", { type: "button", class: "resume-objets", "aria-expanded": "false", "aria-controls": "stats-objets",
    onclick: () => resume.setAttribute("aria-expanded", String(stats.classList.toggle("ouvert"))) },
    el("span", {}, el("b", { class: "num", texte: String(tous.length) }), " objets · répartition et plafonds par rareté"), icone("i-fleche"));
  main.append(
    el("header", { class: "entete-page entete-objets" },
      el("div", {},
        el("h1", { texte: "Codex" }),
        el("p", { texte: `Les ${tous.length} objets de Stream RPG avec toutes leurs valeurs, où les trouver et qui les porte.` })),
      el("div", { class: "actions" }, el("a", { class: "btn-second", href: "collection.html" }, icone("i-cartes"), "Mon inventaire"))),
    resume, stats);
  stats.append(
    el("div", { class: "grille-chiffres" }, Object.entries(SLOTS).map(([k, s]) => {
      const l = tous.filter((o) => o.slot === k);
      return el("div", { class: "chiffre" }, el("b", { class: "num", texte: l.length }), el("span", { texte: s.pluriel }),
        el("small", { class: "repartition" }, parRarete(l).map(([r, n]) => el("span", { style: { "--c": `var(--${r})` } }, el("b", { class: "num", texte: String(n) }), " " + (n > 1 ? PLURIEL[r] : RARETES[r].nom.toLowerCase())))));
    })),
    el("p", { class: "plafonds" }, "Chaque doublon ajoute une amélioration (+1) à un objet, jusqu'à un plafond : ",
      ORDRE_RARETE.flatMap((r, i) => [i ? " · " : "", el("span", { style: { "--c": `var(--${r})` }, texte: `${RARETES[r].nom} +${RARETES[r].max}` })]), "."));

  // ---------- Barre d'outils ----------
  const bouton = (v, nom, surClic) => el("button", { type: "button", "data-v": v, onclick: surClic }, nom);
  const btnVue = [["cartes", "Cartes"], ["tableau", "Tableau"]].map(([v, n]) => bouton(v, n, () => { f.vue = v; rendre(); }));
  const btnNiv = [["base", "Base"], ["max", "Amélioré au max"]].map(([v, n]) => bouton(v, n, () => { f.niv = v; rendre(); }));
  const TABS = [["tout", "Tout"], ...Object.entries(SLOTS).map(([k, s]) => [k, s.pluriel])];
  const btnSlots = TABS.map(([k, nom]) => el("button", { type: "button", "data-v": k, onclick: () => { f.slot = k; rendre(); } }, nom, el("span", { class: "n num" })));
  const btnRar = ORDRE_RARETE.map((r) => el("button", { type: "button", class: "etiquette", "data-v": r, style: { "--c": `var(--${r})` }, onclick: () => { basculer(f.raretes, r); rendre(); } },
    RARETES[r].nom, el("span", { class: "n" })));
  const btnEff = EFFETS.filter(([id]) => tous.some((o) => effetsDe.get(o.numero).includes(id)))
    .map(([id, nom]) => el("button", { type: "button", class: "etiquette " + id, "data-v": id, onclick: () => { basculer(f.effets, id); rendre(); } }, nom, el("span", { class: "n" })));
  const recherche = el("input", { type: "search", placeholder: "Chercher un objet", value: f.q, "aria-label": "Chercher un objet par son nom", oninput: (e) => { f.q = e.target.value; rendre(); } });
  const tri = el("select", { "aria-label": "Trier", onchange: (e) => { f.tri = e.target.value; rendre(); } }, TRIS.map(([v, n]) => el("option", { value: v, texte: n, selected: v === f.tri })));
  const compte = el("p", { class: "compte-resultats", "aria-live": "polite" });
  const nEffets = el("span", { class: "n-filtres num" });
  const plusFiltres = el("details", { class: "plus-filtres repliable", open: f.effets.size > 0 },
    el("summary", {}, icone("i-fleche"), "Voir plus de filtres", nEffets),
    el("div", { class: "puces", role: "group", "aria-label": "Effets et set" }, btnEff));
  const zone = el("div");
  const nFiltres = el("span", { class: "n-filtres num" });
  const outils = el("div", { class: "outils-objets", id: "outils-arsenal" });
  const btnFiltres = el("button", { type: "button", class: "btn-second btn-filtres", "aria-expanded": "false", "aria-controls": "outils-arsenal",
    onclick: () => btnFiltres.setAttribute("aria-expanded", String(outils.classList.toggle("filtres-ouverts"))) }, "Filtres", nFiltres);
  outils.append(
    el("div", { class: "rangee repliable" },
      el("div", { class: "onglets-b", role: "group", "aria-label": "Affichage" }, btnVue),
      el("div", { class: "onglets-b", role: "group", "aria-label": "Valeurs affichées" }, btnNiv)),
    el("div", { class: "onglets-b defile repliable", role: "group", "aria-label": "Emplacement" }, btnSlots),
    el("div", { class: "puces repliable", role: "group", "aria-label": "Rareté" }, btnRar),
    plusFiltres,
    el("div", { class: "rangee rangee-recherche" },
      el("label", { class: "champ recherche" }, icone("i-recherche"), recherche),
      btnFiltres,
      el("label", { class: "champ tri" }, el("span", { texte: "Trier par" }), tri),
      compte));
  main.append(el("section", { class: "section-page section-objets" }, outils, zone));

  // ---------- Filtres, tri, rendu ----------
  const passe = (o, sauf) =>
    (sauf === "slot" || f.slot === "tout" || o.slot === f.slot)
    && (sauf === "rarete" || !f.raretes.size || f.raretes.has(o.rarete))
    && [...f.effets].every((e) => effetsDe.get(o.numero).includes(e))
    && (!f.q || norm(o.nom).includes(norm(f.q)));
  const parNom = (a, b) => a.nom.localeCompare(b.nom, "fr");
  const cle = {
    rarete: (a, b) => rangRarete(b.rarete) - rangRarete(a.rarete) || parNom(a, b),
    nom: parNom,
    puissance: (a, b) => (puissanceDe(b) ?? -Infinity) - (puissanceDe(a) ?? -Infinity) || parNom(a, b),
  };

  function majUrl() {
    const q = new URLSearchParams();
    if (f.vue !== "cartes") q.set("vue", f.vue);
    if (f.niv !== "base") q.set("niv", f.niv);
    if (f.slot !== "tout") q.set("slot", f.slot);
    if (f.raretes.size) q.set("rarete", [...f.raretes].join(","));
    if (f.effets.size) q.set("effet", [...f.effets].join(","));
    if (f.q) q.set("q", f.q);
    if (f.tri !== "rarete") q.set("tri", f.tri);
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
    // Chaque option affiche ce qu'elle donnerait avec les autres filtres en place ; à 0, elle est masquée (sauf si elle est cochée).
    const option = (x, actif, n) => { x.setAttribute("aria-pressed", String(actif)); x.lastChild.textContent = n; x.hidden = !n && !actif && x.dataset.v !== "tout"; };
    btnSlots.forEach((x) => { const k = x.dataset.v; option(x, f.slot === k, tous.filter((o) => (k === "tout" || o.slot === k) && passe(o, "slot")).length); });
    btnRar.forEach((x) => option(x, f.raretes.has(x.dataset.v), tous.filter((o) => o.rarete === x.dataset.v && passe(o, "rarete")).length));
    btnEff.forEach((x) => option(x, f.effets.has(x.dataset.v), tous.filter((o) => effetsDe.get(o.numero).includes(x.dataset.v) && passe(o)).length));
    plusFiltres.hidden = btnEff.every((x) => x.hidden);
    nEffets.textContent = f.effets.size || "";
    const nf = (f.slot !== "tout") + f.raretes.size + f.effets.size + (f.niv === "max") + (f.vue === "tableau");
    nFiltres.textContent = nf || "";
    btnFiltres.setAttribute("aria-label", nf ? `Filtres et affichage, ${nf} actif${nf > 1 ? "s" : ""}` : "Filtres et affichage");
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

  function caseCarte(o) {
    return el("div", { class: "case-carte" },
      el("button", { type: "button", class: "zone", onclick: () => ouvrir(o) }, App.carte(o, { niveau: lvl(o), equipe: false })),
      el("div", { class: "meta-carte" }, el("span", { texte: RARETES[o.rarete].nom }),
        puissanceDe(o) !== null ? el("span", { class: "num pl-objet", title: "Puissance ajoutée par l'objet équipé seul" }, signePl(puissanceDe(o))) : null));
  }

  function tableau(vis) {
    const th = (t) => el("th", { scope: "col", texte: t });
    return el("div", { class: "table-defile", tabindex: "0", role: "region", "aria-label": "Tableau comparatif des objets" },
      el("table", { class: "table-objets" },
        el("thead", {}, el("tr", {}, ["Objet", "Emplacement", "Puissance", "Dégâts", "Statistiques", "Effets", "Scaling"].map(th))),
        el("tbody", {}, vis.map((o) => {
          const n = lvl(o), d = App.auNiveau(o, n);
          const stats = App.lignesStats(o, n), pa = App.passifs(o, n), sc = App.scalingsDe(d);
          return el("tr", { style: { "--c": `var(--${o.rarete})` }, onclick: () => ouvrir(o) },
            el("th", { scope: "row" },
              el("button", { type: "button", class: "nom-objet" }, el("span", { texte: o.nom })),
              el("span", { class: "pilule " + o.rarete, texte: RARETES[o.rarete].nom })),
            el("td", { texte: App.sousTitre(o) }),
            el("td", { class: "num nowrap", texte: puissanceDe(o) !== null ? signePl(puissanceDe(o)) : "—" }),
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
    objetOuvert = o.numero;
    majUrl();
    const ouTrouver = bloc("Où l'obtenir", enAttente());
    const communaute = bloc("Dans la communauté", enAttente());
    const contenu = [App.fiche(o, { niveau: lvl(o), curseur: true }), ouTrouver, communaute,
      o.contributeur ? bloc("Imaginé par", el("p", { class: "passif" }, el("b", { texte: o.contributeur }), ", membre de la communauté, a imaginé cet objet.")) : null];
    const pied = [el("a", { class: "btn-principal", href: "lootbox.html" + (o.rarete === "legendaire" ? "?type=legendaire" : "") }, icone("i-coffre-ligne"), "Ouvrir une lootbox")];
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
    const mult = (i) => (D.setJour && i.set && i.set === D.setJour.set ? Number(D.setJour.multiplicateur) || 1 : 1);
    const pool = tous.filter((i) => i.rarete === o.rarete);
    return (poids(r) / dispo.reduce((s, x) => s + poids(x), 0)) * (mult(o) / pool.reduce((s, i) => s + mult(i), 0));
  }

  function lignesObtention(o, D) {
    const l = [];
    for (const [leg, nom] of [[false, "Lootbox"], [true, "Lootbox légendaire"]]) {
      const c = chance(o, D, leg);
      l.push(lig(nom, c ? `${pctTxt(c)} · 1 sur ${fmt(Math.round(1 / c))}` : "Jamais", c ? "" : "eteint"));
    }
    if (o.set && D.setJour) l.push(el("div", { class: "ligne note" }, el("span", { texte: o.set === D.setJour.set
      ? `Set du jour (${o.set}) : ×${D.setJour.multiplicateur} de chances aujourd'hui face aux autres objets ${PLURIEL[o.rarete]}.`
      : `Set ${o.set} : ses chances sont multipliées les jours où il est le set du jour (planning sur la page Lootbox).` })));
    const bp = D.prix.find((x) => x.rarete === o.rarete);
    const pool = tous.filter((i) => i.rarete === o.rarete).length;
    if (bp && bp.en_etal > 0) l.push(lig("Boutique", `${fmt(bp.achat)} médailles · ${bp.en_etal} sur ${pool} / heure`));
    else l.push(lig("Boutique", "Jamais à l'étal", "eteint"));
    const source = { normal: "commun", rare: "normal", epique: "rare" }[o.rarete];
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
      lig("Meilleure amélioration", meilleur < 0 ? "—" : meilleur >= max(o) ? "MAX" : "+" + meilleur),
    ];
  }

  rendre();
  const demande = App.objet(p.get("objet"));
  if (demande) ouvrir(demande);
});
})();
