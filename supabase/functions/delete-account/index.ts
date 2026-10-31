// Edge Function Supabase : suppression définitive du compte utilisateur.
// ---------------------------------------------------------------------------
// La suppression d'un utilisateur passe obligatoirement par l'API Admin de
// Supabase (service_role), jamais exposable au navigateur. Cette fonction
// vérifie le JWT de l'appelant, supprime ses données puis le compte auth.
//
// Déploiement :
//   CLI : supabase functions deploy delete-account --project-ref <ref>
//   (Verify JWT laissé ACTIF : l'appel se fait avec le token de session.)
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Token d'authentification manquant" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration serveur incomplète" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Identifie l'appelant à partir de son JWT : impossible de supprimer le
  // compte d'un autre utilisateur.
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Session invalide" }, 401);
  }

  const userId = userData.user.id;

  try {
    // Ordre : données applicatives d'abord, compte auth en dernier.
    await admin.from("push_subscriptions").delete().eq("id_user", userId);
    await admin.from("rsi_alert_history").delete().eq("id_user", userId);
    await admin.from("asset_details").delete().eq("id_user", userId);
    await admin.from("api").delete().eq("id_user", userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      500
    );
  }
});
