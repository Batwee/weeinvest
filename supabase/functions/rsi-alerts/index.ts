// =============================================================================
// Edge Function Supabase : alertes RSI Weekly automatiques (WeeInvest)
// -----------------------------------------------------------------------------
// Rôle :
//   1. Récupérer tous les actifs surveillés (asset_details.alerte = true).
//   2. Grouper par symbole pour mutualiser : un symbole déjà calculé il y a
//      moins de 24 h est recopié sur les autres lignes SANS appel API.
//   3. Sinon, récupérer le SMA puis le RSI (interval=weekly) avec la clé
//      Alpha Vantage du propriétaire, en respectant 1,2 s entre chaque appel.
//   4. Mettre à jour RSI / SMA / conclusion / RSI_SMA_updated_at (colonnes
//      existantes, aucune duplication).
//   5. Détecter le franchissement des seuils 35 / 70, écrire l'historique et
//      envoyer une notification Push uniquement au premier franchissement.
//
// Secrets à définir (Edge Functions -> Secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// Les clés Alpha Vantage, elles, restent par utilisateur (table public.api).
//
// Déploiement :
//   supabase functions deploy rsi-alerts --project-ref <ref> --no-verify-jwt
//
// Appel : POST /functions/v1/rsi-alerts   header: x-cron-secret: <CRON_SECRET>

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const OVERSOLD_THRESHOLD = 35;
const OVERBOUGHT_THRESHOLD = 70;
const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1200; // Alpha Vantage free tier : 1 req/s
const MAX_REQUESTS_PER_KEY = 24; // garde une marge sur la limite de 25/jour

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type AssetRow = {
  id_asset: number;
  id_invest: number | null;
  id_user: string | null;
  symbol: string;
  name_asset: string | null;
  name: string | null;
  RSI: number | null;
  SMA: string | null;
  conclusion: string | null;
  alert_state: string | null;
  RSI_SMA_updated_at: string | null;
};

type Technicals = { rsi: number | null; sma: string; conclusion: string };

// --- Calcul identique au front (AssetDetail.tsx), intervalle weekly -----------
const computeTechnicals = (smaData: any, rsiData: any): Technicals => {
  let rsi: number | null = null;
  let sma = "Non calculé";
  let conclusion = "En attente d'analyse";

  if (rsiData?.["Technical Analysis: RSI"]) {
    const entries = rsiData["Technical Analysis: RSI"];
    const dates = Object.keys(entries).slice(0, 3);
    if (dates.length > 0) {
      const values = dates.map((date) => Number(entries[date].RSI));
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      if (!Number.isNaN(average)) {
        rsi = parseFloat(average.toFixed(2));
        conclusion = rsi < OVERSOLD_THRESHOLD
          ? "Achat fort conseillé"
          : rsi > OVERBOUGHT_THRESHOLD
            ? "Vente conseillée"
            : "Marché neutre";
      }
    }
  }

  if (smaData?.["Technical Analysis: SMA"]) {
    const entries = smaData["Technical Analysis: SMA"];
    const dates = Object.keys(entries).slice(0, 5);
    if (dates.length >= 5) {
      const values = dates.map((date) => Number(entries[date].SMA));
      const n = values.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
      }
      const denominator = n * sumX2 - sumX * sumX;
      const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
      const normalizedSlope = values[0] !== 0 ? (slope / values[0]) * 100 : 0;

      if (normalizedSlope > 0.5) sma = "Forte hausse 📈";
      else if (normalizedSlope > 0 && normalizedSlope <= 0.5) sma = "Légère hausse 🟰";
      else if (normalizedSlope >= -0.5 && normalizedSlope <= 0) sma = "Légère baisse 🟰";
      else if (normalizedSlope < -0.5) sma = "Baisse forte 📉";
      else sma = "Marché stable 💤";
    }
  }

  return { rsi, sma, conclusion };
};

const isFresh = (updatedAt: string | null) => {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < REFRESH_COOLDOWN_MS;
};

