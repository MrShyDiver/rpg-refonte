-- =====================================================================
-- Stream RPG — pages connectées (29/09)
-- Lootbox légendaires, préférences, vitrine, succès, boutique réelle,
-- réinitialisation des stats, suppression de compte.
-- Toute la logique de jeu reste côté serveur (fonctions SECURITY DEFINER,
-- search_path vide) ; le navigateur ne fait que les appeler.
-- =====================================================================

-- ---------- 1. Lootbox légendaires et compteurs ----------
alter table public.players
  add column if not exists lootbox_legendaire integer not null default 0 check (lootbox_legendaire >= 0),
  add column if not exists lootbox_ouvertes integer not null default 0,
  add column if not exists lootbox_leg_ouvertes integer not null default 0,
  add column if not exists achats_boutique integer not null default 0;

alter table public.lootbox_raretes
  add column if not exists poids_legendaire numeric not null default 0 check (poids_legendaire >= 0);
-- Table de la lootbox légendaire (commande-lootbox-legendaire.cs) : jamais de Commun.
update public.lootbox_raretes set poids_legendaire = case rarete
  when 'normal' then 46 when 'rare' then 31 when 'epique' then 15 when 'legendaire' then 8 else 0 end;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.grants'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%type%lootbox%' loop
    execute format('alter table public.grants drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.grants add constraint grants_type_check
  check (type in ('lootbox', 'lootbox_legendaire', 'stat'));

create or replace function public.api_grant(
  p_cle_api text, p_twitch_user_id text, p_login text, p_type text, p_quantite integer default 1,
  p_stat text default null, p_source text default 'streamerbot', p_cle_unique text default null,
  p_display_name text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_player uuid;
  v_grant  bigint;
  v_joueur public.players;
begin
  perform private.verifier_cle(p_cle_api);

  if p_type is null or p_type not in ('lootbox', 'lootbox_legendaire', 'stat') then
    raise exception 'type inconnu : % (attendu : lootbox, lootbox_legendaire ou stat)', p_type;
  end if;
  if p_type = 'stat' and (p_stat is null or p_stat not in ('atk', 'def', 'pv', 'spd', 'luck')) then
    raise exception 'stat inconnue : % (attendu : atk, def, pv, spd, luck)', p_stat;
  end if;
  if p_quantite is null or p_quantite < 1
     or p_quantite > (case when p_type = 'stat' then 10 else 50 end) then
    raise exception 'quantite hors limites : %', p_quantite;
  end if;

  v_player := private.trouver_ou_creer_joueur(p_twitch_user_id, p_login, p_display_name);

  insert into public.grants (player_id, type, stat, quantite, source, cle_unique)
  values (v_player, p_type, case when p_type = 'stat' then p_stat end, p_quantite,
          coalesce(nullif(p_source, ''), 'streamerbot'), nullif(p_cle_unique, ''))
  on conflict (cle_unique) do nothing
  returning id into v_grant;

  if v_grant is null then
    select * into v_joueur from public.players where id = v_player;
    return jsonb_build_object('statut', 'deja_traite', 'login', v_joueur.twitch_login,
                              'lootbox', v_joueur.lootbox, 'lootbox_legendaire', v_joueur.lootbox_legendaire);
  end if;

  update public.players set
    lootbox            = lootbox            + case when p_type = 'lootbox' then p_quantite else 0 end,
    lootbox_legendaire = lootbox_legendaire + case when p_type = 'lootbox_legendaire' then p_quantite else 0 end,
    atk_stacks  = atk_stacks  + case when p_type = 'stat' and p_stat = 'atk'  then p_quantite else 0 end,
    def_stacks  = def_stacks  + case when p_type = 'stat' and p_stat = 'def'  then p_quantite else 0 end,
    pv_stacks   = pv_stacks   + case when p_type = 'stat' and p_stat = 'pv'   then p_quantite else 0 end,
    spd_stacks  = spd_stacks  + case when p_type = 'stat' and p_stat = 'spd'  then p_quantite else 0 end,
    luck_stacks = luck_stacks + case when p_type = 'stat' and p_stat = 'luck' then p_quantite else 0 end
  where id = v_player
  returning * into v_joueur;

  return jsonb_build_object(
    'statut', 'ok', 'login', v_joueur.twitch_login, 'compte_site', v_joueur.auth_user_id is not null,
    'lootbox', v_joueur.lootbox, 'lootbox_legendaire', v_joueur.lootbox_legendaire,
    'stacks', jsonb_build_object('atk', v_joueur.atk_stacks, 'def', v_joueur.def_stacks,
                                 'pv', v_joueur.pv_stacks, 'spd', v_joueur.spd_stacks,
                                 'luck', v_joueur.luck_stacks));
end $$;

-- Ouverture : lootbox standard ou légendaire (même tirage pondéré, table de poids différente).
drop function if exists public.ouvrir_lootbox(integer);
create or replace function public.ouvrir_lootbox(p_nombre integer default 1, p_legendaire boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_joueur  public.players;
  v_stock   int;
  v_rarete  text;
  v_item    public.items;
  v_niveau  int;
  v_nouveau boolean;
  v_annonce boolean;
  v_res     jsonb := '[]';
  r_rarete  float8;
  r_objet   float8;
begin
  if p_nombre is null or p_nombre < 1 or p_nombre > 10 then
    raise exception 'On ouvre entre 1 et 10 lootbox à la fois';
  end if;

  select * into v_joueur from public.players where id = private.moi() for update;
  v_stock := case when p_legendaire then v_joueur.lootbox_legendaire else v_joueur.lootbox end;
  if v_stock < p_nombre then
    raise exception 'Pas assez de lootbox% (il t''en reste %)',
      case when p_legendaire then ' légendaires' else '' end, v_stock;
  end if;

  for i in 1 .. p_nombre loop
    r_rarete := random();
    r_objet  := random();
    v_rarete := null;

    select r.rarete, r.annoncer into v_rarete, v_annonce from (
      select lr.rarete, lr.annoncer,
             sum(case when p_legendaire then lr.poids_legendaire else lr.poids end) over (order by lr.rarete) as cumul,
             sum(case when p_legendaire then lr.poids_legendaire else lr.poids end) over () as total
        from public.lootbox_raretes lr
       where (case when p_legendaire then lr.poids_legendaire else lr.poids end) > 0
         and exists (select 1 from public.items it where it.rarete = lr.rarete and it.actif)
    ) r
    where r.cumul > r_rarete * r.total
    order by r.cumul limit 1;

    if v_rarete is null then
      raise exception 'Aucun objet disponible au tirage';
    end if;

    select it.* into v_item from (
      select it.numero, sum(coalesce(s.multiplicateur, 1)) over (order by it.numero) as cumul,
             sum(coalesce(s.multiplicateur, 1)) over () as total
        from public.items it
        left join public.lootbox_sets s on s.set_nom = it.set_nom
       where it.rarete = v_rarete and it.actif
    ) c
    join public.items it on it.numero = c.numero
    where c.cumul > r_objet * c.total
    order by c.cumul limit 1;

    insert into public.inventory as inv (player_id, item_numero, niveau)
    values (v_joueur.id, v_item.numero, 0)
    on conflict (player_id, item_numero) do update set niveau = inv.niveau + 1
    returning niveau, (xmax = 0) into v_niveau, v_nouveau;

    if v_annonce then
      insert into public.game_events (type, player_id, payload)
      values ('gros_pull', v_joueur.id, jsonb_build_object(
        'pseudo', v_joueur.display_name, 'objet', v_item.nom, 'rarete', v_item.rarete,
        'niveau', v_niveau, 'nouveau', v_nouveau,
        'image', v_item.data ->> 'image', 'icone', v_item.data ->> 'icone'));
    end if;

    v_res := v_res || jsonb_build_object(
      'numero', v_item.numero, 'nom', v_item.nom, 'rarete', v_item.rarete,
      'image', v_item.data ->> 'image', 'icone', v_item.data ->> 'icone',
      'nouveau', v_nouveau, 'niveau', v_niveau,
      'niveau_max', public.niveau_max(v_item.rarete));
  end loop;

  if p_legendaire then
    update public.players set lootbox_legendaire = lootbox_legendaire - p_nombre,
                              lootbox_leg_ouvertes = lootbox_leg_ouvertes + p_nombre
     where id = v_joueur.id;
  else
    update public.players set lootbox = lootbox - p_nombre,
                              lootbox_ouvertes = lootbox_ouvertes + p_nombre
     where id = v_joueur.id;
  end if;

  return jsonb_build_object('tirages', v_res, 'lootbox_restantes', v_stock - p_nombre,
                            'legendaire', p_legendaire);
end $$;

-- ---------- 2. Préférences ----------
create table if not exists public.preferences (
  player_id uuid primary key references public.players(id) on delete cascade,
  sons boolean not null default true,
  notif_lootbox boolean not null default true,
  notif_succes boolean not null default true,
  notif_duels boolean not null default true,
  notif_annonces boolean not null default true,
  notifications_lues_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
alter table public.preferences enable row level security;
create policy "mes préférences" on public.preferences for select to authenticated
  using (player_id in (select id from public.players where auth_user_id = (select auth.uid())));

create or replace function public.enregistrer_preferences(p jsonb)
returns public.preferences language plpgsql security definer set search_path to '' as $$
declare v_moi uuid := private.moi(); v_res public.preferences;
begin
  insert into public.preferences (player_id) values (v_moi) on conflict do nothing;
  update public.preferences set
    sons           = coalesce((p ->> 'sons')::boolean, sons),
    notif_lootbox  = coalesce((p ->> 'notif_lootbox')::boolean, notif_lootbox),
    notif_succes   = coalesce((p ->> 'notif_succes')::boolean, notif_succes),
    notif_duels    = coalesce((p ->> 'notif_duels')::boolean, notif_duels),
    notif_annonces = coalesce((p ->> 'notif_annonces')::boolean, notif_annonces),
    maj_le = now()
  where player_id = v_moi
  returning * into v_res;
  return v_res;
end $$;

create or replace function public.marquer_notifications_lues()
returns timestamptz language plpgsql security definer set search_path to '' as $$
declare v_moi uuid := private.moi();
begin
  insert into public.preferences (player_id) values (v_moi) on conflict do nothing;
  update public.preferences set notifications_lues_le = now() where player_id = v_moi;
  return now();
end $$;

-- ---------- 3. Vitrine (jusqu'à 8 cartes, objets possédés uniquement) ----------
create table if not exists public.vitrines (
  player_id uuid not null references public.players(id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  item_numero integer not null,
  primary key (player_id, position),
  unique (player_id, item_numero),
  foreign key (player_id, item_numero) references public.inventory(player_id, item_numero) on delete cascade
);
alter table public.vitrines enable row level security;
create policy "lecture publique" on public.vitrines for select using (true);

create or replace function public.definir_vitrine(p_numeros integer[])
returns void language plpgsql security definer set search_path to '' as $$
declare v_moi uuid := private.moi(); v_n int := coalesce(array_length(p_numeros, 1), 0);
begin
  if v_n > 8 then raise exception 'La vitrine contient 8 cartes au maximum'; end if;
  if v_n <> (select count(distinct x) from unnest(p_numeros) x) then
    raise exception 'Une même carte ne peut apparaître qu''une fois dans la vitrine';
  end if;
  if exists (select 1 from unnest(p_numeros) x
              where not exists (select 1 from public.inventory
                                 where player_id = v_moi and item_numero = x)) then
    raise exception 'Tu ne peux exposer que des objets que tu possèdes';
  end if;
  delete from public.vitrines where player_id = v_moi;
  insert into public.vitrines (player_id, position, item_numero)
  select v_moi, o, x from unnest(p_numeros) with ordinality as t(x, o);
end $$;

-- ---------- 4. Succès ----------
create table if not exists public.succes (
  code text primary key,
  titre text not null,
  description text not null,
  categorie text not null check (categorie in ('collection', 'lootbox', 'duels', 'profil')),
  palier text not null check (palier in ('bronze', 'argent', 'or', 'legendaire')),
  ordre integer not null default 0,
  cache boolean not null default false
);
alter table public.succes enable row level security;
create policy "lecture publique" on public.succes for select using (true);

create table if not exists public.succes_joueurs (
  player_id uuid not null references public.players(id) on delete cascade,
  code text not null references public.succes(code) on delete cascade,
  debloque_le timestamptz not null default now(),
  primary key (player_id, code)
);
alter table public.succes_joueurs enable row level security;
create policy "lecture publique" on public.succes_joueurs for select using (true);

insert into public.succes (code, titre, description, categorie, palier, ordre) values
  ('premier_butin',       'Premier butin',          'Posséder ton premier objet.',                               'collection', 'bronze',     10),
  ('collection_10',       'Collectionneur',         'Posséder 10 objets différents.',                            'collection', 'bronze',     20),
  ('collection_25',       'Grand collectionneur',   'Posséder 25 objets différents.',                            'collection', 'argent',     30),
  ('premiere_epique',     'Aura violette',          'Posséder un objet épique.',                                 'collection', 'argent',     40),
  ('premier_legendaire',  'Lumière dorée',          'Posséder un objet légendaire.',                             'collection', 'or',         50),
  ('niveau_max',          'Poussé au maximum',      'Amener un objet à son niveau maximum.',                     'collection', 'or',         60),
  ('panoplie_sekiro',     'Shinobi accompli',       'Posséder tous les objets du set Sekiro.',                   'collection', 'legendaire', 70),
  ('arsenal_complet',     'Arsenal complet',        'Posséder tous les objets du catalogue.',                    'collection', 'legendaire', 80),
  ('lootbox_1',           'Premier coffre',         'Ouvrir ta première lootbox sur le site.',                   'lootbox',    'bronze',     10),
  ('lootbox_50',          'Chasseur de coffres',    'Ouvrir 50 lootbox sur le site.',                            'lootbox',    'argent',     20),
  ('lootbox_200',         'Pilleur de l''arsenal',  'Ouvrir 200 lootbox sur le site.',                           'lootbox',    'or',         30),
  ('lootbox_leg_1',       'Coffre doré',            'Ouvrir une lootbox légendaire sur le site.',                'lootbox',    'argent',     40),
  ('victoire_1',          'Premier sang',           'Remporter ton premier duel.',                               'duels',      'bronze',     10),
  ('victoire_25',         'Vétéran',                'Remporter 25 duels.',                                       'duels',      'argent',     20),
  ('victoire_100',        'Légende de l''arène',    'Remporter 100 duels.',                                      'duels',      'or',         30),
  ('serie_5',             'Inarrêtable',            'Enchaîner 5 victoires d''affilée.',                         'duels',      'argent',     40),
  ('serie_10',            'Invaincu',               'Enchaîner 10 victoires d''affilée.',                        'duels',      'or',         50),
  ('victoire_valeureuse', 'Valeureux',              'Battre un adversaire nettement plus fort que toi.',         'duels',      'argent',     60),
  ('gros_coup_150',       'Coup de massue',         'Infliger 150 dégâts en un seul coup.',                      'duels',      'argent',     70),
  ('degats_10000',        'Machine de guerre',      'Infliger 10 000 dégâts au total.',                          'duels',      'or',         80),
  ('loadout_complet',     'Paré au combat',         'Équiper une arme, une main gauche, une armure et un stratagème.', 'profil', 'bronze', 10),
  ('vitrine_pleine',      'Galerie privée',         'Exposer 8 cartes dans ta vitrine.',                         'profil',     'bronze',     20),
  ('premier_achat',       'Bon client',             'Faire ton premier achat à la boutique.',                    'profil',     'bronze',     30),
  ('stats_50',            'Entraînement intensif',  'Investir 50 points de stats.',                              'profil',     'argent',     40),
  ('medailles_1000',      'Trésor de guerre',       'Avoir 1 000 médailles en poche.',                           'profil',     'argent',     50)
on conflict (code) do update set titre = excluded.titre, description = excluded.description,
  categorie = excluded.categorie, palier = excluded.palier, ordre = excluded.ordre;

-- Calcule l'état du joueur connecté, débloque ce qui est atteint, renvoie les nouveautés.
create or replace function public.verifier_succes()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_moi uuid := private.moi();
  j public.players;
  v_distincts int; v_epiques int; v_legendaires int; v_max int;
  v_sekiro int; v_sekiro_total int; v_total int; v_loadout int; v_vitrine int;
  v_valeureuses int;
  v_atteints text[] := '{}';
  v_nouveaux jsonb;
begin
  select * into j from public.players where id = v_moi;
  select count(*), count(*) filter (where it.rarete = 'epique'), count(*) filter (where it.rarete = 'legendaire'),
         count(*) filter (where inv.niveau >= public.niveau_max(it.rarete)),
         count(*) filter (where it.set_nom = 'Sekiro' and it.actif)
    into v_distincts, v_epiques, v_legendaires, v_max, v_sekiro
    from public.inventory inv join public.items it on it.numero = inv.item_numero
   where inv.player_id = v_moi;
  select count(*) filter (where set_nom = 'Sekiro'), count(*) into v_sekiro_total, v_total
    from public.items where actif;
  select (arme is not null)::int + (offhand is not null)::int + (armure is not null)::int + (strategeme is not null)::int
    into v_loadout from public.loadouts where player_id = v_moi;
  select count(*) into v_vitrine from public.vitrines where player_id = v_moi;
  v_valeureuses := coalesce((j.combat_details #>> '{categories,victoireValeureuse}')::int, 0);

  if v_distincts >= 1 then v_atteints := array_append(v_atteints, 'premier_butin'); end if;
  if v_distincts >= 10 then v_atteints := array_append(v_atteints, 'collection_10'); end if;
  if v_distincts >= 25 then v_atteints := array_append(v_atteints, 'collection_25'); end if;
  if v_epiques >= 1 then v_atteints := array_append(v_atteints, 'premiere_epique'); end if;
  if v_legendaires >= 1 then v_atteints := array_append(v_atteints, 'premier_legendaire'); end if;
  if v_max >= 1 then v_atteints := array_append(v_atteints, 'niveau_max'); end if;
  if v_sekiro_total > 0 and v_sekiro >= v_sekiro_total then v_atteints := array_append(v_atteints, 'panoplie_sekiro'); end if;
  if v_total > 0 and v_distincts >= v_total then v_atteints := array_append(v_atteints, 'arsenal_complet'); end if;
  if j.lootbox_ouvertes + j.lootbox_leg_ouvertes >= 1 then v_atteints := array_append(v_atteints, 'lootbox_1'); end if;
  if j.lootbox_ouvertes + j.lootbox_leg_ouvertes >= 50 then v_atteints := array_append(v_atteints, 'lootbox_50'); end if;
  if j.lootbox_ouvertes + j.lootbox_leg_ouvertes >= 200 then v_atteints := array_append(v_atteints, 'lootbox_200'); end if;
  if j.lootbox_leg_ouvertes >= 1 then v_atteints := array_append(v_atteints, 'lootbox_leg_1'); end if;
  if j.victoires >= 1 then v_atteints := array_append(v_atteints, 'victoire_1'); end if;
  if j.victoires >= 25 then v_atteints := array_append(v_atteints, 'victoire_25'); end if;
  if j.victoires >= 100 then v_atteints := array_append(v_atteints, 'victoire_100'); end if;
  if j.serie_record >= 5 then v_atteints := array_append(v_atteints, 'serie_5'); end if;
  if j.serie_record >= 10 then v_atteints := array_append(v_atteints, 'serie_10'); end if;
  if v_valeureuses >= 1 then v_atteints := array_append(v_atteints, 'victoire_valeureuse'); end if;
  if j.plus_gros_coup >= 150 then v_atteints := array_append(v_atteints, 'gros_coup_150'); end if;
  if j.degats_infliges >= 10000 then v_atteints := array_append(v_atteints, 'degats_10000'); end if;
  if coalesce(v_loadout, 0) = 4 then v_atteints := array_append(v_atteints, 'loadout_complet'); end if;
  if v_vitrine >= 8 then v_atteints := array_append(v_atteints, 'vitrine_pleine'); end if;
  if j.achats_boutique >= 1 then v_atteints := array_append(v_atteints, 'premier_achat'); end if;
  if j.atk_stacks + j.def_stacks + j.pv_stacks + j.spd_stacks + j.luck_stacks + j.credits_reset >= 50 then
    v_atteints := array_append(v_atteints, 'stats_50'); end if;
  if j.medailles >= 1000 then v_atteints := array_append(v_atteints, 'medailles_1000'); end if;

  with ins as (
    insert into public.succes_joueurs (player_id, code)
    select v_moi, c from unnest(v_atteints) c
     where exists (select 1 from public.succes s where s.code = c)
    on conflict do nothing
    returning code
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'titre', s.titre, 'palier', s.palier)), '[]')
    into v_nouveaux
    from ins join public.succes s on s.code = ins.code;
  return v_nouveaux;
end $$;

-- ---------- 5. Boutique ----------
create table if not exists public.boutique_prix (
  rarete text primary key check (rarete in ('commun', 'normal', 'rare', 'epique', 'legendaire')),
  achat integer not null check (achat > 0),
  vente integer not null check (vente >= 0),
  en_etal integer not null default 0 check (en_etal >= 0)
);
insert into public.boutique_prix (rarete, achat, vente, en_etal) values
  ('commun', 25, 1, 4), ('normal', 120, 6, 3), ('rare', 450, 30, 2), ('epique', 650, 50, 0), ('legendaire', 900, 90, 0)
on conflict (rarete) do nothing;

create table if not exists public.boutique_reglages (
  cle text primary key,
  valeur integer not null check (valeur >= 0),
  description text
);
insert into public.boutique_reglages (cle, valeur, description) values
  ('prix_lootbox', 12, 'Prix d''une lootbox en médailles'),
  ('prix_ticket_reset', 60, 'Prix d''un ticket de reset de stats'),
  ('troc_cout', 10, 'Nombre de doublons échangés contre 1 objet de la rareté au-dessus')
on conflict (cle) do nothing;

alter table public.boutique_prix enable row level security;
alter table public.boutique_reglages enable row level security;
create policy "lecture publique" on public.boutique_prix for select using (true);
create policy "lecture publique" on public.boutique_reglages for select using (true);

create table if not exists public.journal_boutique (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  operation text not null check (operation in ('achat', 'vente', 'troc', 'reset')),
  detail jsonb not null default '{}',
  medailles integer not null default 0,
  cree_le timestamptz not null default now()
);
create index if not exists journal_boutique_joueur on public.journal_boutique (player_id, cree_le desc);
alter table public.journal_boutique enable row level security;
create policy "mon journal" on public.journal_boutique for select to authenticated
  using (player_id in (select id from public.players where auth_user_id = (select auth.uid())));

-- Étal de l'heure : identique pour tout le monde, change à chaque heure pleine (UTC).
create or replace function public.etal_boutique(p_moment timestamptz default now())
returns table (numero integer, rarete text, prix integer, rang integer)
language sql stable set search_path to '' as $$
  select t.numero, t.rarete, t.prix, t.rang::int from (
    select it.numero, it.rarete, bp.achat as prix, bp.en_etal,
           row_number() over (partition by it.rarete
                              order by md5(date_trunc('hour', p_moment at time zone 'utc')::text || '-' || it.numero)) as rang
      from public.items it join public.boutique_prix bp on bp.rarete = it.rarete
     where it.actif
  ) t
  where t.rang <= t.en_etal
  order by array_position(array['commun','normal','rare','epique','legendaire'], t.rarete), t.rang
$$;

create or replace function public.acheter(p_article text, p_numero integer default null, p_quantite integer default 1)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_moi uuid := private.moi();
  j public.players;
  v_item public.items;
  v_prix int;
  v_niveau int;
  v_nouveau boolean;
begin
  select * into j from public.players where id = v_moi for update;
  if p_quantite is null or p_quantite < 1 or p_quantite > 10 then
    raise exception 'Quantité invalide';
  end if;

  if p_article = 'objet' then
    if p_quantite <> 1 then raise exception 'Un objet s''achète à l''unité'; end if;
    select e.prix into v_prix from public.etal_boutique(now()) e where e.numero = p_numero;
    if v_prix is null then raise exception 'Cet objet n''est plus à l''étal : le stock vient peut-être de tourner'; end if;
    select * into v_item from public.items where numero = p_numero;
    if exists (select 1 from public.inventory where player_id = v_moi and item_numero = p_numero
                and niveau >= public.niveau_max(v_item.rarete)) then
      raise exception 'Tu as déjà cet objet au niveau maximum';
    end if;
  elsif p_article = 'lootbox' then
    select valeur * p_quantite into v_prix from public.boutique_reglages where cle = 'prix_lootbox';
  elsif p_article = 'ticket_reset' then
    select valeur * p_quantite into v_prix from public.boutique_reglages where cle = 'prix_ticket_reset';
  else
    raise exception 'Article inconnu : %', p_article;
  end if;

  if j.medailles < v_prix then
    raise exception 'Il te manque % médailles', v_prix - j.medailles;
  end if;

  update public.players set medailles = medailles - v_prix, achats_boutique = achats_boutique + 1,
    lootbox = lootbox + case when p_article = 'lootbox' then p_quantite else 0 end,
    tickets_reset = tickets_reset + case when p_article = 'ticket_reset' then p_quantite else 0 end
  where id = v_moi;

  if p_article = 'objet' then
    insert into public.inventory as inv (player_id, item_numero, niveau) values (v_moi, p_numero, 0)
    on conflict (player_id, item_numero) do update set niveau = inv.niveau + 1
    returning niveau, (xmax = 0) into v_niveau, v_nouveau;
  end if;

  insert into public.journal_boutique (player_id, operation, detail, medailles)
  values (v_moi, 'achat', jsonb_build_object('article', p_article, 'numero', p_numero, 'quantite', p_quantite,
                                             'nom', v_item.nom, 'rarete', v_item.rarete), -v_prix);

  return jsonb_build_object('article', p_article, 'prix', v_prix, 'medailles', j.medailles - v_prix,
    'objet', case when p_article = 'objet' then jsonb_build_object('numero', v_item.numero, 'nom', v_item.nom,
      'rarete', v_item.rarete, 'image', v_item.data ->> 'image', 'niveau', v_niveau, 'nouveau', v_nouveau) end);
end $$;

-- Vend des exemplaires. Vendre le dernier retire l'objet (et le déséquipe / le retire de la vitrine).
create or replace function public.vendre(p_numero integer, p_quantite integer default 1)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_moi uuid := private.moi();
  v_inv public.inventory;
  v_item public.items;
  v_gain int;
begin
  if p_quantite is null or p_quantite < 1 then raise exception 'Quantité invalide'; end if;
  select * into v_inv from public.inventory where player_id = v_moi and item_numero = p_numero for update;
  if v_inv.player_id is null then raise exception 'Tu ne possèdes pas cet objet'; end if;
  if p_quantite > v_inv.niveau + 1 then
    raise exception 'Tu n''en as que % exemplaire(s)', v_inv.niveau + 1;
  end if;
  select * into v_item from public.items where numero = p_numero;
  select vente * p_quantite into v_gain from public.boutique_prix where rarete = v_item.rarete;

  if p_quantite = v_inv.niveau + 1 then
    update public.loadouts set
      arme = nullif(arme, p_numero), offhand = nullif(offhand, p_numero),
      armure = nullif(armure, p_numero), strategeme = nullif(strategeme, p_numero)
    where player_id = v_moi;
    delete from public.inventory where player_id = v_moi and item_numero = p_numero;
  else
    update public.inventory set niveau = niveau - p_quantite where player_id = v_moi and item_numero = p_numero;
  end if;

  update public.players set medailles = medailles + v_gain, medailles_revente = medailles_revente + v_gain
   where id = v_moi;
  insert into public.journal_boutique (player_id, operation, detail, medailles)
  values (v_moi, 'vente', jsonb_build_object('numero', p_numero, 'nom', v_item.nom, 'rarete', v_item.rarete,
                                             'quantite', p_quantite), v_gain);
  return jsonb_build_object('gain', v_gain, 'restant', v_inv.niveau + 1 - p_quantite,
                            'medailles', (select medailles from public.players where id = v_moi));
end $$;

-- Troc : N doublons (jamais l'exemplaire de base) d'une rareté contre 1 objet au hasard de la rareté au-dessus.
create or replace function public.troquer(p_numeros integer[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_moi uuid := private.moi();
  v_cout int;
  v_rarete text;
  v_nb_raretes int;
  v_cible text;
  v_item public.items;
  v_niveau int;
  v_nouveau boolean;
  c record;
begin
  select valeur into v_cout from public.boutique_reglages where cle = 'troc_cout';
  if coalesce(array_length(p_numeros, 1), 0) <> v_cout then
    raise exception 'Le troc demande exactement % doublons', v_cout;
  end if;
  select min(it.rarete), count(distinct it.rarete) into v_rarete, v_nb_raretes
    from unnest(p_numeros) x join public.items it on it.numero = x;
  if v_nb_raretes <> 1 then raise exception 'Tous les doublons doivent être de la même rareté'; end if;
  v_cible := case v_rarete when 'commun' then 'normal' when 'normal' then 'rare' end;
  if v_cible is null then raise exception 'Le troc accepte seulement des doublons communs ou normaux'; end if;

  for c in select x as numero, count(*)::int as n from unnest(p_numeros) x group by x loop
    update public.inventory set niveau = niveau - c.n
     where player_id = v_moi and item_numero = c.numero and niveau >= c.n;
    if not found then
      raise exception 'Pas assez de doublons pour l''objet n°% (l''exemplaire de base est toujours conservé)', c.numero;
    end if;
  end loop;

  select * into v_item from public.items where rarete = v_cible and actif order by random() limit 1;
  insert into public.inventory as inv (player_id, item_numero, niveau) values (v_moi, v_item.numero, 0)
  on conflict (player_id, item_numero) do update set niveau = inv.niveau + 1
  returning niveau, (xmax = 0) into v_niveau, v_nouveau;

  insert into public.journal_boutique (player_id, operation, detail, medailles)
  values (v_moi, 'troc', jsonb_build_object('donnes', to_jsonb(p_numeros), 'recu', v_item.numero,
                                            'nom', v_item.nom, 'rarete', v_item.rarete), 0);
  return jsonb_build_object('numero', v_item.numero, 'nom', v_item.nom, 'rarete', v_item.rarete,
    'image', v_item.data ->> 'image', 'niveau', v_niveau, 'nouveau', v_nouveau);
end $$;

-- ---------- 6. Stats : ticket de reset et placement des points ----------
create or replace function public.utiliser_ticket_reset()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_moi uuid := private.moi(); j public.players; v_points int;
begin
  select * into j from public.players where id = v_moi for update;
  if j.tickets_reset < 1 then raise exception 'Tu n''as pas de ticket de reset'; end if;
  v_points := j.atk_stacks + j.def_stacks + j.pv_stacks + j.spd_stacks + j.luck_stacks;
  update public.players set tickets_reset = tickets_reset - 1, credits_reset = credits_reset + v_points,
    atk_stacks = 0, def_stacks = 0, pv_stacks = 0, spd_stacks = 0, luck_stacks = 0
  where id = v_moi;
  insert into public.journal_boutique (player_id, operation, detail) values (v_moi, 'reset', jsonb_build_object('points', v_points));
  return jsonb_build_object('points_a_placer', j.credits_reset + v_points);
end $$;

create or replace function public.placer_points(p_stat text, p_quantite integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_moi uuid := private.moi(); j public.players;
begin
  if p_stat is null or p_stat not in ('atk', 'def', 'pv', 'spd', 'luck') then raise exception 'Stat inconnue : %', p_stat; end if;
  select * into j from public.players where id = v_moi for update;
  if p_quantite is null or p_quantite < 1 or p_quantite > j.credits_reset then
    raise exception 'Tu as % point(s) à placer', j.credits_reset;
  end if;
  update public.players set credits_reset = credits_reset - p_quantite,
    atk_stacks = atk_stacks + case when p_stat = 'atk' then p_quantite else 0 end,
    def_stacks = def_stacks + case when p_stat = 'def' then p_quantite else 0 end,
    pv_stacks = pv_stacks + case when p_stat = 'pv' then p_quantite else 0 end,
    spd_stacks = spd_stacks + case when p_stat = 'spd' then p_quantite else 0 end,
    luck_stacks = luck_stacks + case when p_stat = 'luck' then p_quantite else 0 end
  where id = v_moi returning * into j;
  return jsonb_build_object('credits_reset', j.credits_reset, 'atk', j.atk_stacks, 'def', j.def_stacks,
                            'pv', j.pv_stacks, 'spd', j.spd_stacks, 'luck', j.luck_stacks);
end $$;

-- ---------- 7. Suppression de compte ----------
-- Irréversible : efface le joueur, sa progression et son compte de connexion.
-- Les duels passés restent (pseudos), sans lien vers le compte supprimé.
create or replace function public.supprimer_mon_compte(p_confirmation text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_moi uuid := private.moi(); v_login text; v_auth uuid := auth.uid();
begin
  select twitch_login into v_login from public.players where id = v_moi;
  if lower(trim(coalesce(p_confirmation, ''))) <> v_login then
    raise exception 'Tape ton pseudo Twitch exactement pour confirmer';
  end if;
  update public.duels set attaquant_id = null where attaquant_id = v_moi;
  update public.duels set defenseur_id = null where defenseur_id = v_moi;
  delete from public.vitrines where player_id = v_moi;
  delete from public.loadouts where player_id = v_moi;
  delete from public.inventory where player_id = v_moi;
  delete from public.grants where player_id = v_moi;
  delete from public.game_events where player_id = v_moi;
  delete from public.players where id = v_moi;   -- préférences, succès, journal : en cascade
  delete from auth.users where id = v_auth;
  return true;
end $$;

-- ---------- 8. Droits : seules les personnes connectées appellent les actions ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.ouvrir_lootbox(integer, boolean)', 'public.enregistrer_preferences(jsonb)',
    'public.marquer_notifications_lues()', 'public.definir_vitrine(integer[])', 'public.verifier_succes()',
    'public.acheter(text, integer, integer)', 'public.vendre(integer, integer)', 'public.troquer(integer[])',
    'public.utiliser_ticket_reset()', 'public.placer_points(text, integer)', 'public.supprimer_mon_compte(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.api_grant(text, text, text, text, integer, text, text, text, text) from public;
grant execute on function public.api_grant(text, text, text, text, integer, text, text, text, text) to anon;
grant execute on function public.etal_boutique(timestamptz) to anon, authenticated;
