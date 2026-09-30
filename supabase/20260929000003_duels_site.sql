-- =====================================================================
-- Stream RPG — duels sur le site (29/09)
-- Replays en base, abonnés Twitch (mode entraînement), écriture atomique d'un duel
-- calculé par l'Edge Function `duel`. Règles de récompense = duel.cs (Streamer.bot),
-- branche "!duel ciblé" (pas l'Auto Battle).
-- =====================================================================

-- ---------- 1. Replays des duels joués sur le site ----------
create table if not exists public.duel_replays (
  duel_id text primary key references public.duels(id) on delete cascade,
  donnees jsonb not null
);
alter table public.duel_replays enable row level security;
drop policy if exists "lecture publique" on public.duel_replays;
create policy "lecture publique" on public.duel_replays for select using (true);
revoke insert, update, delete, truncate on public.duel_replays from anon, authenticated;

-- ---------- 2. Abonnés Twitch ----------
alter table public.players
  add column if not exists abonne_jusqu_au timestamptz,
  add column if not exists abonne_tier text check (abonne_tier in ('1000', '2000', '3000', 'prime'));

-- Appelée par Streamer.bot (site-abonnement.cs) sur sub / resub / gift sub.
-- Idempotente : l'abonnement couvre p_mois mois (+3 jours de grâce) À PARTIR DE MAINTENANT,
-- sans jamais raccourcir une échéance plus lointaine. Un événement reçu deux fois ne donne
-- donc pas deux mois (contrairement à un cumul max(now, échéance) + p_mois).
create or replace function public.api_abonnement(
  p_cle_api text, p_twitch_user_id text, p_login text, p_tier text default '1000', p_mois integer default 1)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_tier text := lower(coalesce(nullif(trim(p_tier), ''), '1000'));
  v_player uuid;
  j public.players;
begin
  perform private.verifier_cle(p_cle_api);
  if v_tier not in ('1000', '2000', '3000', 'prime') then
    raise exception 'tier inconnu : % (attendu : 1000, 2000, 3000 ou prime)', p_tier;
  end if;
  if p_mois is null or p_mois < 1 or p_mois > 24 then
    raise exception 'mois hors limites : % (1 à 24)', p_mois;
  end if;

  v_player := private.trouver_ou_creer_joueur(p_twitch_user_id, p_login, null);
  update public.players set
    abonne_jusqu_au = greatest(coalesce(abonne_jusqu_au, now()),
                               now() + make_interval(months => p_mois) + interval '3 days'),
    abonne_tier = v_tier
  where id = v_player
  returning * into j;

  return jsonb_build_object('statut', 'ok', 'login', j.twitch_login, 'compte_site', j.auth_user_id is not null,
                            'abonne_jusqu_au', j.abonne_jusqu_au, 'tier', j.abonne_tier);
end $$;
revoke all on function public.api_abonnement(text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.api_abonnement(text, text, text, text, integer) to anon;

-- ---------- 3. Écriture atomique d'un duel ----------
-- +delta sur un compteur de combat_details (chemin de 1 ou 2 clés), en créant ce qui manque.
create or replace function private.cd_plus(p_cd jsonb, p_chemin text[], p_delta integer default 1)
returns jsonb language sql immutable set search_path to '' as $$
  select case when cardinality(p_chemin) = 1
    then coalesce(p_cd, '{}') || jsonb_build_object(p_chemin[1], coalesce((p_cd ->> p_chemin[1])::int, 0) + p_delta)
    else coalesce(p_cd, '{}') || jsonb_build_object(p_chemin[1],
           coalesce(p_cd -> p_chemin[1], '{}') || jsonb_build_object(p_chemin[2], coalesce((p_cd #>> p_chemin)::int, 0) + p_delta))
  end $$;

-- Bilan d'UN joueur après un duel classé (duel.cs, bloc après ResoudreCombat).
-- p_res : 'v' | 'd' | 'e'. p_suivi = false pour les comptes exclus (EstCompteExclu) :
-- ils gagnent quand même points et médailles, mais aucun bilan/série/dégâts/catégorie.
create or replace function private.appliquer_bilan(
  p_id uuid, p_res text, p_categorie text, p_medailles integer, p_points integer,
  p_degats integer, p_subis integer, p_coup integer, p_suivi boolean,
  p_ticket integer, p_protection integer, p_tranche_attaque text)
returns public.players language plpgsql set search_path to '' as $$
declare
  j public.players;
  c jsonb;
begin
  select combat_details into c from public.players where id = p_id;
  if p_suivi then
    c := private.cd_plus(c, array['categories', p_categorie]);
    if p_tranche_attaque is not null then c := private.cd_plus(c, array[p_tranche_attaque]); end if;
  end if;
  if p_protection <> 0 then c := private.cd_plus(c, '{protectionsActives}', p_protection); end if;

  update public.players set
    tickets        = tickets - p_ticket,
    medailles      = medailles + p_medailles,
    medailles_duel = medailles_duel + p_medailles,
    points         = points + p_points,
    victoires      = victoires + case when p_suivi and p_res = 'v' then 1 else 0 end,
    defaites       = defaites  + case when p_suivi and p_res = 'd' then 1 else 0 end,
    egalites       = egalites  + case when p_suivi and p_res = 'e' then 1 else 0 end,
    serie_actuelle = case when not p_suivi then serie_actuelle when p_res = 'v' then serie_actuelle + 1 else 0 end,
    serie_record   = case when p_suivi and p_res = 'v' then greatest(serie_record, serie_actuelle + 1) else serie_record end,
    degats_infliges = degats_infliges + case when p_suivi then p_degats else 0 end,
    degats_subis    = degats_subis    + case when p_suivi then p_subis else 0 end,
    plus_gros_coup  = case when p_suivi then greatest(plus_gros_coup, p_coup) else plus_gros_coup end,
    combat_details  = c
  where id = p_id
  returning * into j;
  return j;
end $$;

-- Appelée UNIQUEMENT par l'Edge Function `duel` (service_role) avec le résultat du moteur.
-- Revérifie tout sous verrou : le navigateur n'a jamais la main sur le résultat.
-- Erreurs "joueur" : SQLSTATE RJ4xx (message à afficher tel quel) ; RJ409 = état changé, relancer.
create or replace function public.enregistrer_duel(
  p_attaquant uuid, p_defenseur uuid, p_mode text, p_vainqueur text,
  p_stats jsonb, p_replay jsonb, p_seed bigint, p_protection boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  a public.players; d public.players;
  v_classe  boolean := p_mode = 'classe';
  v_pa      float8 := coalesce((p_stats ->> 'power_attaquant')::float8, 0);
  v_pd      float8 := coalesce((p_stats ->> 'power_defenseur')::float8, 0);
  v_deg_a   int := coalesce((p_stats ->> 'degats_attaquant')::numeric, 0)::int;
  v_deg_d   int := coalesce((p_stats ->> 'degats_defenseur')::numeric, 0)::int;
  v_coup_a  int := coalesce((p_stats ->> 'plus_gros_coup_attaquant')::numeric, 0)::int;
  v_coup_d  int := coalesce((p_stats ->> 'plus_gros_coup_defenseur')::numeric, 0)::int;
  v_rounds  int := coalesce((p_stats ->> 'rounds')::numeric, 0)::int;
  v_egalite boolean := p_vainqueur is null;
  v_att_gagne boolean := p_vainqueur is not distinct from 'attaquant';
  v_ecart   float8;
  v_tranche text;
  pts_a int := 0; pts_d int := 0; med_a int := 0; med_d int := 0;
  cat_a text; cat_d text;
  v_prot    boolean;
  v_dernier timestamptz;
  v_id      text := 'site-' || gen_random_uuid();
  v_exclus  constant text[] := array['mrshydiver', 'mikumosana'];  -- duel.cs EstCompteExclu
  v_statut_a text; v_statut_d text;
  v_vainqueur_login text;
  v_replay  jsonb;
begin
  if p_mode is null or p_mode not in ('classe', 'entrainement') then
    raise exception 'Mode de duel inconnu' using errcode = 'RJ400';
  end if;
  if p_vainqueur is not null and p_vainqueur not in ('attaquant', 'defenseur') then
    raise exception 'Résultat de duel invalide' using errcode = 'RJ400';
  end if;
  if p_attaquant is null or p_defenseur is null then
    raise exception 'Adversaire introuvable' using errcode = 'RJ404';
  end if;
  if p_attaquant = p_defenseur then
    raise exception 'Tu ne peux pas te défier toi-même !' using errcode = 'RJ400';
  end if;

  -- Verrou des deux lignes, toujours dans le même ordre (pas d'interblocage entre A→B et B→A).
  perform 1 from public.players where id in (p_attaquant, p_defenseur) order by id for update;
  select * into a from public.players where id = p_attaquant;
  select * into d from public.players where id = p_defenseur;
  if a.id is null or d.id is null then
    raise exception 'Adversaire introuvable' using errcode = 'RJ404';
  end if;

  -- Anti-spam (site) : 8 s entre deux duels du même attaquant, tous modes confondus.
  select max(joue_le) into v_dernier from public.duels where attaquant_id = a.id;
  if v_dernier > now() - interval '8 seconds' then
    raise exception 'Doucement ! Attends quelques secondes avant de relancer un duel' using errcode = 'RJ429';
  end if;

  if v_classe then
    if a.tickets <= 0 then   -- ticket-duel.cs
      raise exception 'Tu n''as plus de ticket de duel. Les tickets gratuits sont distribués avec les bits par une âme charitable ou lors d''évènements.'
        using errcode = 'RJ402';
    end if;
  else
    if a.abonne_jusqu_au is null or a.abonne_jusqu_au <= now() then
      raise exception 'L''entraînement gratuit est réservé aux abonnés de la chaîne Twitch' using errcode = 'RJ403';
    end if;
    -- ponytail: plafond anti-abus de stockage (un replay par entraînement), à ajuster si besoin.
    if (select count(*) from public.duels
         where attaquant_id = a.id and type = 'entrainement' and joue_le > now() - interval '24 hours') >= 50 then
      raise exception 'Tu as atteint la limite de 50 entraînements sur 24 h : reviens un peu plus tard' using errcode = 'RJ429';
    end if;
  end if;

  -- Protection du défenseur (duel.cs : helldivers_protection → combat_details.protectionsActives) :
  -- si > 0, le défenseur subit 20 % de dégâts en moins et une charge est consommée (classé seulement).
  -- Le moteur a été lancé avec p_protection : s'il ne correspond plus, un autre duel l'a consommée entre-temps.
  v_prot := coalesce((d.combat_details ->> 'protectionsActives')::int, 0) > 0;
  if v_prot is distinct from coalesce(p_protection, false) then
    raise exception 'La protection de ton adversaire vient de changer : relance le duel' using errcode = 'RJ409';
  end if;

  -- Tranche de puissance (duel.cs : TRANCHE_LARGEUR_RELATIF = 0.30).
  v_ecart := (v_pd - v_pa) / greatest(1.0, v_pa);
  v_tranche := case when v_ecart > 0.30 then 'au_dessus' when v_ecart < -0.30 then 'en_dessous' else 'dans_tranche' end;

  if v_tranche = 'dans_tranche' then
    v_statut_a := 'Combat équitable'; v_statut_d := 'Combat équitable';
  elsif v_tranche = 'au_dessus' then
    v_statut_a := 'Outsider'; v_statut_d := 'Favori';
  else
    v_statut_a := 'Favori'; v_statut_d := 'Outsider';
  end if;
  v_vainqueur_login := case when v_egalite then null when v_att_gagne then a.twitch_login else d.twitch_login end;

  if v_classe then
    -- Points et médailles (duel.cs, constantes CIBLE_* et MED_*).
    if v_tranche = 'dans_tranche' then
      if v_egalite then pts_a := 500; pts_d := 500; med_a := 5; med_d := 5;
      elsif v_att_gagne then pts_a := 1500; med_a := 12; med_d := 2;
      else pts_d := 1000; med_d := 10; med_a := 2; end if;
    elsif v_tranche = 'au_dessus' then
      if v_egalite then pts_a := 1500; med_a := 12; med_d := 3;
      elsif v_att_gagne then pts_a := 2250; med_a := 20; med_d := 2;
      else pts_d := 500; med_d := 4; med_a := 2; end if;
    else
      if v_egalite then pts_d := 1500; med_d := 15; med_a := 1;
      elsif v_att_gagne then pts_d := 1000; med_d := 10; pts_a := 0; med_a := 3;
      else pts_d := 1500; med_d := 22; med_a := 1; end if;
    end if;

    -- Catégories (duel.cs IncrementerCategorie), clés camelCase de combat_details.categories.
    if v_egalite then
      cat_a := case v_tranche when 'au_dessus' then 'egaliteValeureuse' when 'en_dessous' then 'egaliteDeshonorable' else 'egaliteEquitable' end;
      cat_d := case v_tranche when 'au_dessus' then 'egaliteDeshonorable' when 'en_dessous' then 'egaliteValeureuse' else 'egaliteEquitable' end;
    elsif v_att_gagne then
      cat_a := case v_tranche when 'au_dessus' then 'victoireValeureuse' when 'en_dessous' then 'victoireDeshonorable' else 'victoireEquitable' end;
      cat_d := case v_tranche when 'au_dessus' then 'defaiteDeshonorable' when 'en_dessous' then 'defaiteValeureuse' else 'defaiteEquitable' end;
    else
      cat_d := case v_tranche when 'en_dessous' then 'defenseExceptionnelle' when 'au_dessus' then 'defenseDeshonorable' else 'defenseEquitable' end;
      cat_a := case v_tranche when 'au_dessus' then 'defaiteValeureuse' when 'en_dessous' then 'defaiteDeshonorable' else 'defaiteEquitable' end;
    end if;

    a := private.appliquer_bilan(a.id,
      case when v_egalite then 'e' when v_att_gagne then 'v' else 'd' end, cat_a, med_a, pts_a,
      v_deg_a, v_deg_d, v_coup_a, not (a.twitch_login = any (v_exclus)), 1, 0,
      case v_tranche when 'au_dessus' then 'attaquesAuDessus' when 'en_dessous' then 'attaquesEnDessous' else 'attaquesDansTranche' end);
    d := private.appliquer_bilan(d.id,
      case when v_egalite then 'e' when v_att_gagne then 'd' else 'v' end, cat_d, med_d, pts_d,
      v_deg_d, v_deg_a, v_coup_d, not (d.twitch_login = any (v_exclus)), 0,
      case when v_prot then -1 else 0 end, null);
  end if;

  -- Replay = sortie du moteur + champs de bilan legacy (mêmes clés que obsData de duel.cs).
  v_replay := coalesce(p_replay, '{}') || jsonb_build_object(
    'id', v_id, 'date', now(), 'type', case when v_classe then 'duel' else 'entrainement' end,
    'mode', p_mode, 'seed', p_seed,
    'attaquant', a.twitch_login, 'defenseur', d.twitch_login,
    'vainqueur', coalesce(v_vainqueur_login, ''), 'egalite', v_egalite, 'tranche', v_tranche,
    'protection_active', v_prot, 'statut_attaquant', v_statut_a, 'statut_defenseur', v_statut_d,
    'victoires_attaquant', a.victoires, 'defaites_attaquant', a.defaites, 'egalites_attaquant', a.egalites,
    'victoires_defenseur', d.victoires, 'defaites_defenseur', d.defaites, 'egalites_defenseur', d.egalites,
    'points_attaquant', pts_a, 'points_defenseur', pts_d, 'lootbox_attaquant', 0, 'lootbox_defenseur', 0,
    'medailles_attaquant', med_a, 'medailles_defenseur', med_d,
    'power_attaquant', round(v_pa::numeric, 1), 'power_defenseur', round(v_pd::numeric, 1),
    'degats_infliges_attaquant', v_deg_a, 'degats_infliges_defenseur', v_deg_d,
    'plus_gros_coup_attaquant', v_coup_a, 'plus_gros_coup_defenseur', v_coup_d);

  insert into public.duels (id, joue_le, type, attaquant_login, defenseur_login, vainqueur_login,
                            attaquant_id, defenseur_id, egalite, tranche, power_attaquant, power_defenseur,
                            nb_rounds, replay)
  values (v_id, now(), case when v_classe then 'duel' else 'entrainement' end, a.twitch_login, d.twitch_login,
          v_vainqueur_login, a.id, d.id, v_egalite, v_tranche, round(v_pa::numeric, 1), round(v_pd::numeric, 1),
          v_rounds, '{"source":"site"}');
  insert into public.duel_replays (duel_id, donnees) values (v_id, v_replay);

  return jsonb_build_object(
    'duel_id', v_id, 'mode', p_mode,
    'resultat', jsonb_build_object(
      'vainqueur_login', v_vainqueur_login, 'egalite', v_egalite, 'tranche', v_tranche,
      'statut', v_statut_a,
      'categorie', lower(regexp_replace(cat_a, '([A-Z])', '_\1', 'g')),
      'categorie_defenseur', lower(regexp_replace(cat_d, '([A-Z])', '_\1', 'g')),
      'medailles_gagnees', med_a, 'medailles_perdues', 0, 'medailles_defenseur', med_d,
      'points_gagnes', pts_a, 'points_defenseur', pts_d,
      'protection_active', v_prot,
      'power_attaquant', round(v_pa::numeric, 1), 'power_defenseur', round(v_pd::numeric, 1),
      'nb_rounds', v_rounds),
    'replay', v_replay,
    'joueur', jsonb_build_object(
      'tickets', a.tickets, 'medailles', a.medailles, 'points', a.points,
      'victoires', a.victoires, 'defaites', a.defaites, 'egalites', a.egalites,
      'serie_actuelle', a.serie_actuelle, 'serie_record', a.serie_record));
end $$;

-- ---------- 4. Statut du joueur connecté (écran de duel) ----------
create or replace function public.mon_statut_duel()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_moi uuid := private.moi();
  j public.players;
  v_dernier timestamptz;
  v_entr int;
begin
  select * into j from public.players where id = v_moi;
  select max(joue_le) into v_dernier from public.duels where attaquant_id = v_moi;
  select count(*) into v_entr from public.duels
   where attaquant_id = v_moi and type = 'entrainement' and joue_le > now() - interval '24 hours';
  return jsonb_build_object(
    'tickets', j.tickets,
    'abonne', coalesce(j.abonne_jusqu_au > now(), false),
    'abonne_jusqu_au', j.abonne_jusqu_au, 'abonne_tier', j.abonne_tier,
    'prochain_duel_possible_a', greatest(now(), coalesce(v_dernier + interval '8 seconds', now())),
    'entrainements_restants', greatest(0, 50 - v_entr),
    'protections', coalesce((j.combat_details ->> 'protectionsActives')::int, 0));
end $$;

-- ---------- 5. Droits ----------
revoke all on function public.enregistrer_duel(uuid, uuid, text, text, jsonb, jsonb, bigint, boolean) from public, anon, authenticated;
grant execute on function public.enregistrer_duel(uuid, uuid, text, text, jsonb, jsonb, bigint, boolean) to service_role;
revoke all on function private.appliquer_bilan(uuid, text, text, integer, integer, integer, integer, integer, boolean, integer, integer, text) from public, anon, authenticated;
revoke all on function private.cd_plus(jsonb, text[], integer) from public, anon, authenticated;
revoke all on function public.mon_statut_duel() from public, anon;
grant execute on function public.mon_statut_duel() to authenticated;
