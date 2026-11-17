-- Bir kaynağın haftalık çalışma saatlerini tek işlemde değiştirir (yarım kayıt kalmaz).
create or replace function public.set_working_hours(p_resource uuid, p_hours jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_bid uuid; h jsonb;
begin
  select business_id into v_bid from resources where id = p_resource;
  if v_bid is null or not public.is_owner(v_bid) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_hours) <> 'array' then raise exception 'HOURS_REQUIRED'; end if;
  delete from working_hours where resource_id = p_resource;
  for h in select * from jsonb_array_elements(p_hours) loop
    insert into working_hours (business_id, resource_id, weekday, start_time, end_time)
    values (v_bid, p_resource, (h->>'weekday')::smallint, (h->>'start')::time, (h->>'end')::time);
  end loop;
  -- Aynı gün içinde üst üste binen aralık olmasın
  if exists (
    select 1 from working_hours a join working_hours b
      on a.resource_id = b.resource_id and a.weekday = b.weekday and a.id < b.id
     and a.start_time < b.end_time and b.start_time < a.end_time
    where a.resource_id = p_resource
  ) then raise exception 'HOURS_OVERLAP'; end if;
end $$;
revoke execute on function public.set_working_hours(uuid, jsonb) from public, anon;
grant execute on function public.set_working_hours(uuid, jsonb) to authenticated;
