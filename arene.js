/* Stream RPG — page Arène à armes égales : mode solo. Le serveur propose 3 kits de même puissance (équipement tiré au hasard,
   stats réparties selon un profil) ; on en choisit un et on enchaîne les combats contre d'autres kits. Tes objets ne comptent pas. */
"use strict";
(function () {
const { el, icone, fmt } = App;
const COLS = [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]];
const STATS = [["atk", "Atq"], ["def", "Déf"], ["pv", "PV"], ["spd", "Vit"], ["luck", "Chc"]];
const pluriel = (n, mot) => fmt(n) + " " + mot + (n > 1 ? "s" : "");

// Cartes d'un kit : équipement (au niveau du kit) et points de stats.
function vueKit(kit) {
  return [
    el("div", { class: "lg-build" }, COLS.map(([c, lib]) => {
      const x = kit.equipement && kit.equipement[c], o = x ? App.objet(x.numero) : null;
      return o ? App.carte(o, { niveau: Math.min(x.niveau, App.niveauMax(o.rarete)), equipe: false })
        : el("div", { class: "case-vide" }, el("span", { texte: lib }), el("small", { texte: c === "offhand" && App.deuxMains((kit.equipement.arme || {}).numero) ? "Deux mains" : "Vide" }));
    })),
    el("ul", { class: "ar-stats", "aria-label": "Points de stats du kit" }, STATS.map(([k, lib]) => el("li", {}, el("b", { class: "num", texte: fmt((kit.stacks || {})[k] || 0) }), el("span", { texte: lib })))),
  ];
}
App.vueKitArene = vueKit;

App.demarrer("arene", async (main, ctx) => {
  const zone = el("div", {}, el("div", { class: "chargement", texte: "Chargement de l'Arène…" }));
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Arène à armes égales" }),
      el("p", { texte: "Ici, tes objets et tes stats ne comptent pas. Tout le monde reçoit un kit de même puissance : seul ton choix fait la différence." }))),
    zone);
  let etat = await App.api.arene();

  const pips = (n, max, cls, paliers) => el("span", { class: "ar-pips " + cls, role: "img", "aria-label": `${n} sur ${max}` },
    Array.from({ length: max }, (_, i) => el("i", { class: (i < n ? "plein" : "") + (paliers && paliers.includes(i + 1) ? " palier" : "") })));
  const blocPaliers = () => el("div", { class: "ar-paliers" }, etat.paliers.map((p) => el("span", { class: "pilule" + (etat.victoires >= p.victoires && etat.etat !== "aucun" && etat.etat !== "choix" ? " atteint" : "") },
    icone(etat.victoires >= p.victoires && etat.etat !== "aucun" && etat.etat !== "choix" ? "i-coche" : "i-medaille"),
    `${p.victoires} victoires : +${pluriel(p.medailles, "médaille")}` + (p.lootbox ? ` et +${fmt(p.lootbox)} lootbox` : ""))));
  const score = () => el("div", { class: "ar-score" },
    el("div", {}, el("span", { texte: "Victoires" }), el("b", { class: "num", texte: `${fmt(etat.victoires)} / ${fmt(etat.max_victoires)}` }), pips(etat.victoires, etat.max_victoires, "v", etat.paliers.map((p) => p.victoires))),
    el("div", {}, el("span", { texte: "Défaites" }), el("b", { class: "num", texte: `${fmt(etat.defaites)} / ${fmt(etat.max_defaites)}` }), pips(etat.defaites, etat.max_defaites, "d")),
    el("div", {}, el("span", { texte: "Ton record" }), el("b", { class: "num", texte: pluriel(etat.record, "victoire") })));

  async function commencer(b) {
    b.disabled = true;
    try { etat = await App.lancerArene(true); rendre(); const t = zone.querySelector("h2"); if (t) t.focus(); }
    catch (e) { App.erreur(e); b.disabled = false; }
  }
  async function choisir(i, b) {
    zone.querySelectorAll(".ar-kit button").forEach((x) => { x.disabled = true; });
    try { etat = await App.rpc("arene_choisir", { p_index: i }); rendre(); const t = zone.querySelector("h2"); if (t) t.focus(); }
    catch (e) { App.erreur(e); zone.querySelectorAll(".ar-kit button").forEach((x) => { x.disabled = false; }); }
  }

  function rendre() {
    const regles = `${fmt(etat.max_victoires)} victoires avant ${fmt(etat.max_defaites)} défaites. Un parcours par jour, gratuit.`;
    if (etat.etat === "choix") {
      zone.replaceChildren(
        el("section", { class: "section-page", "aria-labelledby": "t-ar" },
          el("div", { class: "lg-titre-ligne" }, el("div", {}, el("h2", { id: "t-ar", tabindex: "-1", texte: "Choisis ton kit" }),
            el("p", { class: "sous", texte: "Trois kits de même puissance. Regarde l'arme, le stratagème et la répartition des stats : tu gardes ton choix pour tout le parcours." }))),
          el("div", { class: "ar-kits" }, etat.choix.map((k, i) => el("article", { class: "ar-kit" },
            el("h3", {}, "Kit " + k.nom.toLowerCase(), el("small", { class: "num", texte: fmt(k.puissance) + " de puissance" })),
            vueKit(k),
            el("button", { type: "button", class: "btn-principal", "aria-label": "Choisir le kit " + (i + 1) + " : " + k.nom, onclick: (e) => choisir(i, e.currentTarget) }, "Choisir ce kit"))))),
        el("section", { class: "section-page" }, blocPaliers(), el("p", { class: "mention", texte: regles })));
      return;
    }
    const enCours = etat.etat === "en_cours", fini = etat.etat === "termine";
    const titre = enCours ? "Parcours en cours" : fini ? (etat.victoires >= etat.max_victoires ? "Parcours parfait" : "Parcours terminé") : "Entre dans l'Arène";
    const texte = enCours ? `Encore ${pluriel(etat.max_victoires - etat.victoires, "victoire")} pour aller au bout, et ${pluriel(etat.max_defaites - etat.defaites, "défaite")} de marge.`
      : fini ? `Tu t'arrêtes à ${pluriel(etat.victoires, "victoire")}. ` + (etat.peut_commencer ? "Tu peux relancer un parcours." : "L'Arène rouvre demain.")
      : "Le serveur te propose trois kits tirés au hasard, tous ramenés à la même puissance. Tu en choisis un, puis tu affrontes d'autres kits, parfois celui qu'un autre joueur a choisi. " + regles;
    const action = enCours ? el("a", { class: "btn-principal", href: "combat.html?mode=arene" }, icone("i-epees"), "Combat suivant")
      : etat.peut_commencer ? el("button", { type: "button", class: "btn-principal", onclick: (e) => commencer(e.currentTarget) }, icone("i-epees"), fini ? "Nouveau parcours" : "Commencer un parcours")
      : el("button", { type: "button", class: "btn-principal", "aria-disabled": "true", onclick: () => App.toast("Tu as fait ton parcours du jour : l'Arène rouvre demain.", { titre: "À demain" }) }, icone("i-epees"), "Reviens demain");
    zone.replaceChildren(
      el("section", { class: "section-page ar-tete", "aria-labelledby": "t-ar" },
        el("h2", { id: "t-ar", tabindex: "-1", texte: titre }), el("p", { class: "sous", texte }),
        enCours || fini ? score() : null, blocPaliers(), action),
      (enCours || fini) && etat.kit ? el("section", { class: "section-page", "aria-labelledby": "t-kit" },
        el("h2", { id: "t-kit", texte: "Ton kit : " + etat.kit.nom.toLowerCase() }),
        el("p", { class: "sous", texte: "Ramené à " + fmt(etat.kit.puissance) + " de puissance, comme celui de tes adversaires." }),
        el("div", { class: "ar-monkit" }, vueKit(etat.kit))) : null,
      el("p", { class: "mention ar-note", texte: "Les combats d'arène ne touchent ni ton bilan, ni ta ligue, ni tes objets." }));
  }
  rendre();
});
})();
