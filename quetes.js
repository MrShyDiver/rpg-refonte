/* Stream RPG — page Quêtes : 8 quêtes du jour et 12 de la semaine (tirées dans un lot de 20 qui tourne), les mêmes pour tout le monde.
   Le serveur compte la progression (ligue, duels, Tour, Arène, lootbox ouvertes) ; ici on l'affiche et on prend les récompenses. */
"use strict";
(function () {
const { el, icone, fmt } = App;

// Où aller pour avancer une quête, selon ce qu'elle mesure.
const LIGUE = ["ligue.html", "Aller en ligue"], DUELS = ["duels.html", "Choisir un adversaire"], TOUR = ["tour.html", "Monter dans la Tour"], ARENE = ["arene.html", "Entrer dans l'Arène"];
const OU = { combats_ligue: LIGUE, victoires_ligue: LIGUE, points_ligue: LIGUE, adversaires: LIGUE, duels: DUELS, victoires_duel: DUELS, victoires_valeureuses: DUELS, revanches: DUELS,
  combats_tour: TOUR, etages_tour: TOUR, combats_arene: ARENE, victoires_arene: ARENE, parcours_arene: ARENE, record_arene: ARENE, quetes_jour: ["#t-jour", "Voir les quêtes du jour"],
  defenses_tenues: ["collection.html?build=defense#equipement", "Régler ma défense"], lootbox: ["lootbox.html", "Ouvrir mes lootbox"], boutique: ["boutique.html", "Aller à la boutique"] };
const reste = (fin) => { const ms = new Date(fin) - Date.now(), j = Math.floor(ms / 864e5); return j >= 2 ? j + " jours" : App.dureeCourte(Math.max(0, ms)); };

App.demarrer("quetes", async (main, ctx) => {
  const zone = el("div", {}, el("div", { class: "chargement", texte: "Chargement des quêtes…" }));
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "Quêtes" }),
      el("p", { texte: "Huit objectifs par jour et douze par semaine, les mêmes pour tout le monde. Termine-les en jouant, puis prends ta récompense en médailles." }))),
    zone);
  let etat = await App.api.quetes();

  async function reclamer(q, bouton) {
    bouton.disabled = true;
    try {
      const r = await App.rpc("reclamer_quete", { p_code: q.code });
      etat = r.quetes; ctx.joueur.medailles = r.medailles;
      App.majRessources();
      App.toast("+" + fmt(r.medailles_gagnees) + (r.medailles_gagnees > 1 ? " médailles" : " médaille"), { titre: "Quête terminée", icone: "i-medaille" });
      rendre();
      const suivant = zone.querySelector(".qt-carte.prete button") || zone.querySelector("h2");
      if (suivant) suivant.focus();
    } catch (e) { App.erreur(e); bouton.disabled = false; }
  }

  function carte(q) {
    const finie = q.progres >= q.cible, [href, action] = OU[q.mesure] || LIGUE;
    const fin = q.reclamee ? el("span", { class: "qt-prise" }, icone("i-coche"), "Récompense prise")
      : finie ? el("button", { type: "button", class: "btn-principal", onclick: (e) => reclamer(q, e.currentTarget) }, "Prendre la récompense")
      : el("a", { class: "btn-second", href }, action);
    return el("li", { class: "qt-carte" + (q.reclamee ? " prise" : finie ? " prete" : "") },
      el("h3", { texte: q.titre }),
      el("div", { class: "qt-avance" },
        el("div", { class: "qt-barre", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(q.cible), "aria-valuenow": String(q.progres), "aria-label": "Avancement" },
          el("i", { style: { width: Math.round((100 * q.progres) / q.cible) + "%" } })),
        el("span", { class: "qt-compte num", texte: fmt(q.progres) + " / " + fmt(q.cible) })),
      el("div", { class: "qt-pied" }, el("span", { class: "qt-prix" }, icone("i-medaille"), "+" + fmt(q.medailles) + (q.medailles > 1 ? " médailles" : " médaille")), fin));
  }
  function bloc(cle, titre, sous) {
    const p = etat[cle], finies = p.quetes.filter((q) => q.progres >= q.cible).length;
    // Récompenses à prendre d'abord, quêtes en cours ensuite (les plus avancées en tête), récompenses déjà prises à la fin.
    const ordre = (q) => (q.reclamee ? 2 : q.progres >= q.cible ? 0 : 1);
    const liste = [...p.quetes].sort((a, b) => ordre(a) - ordre(b) || b.progres / b.cible - a.progres / a.cible);
    return el("section", { class: "section-page", "aria-labelledby": "t-" + cle },
      el("div", { class: "qt-titre" }, el("div", {}, el("h2", { id: "t-" + cle, tabindex: "-1", texte: titre }), el("p", { class: "sous", texte: sous })),
        el("span", { class: "qt-fin" }, el("b", { class: "num", texte: fmt(finies) + " / " + fmt(p.quetes.length) }), " terminées · nouvelles quêtes dans " + reste(p.fin))),
      p.quetes.length ? el("ul", { class: "qt-liste" }, liste.map(carte)) : el("p", { class: "mention", texte: "Aucune quête pour l'instant." }));
  }
  function rendre() {
    zone.replaceChildren(
      bloc("jour", "Aujourd'hui", "Des quêtes rapides, remplacées chaque nuit à minuit."),
      bloc("semaine", "Cette semaine", "Des objectifs plus longs, remplacés chaque lundi."),
      el("p", { class: "mention qt-note" }, "Une récompense non prise est perdue quand les quêtes changent. Les combats d'entraînement ne comptent pas."));
    App.majPastilleQuetes(etat.a_reclamer);
  }
  rendre();
});
})();
