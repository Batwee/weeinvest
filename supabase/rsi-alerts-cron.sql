-- =============================================================================
-- Planification quotidienne des alertes RSI Weekly (WeeInvest)
-- -----------------------------------------------------------------------------
-- À exécuter dans Supabase -> SQL Editor, APRÈS avoir :
--   1. activé les extensions pg_cron et pg_net (Database -> Extensions),
--   2. déployé l'Edge Function rsi-alerts,
--   3. défini le secret CRON_SECRET sur la fonction.
--
-- Remplace <CRON_SECRET> ci-dessous par la même valeur que le secret Supabase.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Supprime l'ancienne planification si elle existe (relance sans erreur)
select cron.unschedule(jobid) from cron.job where jobname = 'rsi-alerts-daily';

-- Tous les jours à 18:00 heure de Paris, toute l'année (gère été/hiver).
-- pg_cron ne connaît que UTC : on déclenche donc un contrôle toutes les
-- heures, et la requête ne part que si l'heure locale parisienne vaut 18.
-- Le dollar-quote est nommé ($cron$) pour éviter tout conflit de parsing.
select cron.schedule(
  'rsi-alerts-daily',
  '0 * * * *',
  $cron$select net.http_post(
    url := 'https://rgodejjtasgluerbzfvr.supabase.co/functions/v1/rsi-alerts',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) where extract(hour from (now() at time zone 'Europe/Paris')) = 18;$cron$
);

-- Vérification / suivi :
--   select * from cron.job;
--   select * from rsi_alert_runs order by started_at desc limit 10;
--   select * from rsi_alert_history order by sent_at desc limit 20;
--
-- Exécution manuelle immédiate (test) :
--   select net.http_post(
--     url := 'https://rgodejjtasgluerbzfvr.supabase.co/functions/v1/rsi-alerts',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 300000
--   );
