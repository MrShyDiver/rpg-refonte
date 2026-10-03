/* Stream RPG — page Arène : draft façon Hearthstone. Tout le monde part d'une coquille sans objet ni point de stat et
   drafte son build en 30 tours (le serveur tire les cartes), puis enchaîne les combats : 10 victoires avant 3 défaites.
   En fin de parcours, des coffres de récompense à ouvrir un par un. Tes objets et tes stats ne comptent pas. */
"use strict";
(function () {
const { el, icone, fmt, RARETES } = App;
const COLS = [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]];
const LIB = Object.fromEntries(COLS);
// [clé, abrégé, nom, valeur de base, valeur d'un point]
const STATS = [["atk", "Atq", "Attaque", 10, 1], ["def", "Déf", "Défense", 10, 1], ["pv", "PV", "PV", 100, 10], ["spd", "Vit", "Vitesse", 10, 1], ["luck", "Chc", "Chance", 0, 1]];
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
  let etat = await App.api.arene(), occupe = false;

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
  function carteOffre(x, i) {
    const o = x.numero ? App.objet(x.numero) : null;
    let genre, visuel, titre, detail;
    if (x.type === "stat") {
      const s = STATS.find((y) => y[0] === x.stat), avant = (etat.kit.stacks || {})[x.stat] || 0;
      genre = "Stat"; titre = "+" + fmt(x.points * s[4]) + " " + s[2];
      visuel = el("div", { class: "ar-carte-stat" }, el("b", { class: "num", texte: "+" + fmt(x.points * s[4]) }), el("span", { texte: s[2] }));
      detail = `${s[2]} de base : ${fmt(valeurStat(x.stat, avant))} → ${fmt(valeurStat(x.stat, avant + x.points))}`;
    } else {
      if (!o) return null;
      visuel = App.carte(o, { niveau: niveauDe(o, x.niveau), equipe: false });
      titre = o.nom;
      if (x.type === "objet") { genre = LIB[x.emplacement]; detail = RARETES[o.rarete].nom + (App.deuxMains(o.numero) ? " · à deux mains" : ""); }
      else if (x.type === "amelioration") { genre = "Amélioration"; detail = `${LIB[x.emplacement]} : +${fmt(x.niveau - 1)} → +${fmt(x.niveau)}`; }
      else { const a = App.objet(x.remplace); genre = "Remplacement"; detail = `À la place de ${a ? a.nom : "ton objet"}` + (x.niveau ? `, garde +${fmt(x.niveau)}` : ""); }
    }
    return el("li", { class: "ar-offre-case", style: { "--i": i } },
      el("button", { type: "button", class: "ar-offre " + x.type + (o ? " " + o.rarete : ""), "aria-label": `${genre} : ${titre}. ${detail}` + (x.perd_offhand ? ". Arme à deux mains : ta main gauche est retirée." : ""), onclick: () => prendre(i) },
        el("span", { class: "ar-offre-genre", texte: genre }), visuel, el("small", { texte: detail }),
        x.perd_offhand ? el("small", { class: "ar-alerte" }, icone("i-alerte"), "Deux mains : ta main gauche est retirée") : null),
      o ? el("button", { type: "button", class: "lien ar-fiche", onclick: () => App.tiroir({ titre: o.nom, contenu: App.fiche(o, { niveau: niveauDe(o, x.niveau), possede: null }) }) }, "Voir la fiche") : null);
  }
  async function prendre(i) {
    if (occupe) return;
    occupe = true; zone.classList.add("ar-attente");
    try {
      etat = await App.rpc("arene_drafter", { p_index: i });
      rendre(); viser();
      if (etat.etat === "en_cours") annonce.textContent = "Draft terminé : ton build est prêt.";
    } catch (e) { App.erreur(e); }
    occupe = false; zone.classList.remove("ar-attente");
  }
  function ecranDraft() {
    const o = etat.offres || [], objets = o.length > 0 && o.every((x) => x.type === "objet"), reste = etat.tours - etat.tour;
    zone.replaceChildren(
      el("section", { class: "section-page ar-draft", "aria-labelledby": "t-ar" },
        el("div", { class: "ar-draft-tete" },
          el("div", {}, el("h2", { id: "t-ar", tabindex: "-1", texte: `Tour ${fmt(etat.tour + 1)} sur ${fmt(etat.tours)}` }),
            el("p", { class: "sous", texte: objets ? (o.length > 1 ? "Un objet par emplacement vide : choisis-en un. Les autres emplacements se rempliront aux tours suivants." : "Ta main gauche est libre : voici l'objet proposé.")
              : "Choisis une carte : renforcer une stat, améliorer un objet, ou en remplacer un." })),
          el("span", { class: "ar-reste num", texte: reste > 1 ? `${fmt(reste)} cartes à choisir` : "Dernière carte" })),
        el("div", { class: "ar-avance", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(etat.tours), "aria-valuenow": String(etat.tour), "aria-label": "Avancement du draft" },
          el("i", { style: { width: (100 * etat.tour) / etat.tours + "%" } })),
        el("ul", { class: "ar-offres" }, o.map(carteOffre))),
      blocBuild("Ton build", "Il se construit au fil des cartes. La puissance est donnée à titre indicatif : elle ne décide pas de tes adversaires."),
      note());
  }

  // ------------------------------------------------------------------ Coffres de fin de parcours
  function ecranCoffres() {
    const pal = palierAtteint() || { lootbox_legendaire: 0, tickets: 0 }, n = etat.coffres_a_ouvrir;
    const genreDe = (i) => (pal.tickets && i === n - 1 ? "ticket" : i >= n - (pal.tickets ? 1 : 0) - pal.lootbox_legendaire ? "legendaire" : "commun");
    const NOMS = { commun: "coffre de récompense", legendaire: "coffre légendaire", ticket: "coffre du champion" };
    let contenu = null, apres = null; const ouverts = new Set();
    const bilan = el("div", { class: "ar-bilan", hidden: true });
    const boutons = Array.from({ length: n }, (_, i) => {
      const b = el("button", { type: "button", class: "ar-coffret " + genreDe(i), style: { "--i": i }, "aria-label": `Coffre ${i + 1} sur ${n} : ${NOMS[genreDe(i)]}, fermé. Ouvrir`, onclick: () => ouvrir(i) });
      b.innerHTML = COFFRET;
      b.append(el("span", { class: "ar-butin" }));
      return b;
    });
    const toutOuvrir = el("button", { type: "button", class: "lien ar-tout", onclick: async () => { for (let i = 0; i < n; i++) await ouvrir(i); } }, "Tout ouvrir");
    async function ouvrir(i) {
      if (ouverts.has(i) || occupe) return;
      if (!contenu) {   // premier coffre : le serveur crédite tout et donne le contenu, la page le dévoile coffre par coffre
        occupe = true;
        try { const r = await App.rpc("arene_recuperer"); contenu = r.coffres; apres = r; }
        catch (e) { App.erreur(e); occupe = false; return; }
        occupe = false;
      }
      ouverts.add(i);
      const c = contenu[i], [ic, texte] = butin(c), b = boutons[i];
      b.classList.add("ouvert", c.type); b.setAttribute("aria-label", `Coffre ${i + 1} : ${texte}`); b.setAttribute("aria-disabled", "true");
      const coupe = texte.indexOf(" ");   // « +61 » en grand, « médailles » dessous
      b.querySelector(".ar-butin").replaceChildren(icone(ic), el("b", { class: "num", texte: texte.slice(0, coupe) }), el("small", { texte: texte.slice(coupe + 1) }));
      annonce.textContent = `Coffre ${i + 1} : ${texte}`;
      if (ouverts.size === n) terminer();
    }
    function terminer() {
      Object.assign(ctx.joueur, apres.joueur); App.majRessources();
      etat = apres.arene; toutOuvrir.hidden = true;
      const total = {}; for (const c of contenu) total[c.type] = (total[c.type] || 0) + c.valeur;
      bilan.replaceChildren(
        el("p", { class: "ar-bilan-texte" }, "Tu repars avec ", Object.entries(total).flatMap(([type, valeur], k, l) => [k ? (k === l.length - 1 ? " et " : ", ") : "", el("b", { texte: butin({ type, valeur })[1].slice(1) })]), "."),
        el("div", { class: "ar-bilan-actions" },
          total.lootbox || total.lootbox_legendaire ? el("a", { class: "btn-principal", href: total.lootbox ? "lootbox.html" : "lootbox.html?type=legendaire" }, icone("i-coffre-ligne"), "Ouvrir mes lootbox") : null,
          etat.peut_commencer ? boutonEntree(true) : el("span", { class: "mention", texte: "L'Arène rouvre demain." })));
      bilan.hidden = false;
      const s = bilan.querySelector("a, button"); if (s) s.focus();
    }
    zone.replaceChildren(
      el("section", { class: "section-page ar-tete ar-recompenses", "aria-labelledby": "t-ar" },
        el("h2", { id: "t-ar", tabindex: "-1", texte: etat.victoires >= etat.max_victoires ? "Parcours parfait" : "Parcours terminé" }),
        el("p", { class: "sous", texte: `${pluriel(etat.victoires, "victoire")} : ${pluriel(n, "coffre")} à ouvrir. Touche chaque coffre pour découvrir ce qu'il contient.` }),
        el("div", { class: "ar-coffrets", role: "group", "aria-label": "Tes coffres de récompense" }, boutons),
        toutOuvrir, bilan),
      blocBuild("Le build de ce parcours"), note());
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
          el("li", {}, el("b", { texte: "Drafte" }), el("span", { texte: `${fmt(etat.tours)} tours. D'abord un objet par emplacement, puis à chaque tour : une stat (+${fmt(etat.stat_points)} points), une amélioration ou un remplacement.` })),
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
      note()].filter(Boolean));
  }
  rendre();
});
})();
