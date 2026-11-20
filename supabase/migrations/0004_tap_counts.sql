-- Per-product tap counts + view count for the editor (SPEC S3, §10). Labels in the UI are literal: taps, not people.
create or replace function store_counts(p_store uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'views', (select count(*) from events where store_id = p_store and type = 'store_viewed'),
    'products', coalesce((
      select jsonb_object_agg(product_id, jsonb_build_object('interested', interested, 'whatsapp', whatsapp))
      from (
        select product_id,
               count(*) filter (where type = 'interest_tapped') as interested,
               count(*) filter (where type = 'whatsapp_tapped') as whatsapp
          from events
         where store_id = p_store and type in ('interest_tapped', 'whatsapp_tapped')
         group by product_id
      ) t
    ), '{}'::jsonb)
  )
$$;
revoke all on function store_counts(uuid) from public, anon, authenticated;
grant execute on function store_counts(uuid) to service_role;
