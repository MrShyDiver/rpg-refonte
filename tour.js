/* Stream RPG — page Tour : mode solo. Trente étages, un gardien par étage (l'écho d'un joueur ramené à la puissance de l'étage).
   Gagner fait monter d'un étage et ne coûte rien ; perdre coûte une tentative. Le serveur choisit le gardien et calcule le combat. */
"use strict";
(function () {
const { el, icone, fmt } = App;
const COLS = [["arme", "Arme"], ["armure", "Armure"], ["offhand", "Main gauche"], ["strategeme", "Stratagème"]];
const pluriel = (n, mot) => fmt(n) + " " + mot + (n > 1 ? "s" : "");
const prix = (p) => [el("span", { class: "pilule legendaire" }, icone("i-medaille"), "+" + pluriel(p.medailles, "médaille")),
  p.lootbox ? el("span", { class: "pilule epique" }, icone("i-coffre-ligne"), "+" + fmt(p.lootbox) + " lootbox") : null];

App.demarrer("tour", async (main, ctx) => {
  const moi = ctx.joueur;
  const zone = el("div", {}, el("div", { class: "chargement", texte: "Chargement de la Tour…" }));
  main.append(
    el("header", { class: "entete-page" }, el("div", {},
      el("h1", { texte: "La Tour" }),
      el("p", { texte: "Un mode solo : un gardien par étage, de plus en plus fort. Chaque étage franchi pour la première fois te récompense." }))),
    zone);

  const [etat, joueurs, tours] = await Promise.all([App.api.tour(), App.api.joueurs(), App.api.tours().catch(() => [])]);
  let apercu = null;
  if (etat.etage < etat.etages) { try { apercu = await App.lancerTour(true); } catch (e) { console.warn(e); } }
  const parId = new Map(joueurs.map((j) => [j.id, j])), parLogin = new Map(joueurs.map((j) => [j.twitch_login, j]));

  function blocEtage() {
    if (etat.etage >= etat.etages) {
      return el("section", { class: "section-page tr-etage sommet", "aria-labelledby": "t-etage" },
        el("div", {}, el("h2", { class: "tr-num", id: "t-etage", texte: "Sommet atteint" }),
          el("p", { class: "sous", style: { margin: "10px auto 0" }, texte: "Tu as vaincu les " + fmt(etat.etages) + " gardiens. De nouveaux étages viendront avec les saisons." })));
    }
    const p = etat.paliers[etat.etage], g = apercu && apercu.gardien, source = g && parLogin.get(g.login), reste = etat.tentatives_restantes;
    const pips = el("span", { class: "lg-pips", role: "img", "aria-label": `${reste} tentative${reste > 1 ? "s" : ""} sur ${etat.tentatives}` },
      Array.from({ length: etat.tentatives }, (_, i) => el("i", { class: i < reste ? "plein" : null })));
    const niveaux = g ? new Map(Object.values(g.equipement).filter(Boolean).map((x) => [x.numero, x.niveau])) : new Map();
    return el("section", { class: "section-page tr-etage", "aria-labelledby": "t-etage" },
      el("div", {},
        el("h2", { class: "tr-num", id: "t-etage" }, "Étage " + fmt(p.etage), el("small", { texte: "sur " + fmt(etat.etages) })),
        el("p", { class: "sous", texte: etat.etage ? `Tu as franchi ${pluriel(etat.etage, "étage")}. Le gardien suivant est à ${fmt(p.puissance)} de puissance.` : `Le premier gardien t'attend, à ${fmt(p.puissance)} de puissance.` }),
        el("div", { class: "tr-prix" }, prix(p)),
        el("p", { class: "tr-essais" }, pips, el("span", {}, el("b", { class: "num", texte: `${fmt(reste)} / ${fmt(etat.tentatives)}` }), " tentatives aujourd'hui · seule une défaite en coûte une")),
        reste > 0 && g ? el("a", { class: "btn-principal", href: "combat.html?mode=tour" }, icone("i-epees"), "Affronter le gardien")
          : el("button", { type: "button", class: "btn-principal", "aria-disabled": "true",
            onclick: () => App.toast(g ? "Tes tentatives du jour sont épuisées : la Tour t'attend demain." : "Aucun gardien disponible pour l'instant : reviens un peu plus tard.", { titre: g ? "Plus de tentative" : "Tour fermée" }) }, icone("i-epees"), reste > 0 ? "Gardien indisponible" : "Reviens demain")),
      g ? el("div", { class: "tr-gardien" },
        el("div", { class: "tr-gardien-ident" }, App.avatar(source || { display_name: "?" }, 48),
          el("div", {}, el("b", { texte: "Gardien de l'étage " + fmt(p.etage) }),
            el("span", { class: "mention" }, "L'", el("a", { class: "lien", href: "aide.html#echo", target: "_blank", rel: "noopener", texte: "écho" }), " de " + ((source && source.display_name) || g.login) + ", ramené à ", el("b", { class: "num", texte: fmt(g.puissance) }), " de puissance"))),
        el("div", { class: "lg-build" }, COLS.map(([c, lib]) => {
          const x = g.equipement[c], o = x ? App.objet(x.numero) : null;
          return o ? App.carte(o, { niveau: Math.min(niveaux.get(x.numero) || 0, App.niveauMax(o.rarete)), equipe: false })
            : el("div", { class: "case-vide" }, el("span", { texte: lib }), el("small", { texte: "Vide" }));
        }))) : el("p", { class: "mention", texte: "Le gardien n'a pas pu être chargé. Recharge la page." }));
  }

  function blocPaliers() {
    return el("section", { class: "section-page", "aria-labelledby": "t-paliers" },
      el("div", { class: "lg-titre-ligne" }, el("div", {}, el("h2", { id: "t-paliers", texte: "Les étages" }),
        el("p", { class: "sous", texte: "Une récompense par étage, la première fois que tu le franchis. Des lootbox t'attendent tous les 5 étages." }))),
      el("ol", { class: "tr-paliers" }, etat.paliers.map((p) => {
        const franchi = p.etage <= etat.etage, prochain = p.etage === etat.etage + 1;
        return el("li", { class: (franchi ? "franchi" : prochain ? "prochain" : "") + (p.lootbox ? " butin" : ""), "aria-current": prochain ? "step" : null },
          el("b", {}, "Étage " + fmt(p.etage), franchi ? icone("i-coche") : null),
          el("span", { class: "num", texte: fmt(p.puissance) + " de puissance" }),
          el("span", {}, "+" + pluriel(p.medailles, "médaille"), p.lootbox ? el("span", { class: "tr-lb", texte: " · +" + fmt(p.lootbox) + " lootbox" }) : null));
      })));
  }

  function blocClassement() {
    const lignes = tours.filter((t) => t.etage > 0 && parId.has(t.player_id) && !App.horsClassement(parId.get(t.player_id)))
      .sort((a, b) => b.etage - a.etage || new Date(a.franchi_le) - new Date(b.franchi_le)).slice(0, 20);
    return el("section", { class: "section-page", "aria-labelledby": "t-clas" },
      el("h2", { id: "t-clas", texte: "Les grimpeurs" }),
      el("p", { class: "sous", texte: "Les 20 joueurs montés le plus haut. À étage égal, le premier arrivé est devant." }),
      lignes.length ? el("ol", { class: "lg-classement" }, lignes.map((t, i) => {
        const j = parId.get(t.player_id);
        return el("li", { class: j.id === moi.id ? "moi" : null }, el("span", { class: "lg-place num", texte: String(i + 1) }), App.avatar(j, 36),
          el("a", { href: "profil.html?joueur=" + encodeURIComponent(j.twitch_login), texte: j.display_name || j.twitch_login }),
          el("span", { class: "lg-clas-rang" }), el("b", { class: "num", texte: "Étage " + fmt(t.etage) }), el("span", { class: "mention", texte: App.ilYa(t.franchi_le) }));
      })) : el("p", { class: "mention", texte: "Personne n'a encore franchi d'étage. La première place est à prendre." }));
  }

  zone.replaceChildren(blocEtage(), blocPaliers(), blocClassement());
});
})();
