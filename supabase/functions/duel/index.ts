// Amorce de la fonction `duel` : c'est ce fichier, et lui seul, qui est déployé chez Supabase.
// Tout le code est dans serveur.ts (et moteur.ts), importé depuis le dépôt public, épinglé à un commit :
// le serveur exécute exactement le code du dépôt. Pour mettre à jour : pousser, remplacer le commit ci-dessous, redéployer.
import { createClient } from "npm:@supabase/supabase-js@2";
import { creerServeur } from "https://raw.githubusercontent.com/MrShyDiver/rpg-refonte/2b04c756df53dc84641b7027f446f48bd207f326/supabase/functions/duel/serveur.ts";

Deno.serve(creerServeur(createClient));
