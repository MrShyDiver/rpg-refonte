"use strict";
/* Atelier patchnote (réservé à MrShyDiver, même verrou que la recette) : le texte du prochain patchnote,
   l'aperçu des objets à l'essai, la publication. Tant que rien n'est publié, les joueurs gardent les
   objets en ligne : le brouillon vit côté serveur, dans des tables privées. */
(function () {
const { el, date } = App;
App.demarrer("atelier", async (main, ctx) => {
  document.title = "Atelier patchnote · Stream RPG";
  const refus = () => main.replaceChildren(el("div", { class: "vide" }, el("b", { texte: "Page introuvable." }), el("a", { class: "btn-second", href: "lootbox.html", texte: "Retour au jeu" })));
  if (!App.estRecetteur(ctx.joueur)) return refus();
  let B, publies;
  try { B = await App.rpc("patchnote_brouillon"); } catch (e) { return refus(); } // le serveur confirme que c'est bien toi
  publies = await App.api.patchnotes();

  // Bouton à double appui : le premier arme, le second (dans les 4 s) exécute.
  function armer(bouton, libelleConfirmer, f) {
    const libelle = bouton.textContent; let arme = false, minuterie = 0;
    bouton.onclick = async () => {
      if (!arme) { arme = true; bouton.textContent = libelleConfirmer; minuterie = setTimeout(() => { arme = false; bouton.textContent = libelle; }, 4000); return; }
      clearTimeout(minuterie); arme = false; bouton.textContent = libelle; bouton.disabled = true;
      try { await f(); } catch (e) { App.erreur(e); } finally { bouton.disabled = false; rendre(); }
    };
    return bouton;
  }
  // Objets du brouillon, mis au format d'un patchnote : avant = objet en ligne, après = objet à l'essai.
  const modifies = () => (B.objets || []).map((x) => { const o = App.objet(x.numero); return o ? { numero: o.numero, nom: o.nom, slot: o.slot, rarete: o.rarete, avant: o.data, apres: x.data } : null; }).filter(Boolean);

  const version = el("input", { type: "text", maxlength: "20", placeholder: "1.4", autocomplete: "off" });
  const titre = el("input", { type: "text", maxlength: "120", placeholder: "Refonte de l'équilibrage", autocomplete: "off" });
  const texte = el("textarea", { maxlength: "20000", placeholder: "Explique les changements aux joueurs.\n\n## Un sous-titre\n- un point\n- un autre point" });
  const etatTexte = el("span", { class: "mention", "aria-live": "polite" });
  const apercu = el("div"), zoneObjets = el("div"), zonePublies = el("div", { class: "at-publies" });
  let enregistre = "";
  const cleTexte = () => JSON.stringify([version.value, titre.value, texte.value]);
  async function enregistrerTexte() {
    if (cleTexte() === enregistre) return;
    const cle = cleTexte();
    B = await App.rpc("patchnote_enregistrer_texte", { p_version: version.value, p_titre: titre.value, p_texte: texte.value });
    enregistre = cle; etatTexte.textContent = "Brouillon enregistré.";
  }
  const majApercu = () => apercu.replaceChildren(App.patch.article({ version: version.value.trim() || "?", titre: titre.value.trim(), texte: texte.value, objets: modifies() }, (o) => {
    const b = el("button", { type: "button", class: "btn-second", texte: "Rétablir" });
    b.onclick = async () => { b.disabled = true; try { B = await App.rpc("patchnote_enregistrer_objet", { p_numero: o.numero, p_data: null }); App.toast(o.nom + " : objet en ligne rétabli."); } catch (e) { App.erreur(e); } rendre(); };
    return b;
  }));
  for (const champ of [version, titre, texte]) {
    champ.addEventListener("input", () => { etatTexte.textContent = "Modifications non enregistrées."; majApercu(); });
    champ.addEventListener("blur", () => enregistrerTexte().catch(App.erreur));
  }

  const bEnregistrer = el("button", { type: "button", class: "btn-second", texte: "Enregistrer le brouillon", onclick: () => enregistrerTexte().catch(App.erreur) });
  const bPublier = armer(el("button", { type: "button", class: "btn-principal at-publier", texte: "Publier le patchnote" }), "Confirmer la publication", async () => {
    await enregistrerTexte();
    const r = await App.rpc("patchnote_publier");
    [B, publies] = await Promise.all([App.rpc("patchnote_brouillon"), App.api.patchnotes()]);
    preparerChamps();
    App.toast(r.objets ? `Patchnote publié : ${r.objets} objet${r.objets > 1 ? "s" : ""} mis à jour pour tous les joueurs.` : "Patchnote publié.", { type: "succes", duree: 7000 });
    // Le catalogue en ligne vient de changer : on recharge pour repartir d'objets à jour.
    if (r.objets) setTimeout(() => location.reload(), 1600);
  });
  const bRetablir = armer(el("button", { type: "button", class: "btn-danger", texte: "Tout rétablir" }), "Confirmer : abandonner les objets à l'essai", async () => {
    B = await App.rpc("patchnote_retablir");
    App.toast("Tous les objets à l'essai sont revenus aux valeurs en ligne.");
  });

  function preparerChamps() { version.value = B.version || ""; titre.value = B.titre || ""; texte.value = B.texte || ""; enregistre = cleTexte(); etatTexte.textContent = ""; }
  function corriger(p) {
    const t = el("input", { type: "text", maxlength: "120", value: p.titre }), x = el("textarea", { maxlength: "20000" }); x.value = p.texte || "";
    const b = el("button", { type: "button", class: "btn-principal", texte: "Enregistrer la correction" });
    b.onclick = async () => {
      b.disabled = true;
      try { await App.rpc("patchnote_corriger", { p_id: p.id, p_titre: t.value, p_texte: x.value }); publies = await App.api.patchnotes(); App.fermerTiroir(); App.toast("Patchnote corrigé.", { type: "succes" }); rendre(); }
      catch (e) { App.erreur(e); b.disabled = false; }
    };
    App.tiroir({ titre: "Corriger la version " + p.version, contenu: el("div", { class: "at-form" }, el("label", {}, "Titre", t), el("label", {}, "Texte", x),
      el("p", { class: "mention", texte: "Seuls le titre et le texte se corrigent : les objets publiés gardent leur photo avant / après." }), el("div", { class: "at-actions" }, b)) });
  }
  function rendre() {
    const n = (B.objets || []).length;
    zoneObjets.replaceChildren(
      el("p", {}, el("b", { class: "num", texte: String(n) }), n > 1 ? " objets à l'essai diffèrent du jeu en ligne." : n === 1 ? " objet à l'essai diffère du jeu en ligne." : " objet à l'essai : le catalogue en ligne ne changera pas."),
      el("div", { class: "at-actions", style: { marginTop: "12px" } }, el("a", { class: "btn-second", href: "simulateur.html", texte: "Modifier et simuler dans le Simulateur" }), n ? bRetablir : null));
    bPublier.disabled = !version.value.trim() || !titre.value.trim() || (!n && !texte.value.trim());
    majApercu();
    zonePublies.replaceChildren(...(publies.length ? publies.map((p) => el("div", { class: "at-publie" },
      el("span", { class: "pilule", texte: "Version " + p.version }), el("b", { texte: p.titre }),
      el("span", { class: "mention", texte: date(p.publie_le) + " · " + (p.objets || []).length + " objet" + ((p.objets || []).length > 1 ? "s" : "") + (p.corrige_le ? " · corrigé" : "") }),
      el("button", { type: "button", class: "btn-second", texte: "Corriger le texte", onclick: () => corriger(p) })))
      : [el("p", { class: "mention", texte: "Aucun patchnote publié pour l'instant." })]));
  }
  for (const champ of [version, titre, texte]) champ.addEventListener("input", () => { bPublier.disabled = !version.value.trim() || !titre.value.trim() || (!(B.objets || []).length && !texte.value.trim()); });

  main.append(
    el("header", { class: "entete-page" }, el("div", {}, el("h1", { texte: "Atelier patchnote" }),
      el("p", { texte: "Prépare le prochain patchnote ici. Tant que tu n'as pas publié, les joueurs gardent les objets en ligne et ne voient rien de ce brouillon." }))),
    el("div", { class: "at-grille" },
      el("section", { class: "panneau-b" }, el("h2", { class: "at-titre", texte: "Le texte" }),
        el("div", { class: "at-form" }, el("div", { class: "at-duo" }, el("label", {}, "Version", version), el("label", {}, "Titre", titre)),
          el("label", {}, "Explications pour les joueurs", texte),
          el("p", { class: "mention", texte: "Mise en forme : une ligne « ## Sous-titre » fait un sous-titre, une ligne « - point » fait une liste, une ligne vide sépare deux paragraphes." }),
          el("div", { class: "at-actions" }, bEnregistrer, etatTexte))),
      el("section", { class: "panneau-b" }, el("h2", { class: "at-titre", texte: "Les objets à l'essai" }), zoneObjets,
        el("p", { class: "mention", style: { marginTop: "14px" }, texte: "Publier applique ces objets au jeu, garde leur photo avant / après, annonce le patchnote dans la cloche de chaque joueur et recalcule les puissances. Les règles à l'essai (200 PV de base, puissance par budget) sont dans le code du jeu : elles se basculent à part." }),
        el("div", { class: "at-actions", style: { marginTop: "16px" } }, bPublier))),
    el("section", { class: "section-page" }, el("h2", { class: "at-titre", texte: "Aperçu du patchnote" }), apercu),
    el("section", { class: "section-page" }, el("h2", { class: "at-titre", texte: "Déjà publiés" }), zonePublies));
  preparerChamps(); rendre();
});
})();
