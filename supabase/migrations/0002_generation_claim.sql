-- Atomic claim + stale detection (SPEC §7.4, implementation check 1).
-- Both use the DB clock and the same thresholds, so "UI shows Retry" (is_stale) always implies "claim succeeds".
-- Pending rows: updated_at = when the row entered 'pending' (insert, /answer); nothing else updates a pending row.

create or replace function store_is_stale(s stores) returns boolean
language sql stable as $$
  select (s.status = 'pending'    and s.updated_at     < now() - interval '15 seconds')
      or (s.status = 'generating' and s.gen_started_at < now() - interval '75 seconds')
$$;

-- Claim accepts: any pending (fresh from after(), or stale > 15s via /retry), failed,
-- and generating that is stale (> 75s). Returns the row only to the single winner.
create or replace function claim_generation(p_id uuid) returns setof stores
language sql volatile as $$
  update stores
     set status = 'generating', gen_started_at = now(), gen_attempts = gen_attempts + 1
   where id = p_id
     and (status in ('pending', 'failed')
          or (status = 'generating' and gen_started_at < now() - interval '75 seconds'))
  returning *
$$;

-- Store by token hash, with the stale flag computed on the DB clock.
create or replace function get_store_by_token_hash(p_hash text) returns jsonb
language sql stable as $$
  select to_jsonb(s) || jsonb_build_object('is_stale', store_is_stale(s))
    from stores s where s.edit_token_hash = p_hash
$$;

revoke all on function store_is_stale(stores), claim_generation(uuid), get_store_by_token_hash(text) from public, anon, authenticated;
grant execute on function store_is_stale(stores), claim_generation(uuid), get_store_by_token_hash(text) to service_role;
