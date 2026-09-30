// Edge Function `duel` — Stream RPG.
// POST { adversaire: "<login>", mode: "classe" | "entrainement" }, Authorization: Bearer <jeton de session>.
// Le combat est calculé ICI (moteur.ts, copié à côté au déploiement), jamais dans le navigateur ;
// l'écriture (ticket, récompenses duel.cs, historique, replay) est faite en une transaction par
// la RPC enregistrer_duel (service_role uniquement), qui revérifie toutes les règles sous verrou.
import { createClient } from "npm:@supabase/supabase-js@2";
import { simulerDuel, type Equipement, type JoueurEntree } from "./moteur.ts";

const ORIGINES = /^(https:\/\/mrshydiver\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const COLONNES = "id,twitch_login,display_name,avatar_url,atk_stacks,def_stacks,pv_stacks,spd_stacks,luck_stacks," +
  "tickets,abonne_jusqu_au,combat_details,victoires,defaites,egalites,points,medailles,serie_actuelle";
const EMPLACEMENTS = ["arme", "offhand", "armure", "strategeme"] as const;
const DELAI_ENTRE_DUELS_MS = 8000; // identique à enregistrer_duel
// SQLSTATE levés par enregistrer_duel → statut HTTP (message déjà rédigé pour le joueur).
const STATUT_PAR_CODE: Record<string, number> = { RJ400: 400, RJ402: 403, RJ403: 403, RJ404: 404, RJ409: 409, RJ429: 429 };

class ErreurJoueur extends Error {
  constructor(public statut: number, message: string) { super(message); }
}

function entetesCors(req: Request): Record<string, string> {
  const origine = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origine && ORIGINES.test(origine) ? origine : "https://mrshydiver.github.io",
    // supabase-js ajoute parfois des en-têtes (x-region…) : on accepte ceux annoncés au preflight (l'auth reste le JWT).
    "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") ?? "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function lireCorps(corps: unknown): { adversaire: string; mode: "classe" | "entrainement" } {
  const c = (corps ?? {}) as Record<string, unknown>;
  const adversaire = typeof c.adversaire === "string" ? c.adversaire.trim().replace(/^@/, "").toLowerCase() : "";
  if (!/^[a-z0-9_]{1,25}$/.test(adversaire)) throw new ErreurJoueur(400, "Indique le pseudo Twitch de ton adversaire");
  if (c.mode !== "classe" && c.mode !== "entrainement") throw new ErreurJoueur(400, "Choisis un mode : classé ou entraînement");
  return { adversaire, mode: c.mode };
}

type Joueur = Record<string, any>;

// Construit l'entrée moteur d'un joueur à partir de la base uniquement (jamais du client).
function entree(j: Joueur, loadout: Joueur | undefined, items: Map<number, any>, niveaux: Map<string, number>, protection = false): JoueurEntree {
  const equipement: JoueurEntree["equipement"] = {};
  for (const e of EMPLACEMENTS) {
    const n = loadout?.[e];
    const niveau = niveaux.get(j.id + ":" + n);
    equipement[e] = n != null && items.has(n) && niveau != null ? { data: items.get(n), niveau, numero: n } as Equipement : null;
  }
  return {
    login: j.twitch_login, display_name: j.display_name, avatar_url: j.avatar_url ?? null,
    stacks: { atk: j.atk_stacks, def: j.def_stacks, pv: j.pv_stacks, spd: j.spd_stacks, luck: j.luck_stacks },
    equipement,
    infos: { victoires: j.victoires, defaites: j.defaites, egalites: j.egalites, points: j.points,
             medailles: j.medailles, serie_actuelle: j.serie_actuelle, protection_active: protection },
  };
}

function verifier<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

