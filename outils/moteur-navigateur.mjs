// Génère moteur-bac.js (moteur de duel du serveur, exécutable dans le navigateur) pour le bac à sable de la recette.
// node outils/moteur-navigateur.mjs   (Node 22+ : retrait des types TypeScript intégré, aucune dépendance)
import { stripTypeScriptTypes } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const dossier = new URL("../supabase/functions/duel/", import.meta.url);
const js = (f) => stripTypeScriptTypes(readFileSync(new URL(f, dossier), "utf8"), { mode: "transform" });
const formule = js("formule-combat.gen.ts").replace(/^export \{[^}]*\};?\s*$/m, "");
const moteur = js("moteur.ts").replace(/^import \{[\s\S]*?\} from "\.\/formule-combat\.gen\.ts";?/m, "").replace(/^export /gm, "");
writeFileSync(new URL("../moteur-bac.js", import.meta.url), `// Généré par outils/moteur-navigateur.mjs depuis supabase/functions/duel/ : ne pas modifier à la main.
(function () {
"use strict";
${formule}
${moteur}
window.MoteurDuel = { simulerDuel, construireCombattant, VERSION_MOTEUR, CST }; // CST : le Simulateur y applique les règles à l'essai, le temps d'une simulation
})();
`);
console.log("moteur-bac.js écrit");