const alertStateFor = (rsi: number | null): string | null => {
  if (rsi === null) return null;
  if (rsi < OVERSOLD_THRESHOLD) return "oversold";
  if (rsi > OVERBOUGHT_THRESHOLD) return "overbought";
  return null; // zone neutre -> réinitialise l'état
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Non autorisé" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  // --- Verrou : évite deux exécutions simultanées du cron ---------------------
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: running } = await supabase
    .from("rsi_alert_runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", tenMinutesAgo)
    .limit(1);

  if (running && running.length > 0) {
    return json({ skipped: true, reason: "Exécution déjà en cours" }, 409);
  }

  const { data: runRow } = await supabase
    .from("rsi_alert_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  let processed = 0;
  let requests = 0;

  try {
    // 1. Actifs surveillés uniquement (alerte = true)
    const { data: assets, error: assetsError } = await supabase
      .from("asset_details")
      .select("id_asset, id_invest, id_user, symbol, name_asset, name, RSI, SMA, conclusion, alert_state, RSI_SMA_updated_at")
      .eq("alerte", true)
      .not("symbol", "is", null);

    if (assetsError) throw assetsError;

    const rows = (assets ?? []) as AssetRow[];

    // 2. Mutualisation : regroupement par symbole
    const groups = new Map<string, AssetRow[]>();
    for (const row of rows) {
      const symbol = row.symbol.trim().toUpperCase();
      if (!symbol) continue;
      if (!groups.has(symbol)) groups.set(symbol, []);
      groups.get(symbol)!.push(row);
    }

    const requestsByKey = new Map<string, number>();
    let lastAlphaCallAt = 0;
    let alphaDisabled = false;

    const alphaFetch = async (url: string) => {
      const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastAlphaCallAt);
      if (wait > 0) await sleep(wait);
      lastAlphaCallAt = Date.now();
      const response = await fetch(url);
      return response.json();
    };

    // 3. File d'attente séquentielle, une erreur n'interrompt pas les suivantes
    for (const [symbol, group] of groups) {
      try {
        // Une ligne du groupe déjà à jour ? On réutilise sa valeur.
        const freshSource = group
          .filter((row) => row.RSI !== null && isFresh(row.RSI_SMA_updated_at))
          .sort((a, b) =>
            new Date(b.RSI_SMA_updated_at ?? 0).getTime() -
            new Date(a.RSI_SMA_updated_at ?? 0).getTime()
          )[0];

        let technicals: Technicals;

        if (freshSource) {
          // Mutualisation : aucun appel API consommé
          technicals = {
            rsi: freshSource.RSI,
            sma: freshSource.SMA ?? "Non calculé",
            conclusion: freshSource.conclusion ?? "En attente d'analyse",
          };
        } else if (alphaDisabled) {
          continue;
        } else {
          // Clé Alpha Vantage du propriétaire (première ligne du groupe à en avoir une)
          let apiKey: string | null = null;
          for (const row of group) {
            if (!row.id_user) continue;
            const { data: keyRow } = await supabase
              .from("api")
              .select("api_key")
              .eq("api_name", "alphavantage")
              .eq("id_user", row.id_user)
              .maybeSingle();
            if (keyRow?.api_key) {
              apiKey = keyRow.api_key;
              break;
            }
          }

          if (!apiKey) {
            console.warn(`Aucune clé Alpha Vantage pour ${symbol}, actif ignoré.`);
            continue;
          }

          const used = requestsByKey.get(apiKey) ?? 0;
          if (used + 2 > MAX_REQUESTS_PER_KEY) {
            console.warn(`Quota journalier atteint pour ${symbol}, actif ignoré.`);
            continue;
          }

          const smaUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=weekly&time_period=5&series_type=open&apikey=${apiKey}`;
          const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=weekly&time_period=3&series_type=open&apikey=${apiKey}`;

          const smaData = await alphaFetch(smaUrl);
          const rsiData = await alphaFetch(rsiUrl);
          requests += 2;
          requestsByKey.set(apiKey, used + 2);

          const limitMessage = smaData?.["Information"] || rsiData?.["Information"] ||
            smaData?.["Note"] || rsiData?.["Note"];
          if (limitMessage) {
            // Quota / débit atteint : on n'écrit rien et on arrête les appels API
            console.error(`Alpha Vantage limite atteinte (${symbol}): ${limitMessage}`);
            alphaDisabled = true;
            continue;
          }
          if (smaData?.["Error Message"] || rsiData?.["Error Message"]) {
            console.error(`Alpha Vantage erreur (${symbol}):`, smaData?.["Error Message"] || rsiData?.["Error Message"]);
            continue;
          }

          technicals = computeTechnicals(smaData, rsiData);

          // Rien d'exploitable : on n'écrase pas les valeurs existantes
          if (technicals.rsi === null && technicals.sma === "Non calculé") {
            console.warn(`Aucune donnée exploitable pour ${symbol}, ignoré.`);
            continue;
          }
        }

        const nowIso = new Date().toISOString();

        // 4. Application à toutes les lignes du symbole + détection des seuils
        for (const row of group) {
          const newState = alertStateFor(technicals.rsi);
          const shouldNotify = newState !== null && newState !== row.alert_state;

          const { error: updateError } = await supabase
            .from("asset_details")
            .update({
              RSI: technicals.rsi,
              SMA: technicals.sma,
              conclusion: technicals.conclusion,
              RSI_SMA_updated_at: nowIso,
              alert_state: newState,
            })
            .eq("id_asset", row.id_asset);

          if (updateError) {
            console.error(`Mise à jour refusée pour id_asset ${row.id_asset}:`, updateError.message);
            continue;
          }

          processed += 1;

          if (!shouldNotify || technicals.rsi === null || !row.id_user) continue;

          const signal = newState!;
          const threshold = signal === "oversold" ? OVERSOLD_THRESHOLD : OVERBOUGHT_THRESHOLD;
          const assetName = row.name_asset || row.name || symbol;

          // Historique des notifications
          await supabase.from("rsi_alert_history").insert({
            id_asset: row.id_asset,
            id_user: row.id_user,
            symbol,
            asset_name: assetName,
            rsi: technicals.rsi,
            signal,
            threshold,
          });

          // Envoi Push à tous les appareils de cet utilisateur
          const { data: subs } = await supabase
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("id_user", row.id_user);

          if (!subs || subs.length === 0) {
            console.warn(`Signal ${signal} pour ${symbol} mais aucun abonnement Push (user ${row.id_user}).`);
            continue;
          }

          const title = signal === "oversold"
            ? `${assetName} — Survente`
            : `${assetName} — Surachat`;
          const message = signal === "oversold"
            ? `RSI Weekly ${technicals.rsi} (< ${OVERSOLD_THRESHOLD}) : signal d'achat potentiel.`
            : `RSI Weekly ${technicals.rsi} (> ${OVERBOUGHT_THRESHOLD}) : signal de vente potentiel.`;

          const payload = JSON.stringify({
            title,
            message,
            url: row.id_invest ? `asset/${row.id_invest}` : "",
            tag: `rsi-${row.id_asset}`,
          });

          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                payload,
              );
            } catch (pushError: any) {
              // Abonnement expiré : on le supprime
              if (pushError?.statusCode === 404 || pushError?.statusCode === 410) {
                await supabase.from("push_subscriptions").delete().eq("id", sub.id);
              } else {
                console.error("Échec d'envoi Push:", pushError?.message ?? pushError);
              }
            }
          }
        }
      } catch (groupError) {
        // Une erreur sur un actif ne bloque pas les suivants
        console.error(`Erreur sur ${symbol}:`, groupError);
      }
    }

    if (runId) {
      await supabase
        .from("rsi_alert_runs")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          processed,
          requests,
        })
        .eq("id", runId);
    }

    return json({ ok: true, symbols: groups.size, processed, requests });
  } catch (error) {
    console.error("rsi-alerts a échoué:", error);
    if (runId) {
      await supabase
        .from("rsi_alert_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          processed,
          requests,
          detail: String(error),
        })
        .eq("id", runId);
    }
    return json({ ok: false, error: String(error) }, 500);
  }
});