export async function traiter(req: Request): Promise<Response> {
  const cors = entetesCors(req);
  const repondre = (statut: number, corps: unknown) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return repondre(405, { erreur: "Méthode non autorisée" });

  try {
    const { adversaire, mode } = lireCorps(await req.json().catch(() => null));

    const url = Deno.env.get("SUPABASE_URL")!;
    const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const session = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false },
    });
    const { data: auth } = await session.auth.getUser(jeton);
    if (!auth?.user) throw new ErreurJoueur(401, "Connecte-toi avec Twitch pour jouer");

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const [moi, cible] = await Promise.all([
      admin.from("players").select(COLONNES).eq("auth_user_id", auth.user.id).maybeSingle().then(verifier),
      admin.from("players").select(COLONNES).eq("twitch_login", adversaire).maybeSingle().then(verifier),
    ]) as [Joueur | null, Joueur | null];

    // Contrôles rapides (messages clairs) ; enregistrer_duel refait tout sous verrou.
    if (!moi) throw new ErreurJoueur(403, "Connecte-toi avec Twitch pour jouer");
    if (!cible) throw new ErreurJoueur(404, `Personne ne s'appelle « ${adversaire} » dans l'arène`);
    if (cible.id === moi.id) throw new ErreurJoueur(400, "Tu ne peux pas te défier toi-même !");
    if (mode === "classe" && moi.tickets <= 0) {
      throw new ErreurJoueur(403, "Tu n'as plus de ticket de duel. Les tickets gratuits sont distribués avec les bits par une âme charitable ou lors d'évènements.");
    }
    if (mode === "entrainement" && !(moi.abonne_jusqu_au && new Date(moi.abonne_jusqu_au) > new Date())) {
      throw new ErreurJoueur(403, "L'entraînement gratuit est réservé aux abonnés de la chaîne Twitch");
    }
    const dernier = verifier(await admin.from("duels").select("joue_le").eq("attaquant_id", moi.id)
      .order("joue_le", { ascending: false }).limit(1)) as { joue_le: string }[];
    if (dernier[0] && Date.now() - new Date(dernier[0].joue_le).getTime() < DELAI_ENTRE_DUELS_MS) {
      throw new ErreurJoueur(429, "Doucement ! Attends quelques secondes avant de relancer un duel");
    }

    // Builds actuels des deux joueurs : loadout + niveaux d'inventaire + fiches d'objets.
    const ids = [moi.id, cible.id];
    const loadouts = verifier(await admin.from("loadouts").select("player_id,arme,offhand,armure,strategeme").in("player_id", ids)) as Joueur[];
    const numeros = [...new Set(loadouts.flatMap((l) => EMPLACEMENTS.map((e) => l[e]).filter((n) => n != null)))] as number[];
    const [items, inventaire] = numeros.length
      ? await Promise.all([
        admin.from("items").select("numero,data").in("numero", numeros).then(verifier),
        admin.from("inventory").select("player_id,item_numero,niveau").in("player_id", ids).in("item_numero", numeros).then(verifier),
      ]) as [Joueur[], Joueur[]]
      : [[], []];
    const parNumero = new Map(items.map((i) => [i.numero, i.data]));
    const niveaux = new Map(inventaire.map((i) => [i.player_id + ":" + i.item_numero, i.niveau as number]));
    const loadoutDe = (id: string) => loadouts.find((l) => l.player_id === id);

    // Protection du défenseur (duel.cs : helldivers_protection) : -20 % de dégâts subis par le défenseur.
    const protection = Number(cible.combat_details?.protectionsActives ?? 0) > 0;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const resultat = simulerDuel(
      entree(moi, loadoutDe(moi.id), parNumero, niveaux),
      entree(cible, loadoutDe(cible.id), parNumero, niveaux, protection),
      { seed, mode, protection_active: mode === "classe" && protection },
    );

    const { data, error } = await admin.rpc("enregistrer_duel", {
      p_attaquant: moi.id, p_defenseur: cible.id, p_mode: mode, p_vainqueur: resultat.vainqueur,
      p_stats: resultat.stats, p_replay: resultat.replay, p_seed: seed, p_protection: protection,
    });
    if (error) {
      const statut = STATUT_PAR_CODE[error.code ?? ""];
      if (statut) throw new ErreurJoueur(statut, error.message);
      throw error;
    }
    return repondre(200, data);
  } catch (e) {
    if (e instanceof ErreurJoueur) return repondre(e.statut, { erreur: e.message });
    console.error("[duel] erreur inattendue", e);
    return repondre(500, { erreur: "Le duel n'a pas pu se jouer. Réessaie dans un instant." });
  }
}

Deno.serve(traiter);
