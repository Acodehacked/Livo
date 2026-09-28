-- Phases 3–12: editor document saves, room lifecycle, audience participation and analytics.

-- Slides: speaker notes, and an order constraint that tolerates reordering inside one transaction.
alter table public.slides add column if not exists notes text not null default '';
alter table public.slides drop constraint if exists slides_presentation_id_order_index_key;
alter table public.slides add constraint slides_presentation_order_key unique (presentation_id, order_index) deferrable initially deferred;

-- Rooms: expiry and per-room settings.
alter table public.rooms add column if not exists expires_at timestamptz not null default now() + interval '24 hours';
alter table public.rooms add column if not exists settings jsonb not null default '{}'::jsonb;
create index if not exists rooms_presentation_idx on public.rooms (presentation_id, created_at desc);

-- Responses: store correctness at write time so analytics doesn't need to re-score.
alter table public.responses add column if not exists correct boolean;
create index if not exists responses_room_idx on public.responses (room_id, interaction_id);
create index if not exists participants_room_idx on public.participants (room_id);

-- Audience rows are written by the server with the service role; creators can read their own rooms' data.
alter table public.participants enable row level security;
alter table public.responses enable row level security;
drop policy if exists "Owners read participants" on public.participants;
create policy "Owners read participants" on public.participants for select using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid()));
drop policy if exists "Owners read responses" on public.responses;
create policy "Owners read responses" on public.responses for select using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid()));

-- Saves a whole presentation document atomically. Runs as the caller, so RLS still applies.
-- p_slides: [{ id, title, notes, type, background, elements: [{ id, type, x, y, width, height, rotation, z_index, properties, interaction: { type, title, config, required } | null }] }]
create or replace function public.save_presentation(p_presentation_id uuid, p_title text, p_slides jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_slide jsonb;
  v_index integer := 0;
  v_slide_ids uuid[] := '{}';
  v_element_ids uuid[] := '{}';
  v_interaction_ids uuid[] := '{}';
begin
  if not exists (select 1 from presentations where id = p_presentation_id and owner_id = auth.uid()) then
    raise exception 'presentation not found' using errcode = 'P0002';
  end if;

  update presentations set title = coalesce(nullif(trim(p_title), ''), title), updated_at = now() where id = p_presentation_id;

  for v_slide in select value from jsonb_array_elements(p_slides) loop
    insert into slides (id, presentation_id, order_index, title, type, background, notes, updated_at)
    values ((v_slide->>'id')::uuid, p_presentation_id, v_index, coalesce(v_slide->>'title', ''), coalesce(v_slide->>'type', 'normal')::slide_type, coalesce(v_slide->'background', '{}'::jsonb), coalesce(v_slide->>'notes', ''), now())
    on conflict (id) do update set order_index = excluded.order_index, title = excluded.title, type = excluded.type, background = excluded.background, notes = excluded.notes, updated_at = now()
    where slides.presentation_id = p_presentation_id;

    insert into slide_elements (id, slide_id, type, x, y, width, height, rotation, z_index, properties, updated_at)
    select (e->>'id')::uuid, (v_slide->>'id')::uuid, e->>'type', (e->>'x')::numeric, (e->>'y')::numeric, greatest((e->>'width')::numeric, 1), greatest((e->>'height')::numeric, 1), coalesce((e->>'rotation')::numeric, 0), coalesce((e->>'z_index')::integer, 0), coalesce(e->'properties', '{}'::jsonb), now()
    from jsonb_array_elements(coalesce(v_slide->'elements', '[]'::jsonb)) e
    on conflict (id) do update set slide_id = excluded.slide_id, type = excluded.type, x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height, rotation = excluded.rotation, z_index = excluded.z_index, properties = excluded.properties, updated_at = now();

    -- Interaction rows share the element's id so responses stay attached across edits.
    insert into interactions (id, slide_id, type, title, config, required, updated_at)
    select (e->>'id')::uuid, (v_slide->>'id')::uuid, e->'interaction'->>'type', coalesce(e->'interaction'->>'title', ''), coalesce(e->'interaction'->'config', '{}'::jsonb), coalesce((e->'interaction'->>'required')::boolean, false), now()
    from jsonb_array_elements(coalesce(v_slide->'elements', '[]'::jsonb)) e
    where jsonb_typeof(e->'interaction') = 'object'
    on conflict (id) do update set slide_id = excluded.slide_id, type = excluded.type, title = excluded.title, config = excluded.config, required = excluded.required, updated_at = now();

    v_slide_ids := v_slide_ids || (v_slide->>'id')::uuid;
    v_element_ids := v_element_ids || coalesce((select array_agg((e->>'id')::uuid) from jsonb_array_elements(coalesce(v_slide->'elements', '[]'::jsonb)) e), '{}');
    v_interaction_ids := v_interaction_ids || coalesce((select array_agg((e->>'id')::uuid) from jsonb_array_elements(coalesce(v_slide->'elements', '[]'::jsonb)) e where jsonb_typeof(e->'interaction') = 'object'), '{}');
    v_index := v_index + 1;
  end loop;

  -- Remove what the document no longer contains (after upserts, so elements can move between slides).
  delete from interactions i using slides s where i.slide_id = s.id and s.presentation_id = p_presentation_id and not (i.id = any(v_interaction_ids));
  delete from slide_elements el using slides s where el.slide_id = s.id and s.presentation_id = p_presentation_id and not (el.id = any(v_element_ids));
  delete from slides where presentation_id = p_presentation_id and not (id = any(v_slide_ids));
end;
$$;

grant execute on function public.save_presentation(uuid, text, jsonb) to authenticated;
