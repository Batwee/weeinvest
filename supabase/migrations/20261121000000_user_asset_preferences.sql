-- =============================================================================
-- Préférences d'affichage des actifs (WeeInvest)
-- -----------------------------------------------------------------------------
-- À exécuter dans Supabase -> SQL Editor (ou `supabase db push`).
-- Idempotent : peut être relancé sans casser l'existant.
--
-- Remplace le stockage localStorage par une préférence persistée en base :
-- une ligne par couple (utilisateur, type d'actif). Le champ show_base_assets
-- contrôle l'affichage des actifs de base (asset_details.id_user IS NULL)
-- pour un type d'allocation donné (investment_options.id_invest).
-- =============================================================================

create table if not exists public.user_asset_preferences (
  id_user uuid not null references auth.users (id) on delete cascade,
  id_invest integer not null,
  -- true = les actifs de base (id_user NULL) sont affichés
  show_base_assets boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (id_user, id_invest)
);

comment on table public.user_asset_preferences is
  'Préférences d''affichage par utilisateur et par type d''allocation';

alter table public.user_asset_preferences enable row level security;

drop policy if exists "user_asset_preferences_select_own" on public.user_asset_preferences;
create policy "user_asset_preferences_select_own"
  on public.user_asset_preferences for select
  to authenticated
  using (id_user = auth.uid());

drop policy if exists "user_asset_preferences_insert_own" on public.user_asset_preferences;
create policy "user_asset_preferences_insert_own"
  on public.user_asset_preferences for insert
  to authenticated
  with check (id_user = auth.uid());

drop policy if exists "user_asset_preferences_update_own" on public.user_asset_preferences;
create policy "user_asset_preferences_update_own"
  on public.user_asset_preferences for update
  to authenticated
  using (id_user = auth.uid())
  with check (id_user = auth.uid());

drop policy if exists "user_asset_preferences_delete_own" on public.user_asset_preferences;
create policy "user_asset_preferences_delete_own"
  on public.user_asset_preferences for delete
  to authenticated
  using (id_user = auth.uid());
