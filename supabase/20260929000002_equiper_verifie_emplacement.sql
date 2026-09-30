-- equiper : refuse un objet dans le mauvais emplacement (weapon→arme, torso→armure).
CREATE OR REPLACE FUNCTION public.equiper(p_emplacement text, p_numero integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_moi uuid := private.moi();
  v_slot text;
  v_attendu text := replace(replace(p_emplacement, 'arme', 'weapon'), 'armure', 'torso');
begin
  if v_moi is null then raise exception 'Connecte-toi d''abord'; end if;
  if p_emplacement not in ('arme', 'offhand', 'armure', 'strategeme') then
    raise exception 'Emplacement inconnu : %', p_emplacement;
  end if;
  if p_numero is not null then
    if not exists (select 1 from public.inventory where player_id = v_moi and item_numero = p_numero) then
      raise exception 'Tu ne possèdes pas cet objet';
    end if;
    select i.slot into v_slot from public.items i where i.numero = p_numero;
    if v_slot is distinct from v_attendu then
      raise exception 'Cet objet ne va pas dans cet emplacement';
    end if;
  end if;
  insert into public.loadouts (player_id) values (v_moi) on conflict do nothing;
  update public.loadouts set
    arme       = case when p_emplacement = 'arme'       then p_numero else arme end,
    offhand    = case when p_emplacement = 'offhand'    then p_numero else offhand end,
    armure     = case when p_emplacement = 'armure'     then p_numero else armure end,
    strategeme = case when p_emplacement = 'strategeme' then p_numero else strategeme end
  where player_id = v_moi;
end
$function$;
