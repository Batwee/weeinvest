// Edge Function Supabase : relais serveur pour les sources Fear & Greed qui
// n'envoient pas d'en-tête CORS (ex. onoff.markets), ce qui bloque tout fetch
// depuis le navigateur.
//
// Déploiement :
//   - Dashboard : Edge Functions -> Create function -> nom "fng-proxy" -> coller ce code
//   - CLI       : supabase functions deploy fng-proxy
// Puis désactiver "Verify JWT" pour cette fonction (l'appel se fait sans token).
//
// Appel : /functions/v1/fng-proxy?url=<url encodée>

const ALLOWED_HOSTS = [
  "onoff.markets",
  "production.dataviz.cnn.io",
  "api.alternative.me",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const jsonResponse = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) {
    return jsonResponse({ error: "Paramètre 'url' manquant" }, 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return jsonResponse({ error: "URL invalide" }, 400);
  }

  // Liste blanche : évite que la fonction serve de proxy ouvert
  if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    return jsonResponse({ error: "Hôte non autorisé" }, 403);
  }

  try {
    const response = await fetch(targetUrl.toString());
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 502);
  }
});
