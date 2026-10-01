"use strict";
/* Collection : tout ce que le joueur possède, progression, équipement rapide. */
(function () {
const { el, icone, fmt, date, RARETES, ORDRE_RARETE, SLOTS, EFFETS, rangRarete } = App;
const COLS = ["arme", "offhand", "armure", "strategeme"];
const TRIS = [["rarete", "Rareté"], ["niveau", "Amélioration"], ["numero", "Numéro"], ["recent", "Récemment obtenu"]];
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const basculer = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
const lienAide = (ancre, sujet) => el("a", { class: "lien-aide", href: "aide.html#" + ancre, "aria-label": "Aide : " + sujet, title: "Aide : " + sujet, texte: "?" });

App.demarrer("collection", async (main, ctx) => {
  const p = new URLSearchParams(location.search);
  const liste = (k, ok) => new Set((p.get(k) || "").split(",").filter(ok));
  const f = {
    slot: SLOTS[p.get("slot")] ? p.get("slot") : "tout",
    raretes: liste("rarete", (r) => RARETES[r]),
    effets: liste("effet", (e) => EFFETS.some(([id]) => id === e)),
    q: p.get("q") || "",
    tri: TRIS.some(([t]) => t === p.get("tri")) ? p.get("tri") : "rarete",
    manquants: p.get("manquants") === "1",
  };
  let objetOuvert = null;

  const actifs = App.objets.filter((o) => o.actif);
  const effetsDe = new Map(App.objets.map((o) => [o.numero, App.effetsDe(o)]));
  const ligne = (o) => ctx.inventaire.get(o.numero);
  const max = (o) => App.niveauMax(o.rarete);
  const eff = (o) => Math.min(ligne(o).niveau, max(o));
  const enTrop = (o) => Math.max(0, ligne(o).niveau - max(o));
  const equipes = () => new Set(COLS.map((c) => ctx.loadout[c]).filter((n) => n != null));
  const puissance = (lo) => { const r = App.puissance(ctx.joueur, App.niveaux(), lo); return r ? Math.round(r.powerLevel) : null; };

  // ---------- En-tête : progression ----------
  const possedes = App.objets.filter((o) => ctx.inventaire.has(o.numero));
  const nbActifs = actifs.filter((o) => ctx.inventaire.has(o.numero)).length;
  const auMax = possedes.filter((o) => ligne(o).niveau >= max(o)).length;
  const copies = possedes.reduce((s, o) => s + ligne(o).niveau + 1, 0);
  const trop = possedes.reduce((s, o) => s + enTrop(o), 0);
  const pct = actifs.length ? Math.round((nbActifs / actifs.length) * 100) : 0;

  // Mobile : une ligne de résumé qui déplie les chiffres (objets.css).
  const stats = el("div", { class: "stats-objets", id: "stats-objets" });
  const resume = el("button", { type: "button", class: "resume-objets", "aria-expanded": "false", "aria-controls": "stats-objets",
    onclick: () => resume.setAttribute("aria-expanded", String(stats.classList.toggle("ouvert"))) },
    el("span", {}, el("b", { class: "num", texte: `${nbActifs} / ${actifs.length}` }), " objets · ", el("b", { class: "num", texte: fmt(auMax) }), " au max",
      trop ? [" · ", el("b", { class: "num", texte: fmt(trop) }), " en trop"] : null), icone("i-fleche"));
  main.append(
    el("header", { class: "entete-page entete-objets" },
      el("div", {},
        el("h1", { texte: "Ma collection" }),
        el("p", {}, `${nbActifs} objets différents sur ${actifs.length}. Chaque doublon ajoute une amélioration (+1) à un objet, jusqu'à son plafond.`, lienAide("doublons", "doublons et améliorations"))),
      el("div", { class: "actions" }, el("a", { class: "btn-second", href: "arsenal.html" }, icone("i-livre"), "Tout l'arsenal"))),
    resume, stats);
  stats.append(
    el("div", { class: "grille-chiffres" },
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: `${nbActifs} / ${actifs.length}` }), el("span", { texte: "Objets différents" }), el("small", { texte: `${pct} % du jeu` })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(auMax) }), el("span", { texte: "Améliorés au max" })),
      el("div", { class: "chiffre" }, el("b", { class: "num", texte: fmt(copies) }), el("span", { texte: "Exemplaires en tout" })),
      el("a", { class: "chiffre chiffre-lien", href: "boutique.html#vendre" }, el("b", { class: "num", texte: fmt(trop) }), el("span", { texte: "Doublons à revendre" }),
        el("small", { texte: trop ? "Vendre ou troquer" : "Rien en trop pour l'instant" }))),
    el("div", { class: "panneau-b progression", "aria-label": "Progression par rareté" },
      ORDRE_RARETE.map((r) => {
        const tot = actifs.filter((o) => o.rarete === r).length;
        if (!tot) return null;
        const n = actifs.filter((o) => o.rarete === r && ctx.inventaire.has(o.numero)).length;
        return el("div", { class: "prog-rarete", style: { "--c": `var(--${r})` } },
          el("div", { class: "tete" }, el("b", { texte: RARETES[r].nom }), el("span", { class: "num", texte: `${n} / ${tot}` })),
          el("div", { class: "jauge-niv", role: "progressbar", "aria-label": RARETES[r].nom, "aria-valuemin": 0, "aria-valuemax": tot, "aria-valuenow": n },
            el("i", { style: { width: (n / tot) * 100 + "%" } })));
      })));

  // ---------- Barre d'outils ----------
  const TABS = [["tout", "Tout"], ...Object.entries(SLOTS).map(([k, s]) => [k, s.pluriel])];
  const btnSlots = TABS.map(([k, nom]) => el("button", { type: "button", "data-v": k, onclick: () => { f.slot = k; rendre(); } }, nom, el("span", { class: "n num" })));
  const btnRar = ORDRE_RARETE.map((r) => el("button", { type: "button", class: "etiquette", "data-v": r, style: { "--c": `var(--${r})` }, onclick: () => { basculer(f.raretes, r); rendre(); } },
    RARETES[r].nom, el("span", { class: "n" })));
  const btnEff = EFFETS.filter(([id]) => actifs.some((o) => effetsDe.get(o.numero).includes(id)))
    .map(([id, nom]) => el("button", { type: "button", class: "etiquette " + id, "data-v": id, onclick: () => { basculer(f.effets, id); rendre(); } }, nom, el("span", { class: "n" })));
  const recherche = el("input", { type: "search", placeholder: "Chercher un objet", value: f.q, "aria-label": "Chercher un objet par son nom", oninput: (e) => { f.q = e.target.value; rendre(); } });
  const tri = el("select", { "aria-label": "Trier", onchange: (e) => { f.tri = e.target.value; rendre(); } }, TRIS.map(([v, n]) => el("option", { value: v, texte: n, selected: v === f.tri })));
  const inter = el("button", { type: "button", class: "interrupteur", role: "switch", id: "voir-manquants", onclick: () => { f.manquants = !f.manquants; rendre(); } });
  const compte = el("p", { class: "compte-resultats", "aria-live": "polite" });
  const grille = el("div", { class: "grille-cartes" });
  const nFiltres = el("span", { class: "n-filtres num" });
  const outils = el("div", { class: "outils-objets", id: "outils-collection" });
  const btnFiltres = el("button", { type: "button", class: "btn-second btn-filtres", "aria-expanded": "false", "aria-controls": "outils-collection",
    onclick: () => btnFiltres.setAttribute("aria-expanded", String(outils.classList.toggle("filtres-ouverts"))) }, "Filtres", nFiltres);
  outils.append(
      el("div", { class: "rangee entre repliable" },
        el("div", { class: "onglets-b defile", role: "group", "aria-label": "Emplacement" }, btnSlots),
        el("div", { class: "bascule" }, inter, el("label", { for: "voir-manquants", texte: "Afficher ce qui me manque" }))),
      el("div", { class: "puces repliable", role: "group", "aria-label": "Rareté" }, btnRar),
      el("div", { class: "puces repliable", role: "group", "aria-label": "Effets" }, btnEff),
      el("div", { class: "rangee rangee-recherche" },
        el("label", { class: "champ recherche" }, icone("i-recherche"), recherche),
        btnFiltres,
        el("label", { class: "champ tri" }, el("span", { texte: "Trier par" }), tri),
        compte));
  main.append(el("section", { class: "section-page section-objets" }, outils, grille));

  // ---------- Filtres, tri, rendu ----------
  const base = () => App.objets.filter((o) => ctx.inventaire.has(o.numero) || (f.manquants && o.actif));
  const passe = (o, sauf) =>
    (sauf === "slot" || f.slot === "tout" || o.slot === f.slot)
    && (sauf === "rarete" || !f.raretes.size || f.raretes.has(o.rarete))
    && (sauf === "effet" || !f.effets.size || effetsDe.get(o.numero).some((e) => f.effets.has(e)))
    && (!f.q || norm(o.nom).includes(norm(f.q)));
  const cle = {
    rarete: (a, b) => rangRarete(b.rarete) - rangRarete(a.rarete) || niv(b) - niv(a) || a.numero - b.numero,
    niveau: (a, b) => niv(b) - niv(a) || rangRarete(b.rarete) - rangRarete(a.rarete) || a.numero - b.numero,
    numero: (a, b) => a.numero - b.numero,
    recent: (a, b) => String((ligne(b) || {}).obtenu_le || "").localeCompare(String((ligne(a) || {}).obtenu_le || "")) || a.numero - b.numero,
  };
  const niv = (o) => (ligne(o) ? eff(o) : -1);

  function majUrl() {
    const q = new URLSearchParams();
    if (f.slot !== "tout") q.set("slot", f.slot);
    if (f.raretes.size) q.set("rarete", [...f.raretes].join(","));
    if (f.effets.size) q.set("effet", [...f.effets].join(","));
    if (f.q) q.set("q", f.q);
    if (f.tri !== "rarete") q.set("tri", f.tri);
    if (f.manquants) q.set("manquants", "1");
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
    const b = base();
    btnSlots.forEach((x) => { const k = x.dataset.v; x.setAttribute("aria-pressed", String(f.slot === k)); x.lastChild.textContent = b.filter((o) => (k === "tout" || o.slot === k) && passe(o, "slot")).length; });
    btnRar.forEach((x) => { x.setAttribute("aria-pressed", String(f.raretes.has(x.dataset.v))); x.lastChild.textContent = b.filter((o) => o.rarete === x.dataset.v && passe(o, "rarete")).length; });
    btnEff.forEach((x) => { x.setAttribute("aria-pressed", String(f.effets.has(x.dataset.v))); x.lastChild.textContent = b.filter((o) => effetsDe.get(o.numero).includes(x.dataset.v) && passe(o, "effet")).length; });
    inter.setAttribute("aria-checked", String(f.manquants));
    const nf = (f.slot !== "tout") + f.raretes.size + f.effets.size + f.manquants;
    nFiltres.textContent = nf || "";
    btnFiltres.setAttribute("aria-label", nf ? `Filtres, ${nf} actif${nf > 1 ? "s" : ""}` : "Filtres");
    majUrl();

    const vis = b.filter((o) => passe(o)).sort(cle[f.tri]);
    compte.textContent = vis.length + (vis.length > 1 ? " objets" : " objet");
    if (!ctx.inventaire.size && !f.manquants) {
      grille.replaceChildren(el("div", { class: "vide vide-large" },
        icone("i-coffre", "coffre-vide"),
        el("b", { texte: "Ta collection est vide" }),
        "Ouvre ta première lootbox : chaque objet tiré atterrit ici, et chacun de ses doublons l'améliore de +1.",
        el("div", { class: "actions" },
          el("a", { class: "btn-principal", href: "lootbox.html" }, icone("i-coffre-ligne"), "Ouvrir une lootbox"),
          el("button", { type: "button", class: "btn-second", onclick: () => { f.manquants = true; rendre(); } }, "Voir tout ce qui existe"))));
      return;
    }
    if (!vis.length) {
      grille.replaceChildren(el("div", { class: "vide vide-large" }, el("b", { texte: "Aucun objet ne correspond" }), "Essaie une autre rareté, un autre effet ou un autre nom.",
        el("div", { class: "actions" }, el("button", { type: "button", class: "btn-second", onclick: reinitialiser }, "Réinitialiser les filtres"))));
      return;
    }
    const eq = equipes();
    grille.replaceChildren(...vis.map((o) => caseCarte(o, eq)));
  }

  function caseCarte(o, eq) {
    const zone = (carte) => el("button", { type: "button", class: "zone", onclick: () => ouvrir(o) }, carte);
    if (!ligne(o)) return el("div", { class: "case-carte manquant" }, zone(App.carte(o, { verrouille: true })), el("div", { class: "meta-carte" }, el("span", { texte: "Pas encore obtenu" })));
    const n = eff(o), m = max(o), t = enTrop(o);
    return el("div", { class: "case-carte", style: { "--c": `var(--${o.rarete})` } },
      zone(App.carte(o, { niveau: n, equipe: eq.has(o.numero) })),
      el("div", { class: "jauge-niv", "aria-hidden": "true" }, el("i", { style: { width: (n / m) * 100 + "%" } })),
      el("div", { class: "meta-carte" },
        el("span", { class: "num" + (n >= m ? " est-max" : ""), texte: n >= m ? "MAX" : `+${n} / +${m}` }),
        t ? el("span", { class: "trop num", texte: `+${t} en trop` }) : null));
  }

  // ---------- Tiroir : fiche + équiper ----------
  function ouvrir(o) {
    const l = ligne(o);
    objetOuvert = o.numero;
    majUrl();
    const contenu = [App.fiche(o, { niveau: l ? eff(o) : 0, possede: !!l })];
    let pied;
    if (l) {
      const t = enTrop(o);
      contenu.push(el("section", { class: "bloc-fiche" }, el("h4", { texte: "Tes exemplaires" }),
        el("div", { class: "lignes" },
          lig("Exemplaires possédés", fmt(l.niveau + 1)),
          lig("Amélioration", eff(o) >= max(o) ? `MAX (+${max(o)})` : `+${eff(o)} / +${max(o)}`),
          t ? lig("En trop, à revendre", "+" + fmt(t)) : null,
          l.obtenu_le ? lig("Obtenu le", date(l.obtenu_le)) : null)));
      pied = piedEquiper(o);
    } else {
      pied = [
        el("a", { class: "btn-principal", href: "lootbox.html" }, icone("i-coffre-ligne"), "Ouvrir une lootbox"),
        el("a", { class: "btn-second", href: "arsenal.html?objet=" + o.numero }, "Où l'obtenir"),
      ];
    }
    App.tiroir({ titre: o.nom, contenu, pied, surFermeture: () => { objetOuvert = null; majUrl(); } });
  }
  const lig = (n, v) => el("div", { class: "ligne" }, el("span", { texte: n }), el("b", { class: "num", texte: v }));

  function piedEquiper(o) {
    const col = SLOTS[o.slot].col;
    const estEquipe = ctx.loadout[col] === o.numero;
    const ancien = !estEquipe && ctx.loadout[col] != null ? App.objet(ctx.loadout[col]) : null;
    const avant = puissance(ctx.loadout), apres = puissance({ ...ctx.loadout, [col]: estEquipe ? null : o.numero });
    let apercu = null;
    if (avant !== null && apres !== null) {
      const d = apres - avant;
      apercu = el("p", { class: "apercu-puissance" },
        "Puissance ", el("b", { class: "num", texte: fmt(avant) }), " → ", el("b", { class: "num", texte: fmt(apres) }),
        el("span", { class: "num " + (d > 0 ? "hausse" : d < 0 ? "baisse" : ""), texte: ` (${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))})` }),
        el("small", { texte: estEquipe ? `Libère l'emplacement ${SLOTS[o.slot].nom.toLowerCase()}.` : ancien ? `Remplace ${ancien.nom}.` : `Emplacement ${SLOTS[o.slot].nom.toLowerCase()} vide pour l'instant.` }));
    }
    const btn = el("button", { type: "button", class: estEquipe ? "btn-second" : "btn-principal", onclick: async () => {
      btn.disabled = true;
      try {
        await App.rpc("equiper", { p_emplacement: col, p_numero: estEquipe ? null : o.numero });
        await Promise.all([App.rafraichirCollection(), App.rafraichirJoueur()]);
        App.fermerTiroir();
        App.toast(apres !== null ? `Puissance : ${fmt(apres)}` : o.nom, { titre: estEquipe ? `${o.nom} retiré` : `${o.nom} équipé` });
        rendre();
        App.verifierSucces();
      } catch (e) { App.erreur(e); btn.disabled = false; }
    } }, estEquipe ? "Retirer" : "Équiper");
    return [apercu, btn,
      el("a", { class: "btn-second", href: "profil.html#vitrine" }, "Mettre en vitrine"),
      el("a", { class: "btn-second", href: "boutique.html#vendre" }, "Vendre")];
  }

  rendre();
  const demande = App.objet(p.get("objet"));
  if (demande) ouvrir(demande);
});
})();
