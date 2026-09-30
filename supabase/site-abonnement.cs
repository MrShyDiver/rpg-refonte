// =============================================================================
// Streamer.bot -> site : un abonnement Twitch débloque l'entraînement gratuit sur le site.
//
// À coller dans UNE action Streamer.bot (Execute C# Code). Déclencheurs à ajouter à cette
// action (onglet Triggers > Twitch > Subscriptions) :
//   - Subscription        (nouvel abonné, y compris Prime)
//   - Resub               (réabonnement annoncé dans le chat)
//   - Gift Subscription   (abonnement offert : c'est le DESTINATAIRE qui est abonné)
// Ne PAS ajouter "Gift Bomb" : Twitch envoie aussi un "Gift Subscription" par destinataire,
// la bombe serait comptée deux fois (sans danger : l'appel est idempotent, mais inutile).
//
// Réglages : les mêmes variables GLOBALES persistantes que site-offrir.cs
//   rpg_supabase_url, rpg_supabase_anon, rpg_api_key, rpg_site_url (optionnel, pour le message)
//
// Effet : api_abonnement() marque le compte abonné pour N mois + 3 jours de grâce à partir
// de maintenant (jamais raccourci). Un événement reçu deux fois ne donne pas deux mois.
// =============================================================================
using System;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private static readonly HttpClient HTTP = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

    public bool Execute()
    {
        string url    = CPH.GetGlobalVar<string>("rpg_supabase_url", true);
        string anon   = CPH.GetGlobalVar<string>("rpg_supabase_anon", true);
        string cleApi = CPH.GetGlobalVar<string>("rpg_api_key", true);
        string site   = CPH.GetGlobalVar<string>("rpg_site_url", true) ?? "";
        if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(anon) || string.IsNullOrEmpty(cleApi))
        {
            CPH.LogWarn("[RPG site] Variables globales rpg_supabase_url / rpg_supabase_anon / rpg_api_key manquantes.");
            return false;
        }

        // Abonnement offert : l'abonné est le destinataire, pas celui qui offre.
        bool offert = CPH.TryGetArg("recipientUserName", out string loginDest) && !string.IsNullOrEmpty(loginDest);
        string login  = offert ? loginDest : Arg("userName", null);
        string userId = offert ? Arg("recipientUserId", null) : Arg("userId", null);
        string pseudo = offert ? Arg("recipientUser", login) : Arg("user", login);
        if (string.IsNullOrEmpty(login))
        {
            CPH.LogWarn("[RPG site] Abonnement sans pseudo : déclencheur non reconnu.");
            return false;
        }

        // Durée : abonnement multi-mois payé d'avance / mois offerts, sinon 1 mois.
        int mois = 1;
        foreach (string cle in new[] { "multiMonthDuration", "monthsGifted", "durationMonths" })
            if (int.TryParse(Arg(cle, ""), out int m) && m > 1) { mois = Math.Min(m, 24); break; }

        var corps = new JObject
        {
            ["p_cle_api"]        = cleApi,
            ["p_twitch_user_id"] = userId,
            ["p_login"]          = login,
            ["p_tier"]           = Tier(Arg("tier", "")),
            ["p_mois"]           = mois,
        };

        try
        {
            var requete = new HttpRequestMessage(HttpMethod.Post, url.TrimEnd('/') + "/rest/v1/rpc/api_abonnement")
            {
                Content = new StringContent(corps.ToString(), Encoding.UTF8, "application/json")
            };
            requete.Headers.Add("apikey", anon);
            requete.Headers.Add("Authorization", "Bearer " + anon);
            HttpResponseMessage res = HTTP.SendAsync(requete).Result;
            string texte = res.Content.ReadAsStringAsync().Result;
            if (!res.IsSuccessStatusCode)
            {
                string message = TryParse(texte)?["message"]?.ToString() ?? texte;
                throw new Exception("HTTP " + (int)res.StatusCode + " : " + message);
            }
        }
        catch (Exception e)
        {
            CPH.LogError("[RPG site] Abonnement non enregistré pour " + login + " : " + (e.InnerException?.Message ?? e.Message));
            return false;
        }

        // Un seul message par abonné, sauf pendant une pluie de subs offerts (pas de spam).
        bool pluie = Arg("fromSubBomb", "false").ToLower() == "true" || Arg("fromGiftBomb", "false").ToLower() == "true";
        if (!pluie)
            CPH.SendMessage("@" + pseudo + " merci pour l'abonnement ! L'entraînement gratuit est débloqué sur le site : " + site);
        return true;
    }

    // Streamer.bot donne "tier 1" / "tier 2" / "tier 3" / "prime" (ou "1000"/"2000"/"3000").
    private static string Tier(string brut)
    {
        string t = (brut ?? "").ToLower();
        if (t.Contains("prime")) return "prime";
        if (t.Contains("3")) return "3000";
        if (t.Contains("2")) return "2000";
        return "1000";
    }

    private string Arg(string nom, string defaut)
    {
        return CPH.TryGetArg(nom, out object v) && v != null && v.ToString() != "" ? v.ToString() : defaut;
    }

    private static JObject TryParse(string texte)
    {
        try { return JObject.Parse(texte); } catch { return null; }
    }
}
