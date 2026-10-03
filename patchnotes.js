"use strict";
/* Patchnotes : la liste publique des changements du jeu (texte de MrShyDiver + objets retouchés,
   comparés automatiquement avant / après). Lecture seule ; la publication se fait dans l'atelier réservé. */
(function () {
const { el } = App;
App.demarrer("patchnotes", async (main) => {
  document.title = "Patchnotes · Stream RPG";
  const liste = await App.api.patchnotes();
  main.append(el("header", { class: "entete-page" }, el("div", {}, el("h1", { texte: "Patchnotes" }),
    el("p", { texte: "Les changements du jeu, du plus récent au plus ancien : les règles, et chaque objet retouché avec ses valeurs avant et après." }))));
  if (!liste.length) {
    main.append(el("div", { class: "vide vide-large" }, el("b", { texte: "Aucun patchnote pour l'instant" }), "Les prochains changements du jeu seront annoncés ici."));
    return;
  }
  liste.forEach((p) => main.append(App.patch.article(p)));
  const cible = location.hash && document.getElementById(location.hash.slice(1));
  if (cible) cible.scrollIntoView();
}, { public: true });
})();
