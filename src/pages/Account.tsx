import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserBadge } from "@/components/UserBadge";
import { useToast } from "@/hooks/use-toast";
import { unsubscribeFromPush } from "@/lib/push";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  BarChart3,
  Bell,
} from "lucide-react";

const API_NAME = "alphavantage";
const API_KEY_URL = "https://www.alphavantage.co/support/#api-key";
// Préfixe des caches d'affichage écrits par AssetDetail.tsx. Le bouton
// d'actualisation ne nettoie que ces entrées : vider tout le localStorage
// supprimerait le jeton de session Supabase et déconnecterait l'utilisateur.
const CACHE_PREFIX = "asset-detail-cache-";

const Account = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState("");
  const [rowId, setRowId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [alertCount, setAlertCount] = useState<number | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);

      const [keyRes, assetsRes, alertsRes] = await Promise.all([
        supabase
          .from("api")
          .select("id, api_key")
          .eq("api_name", API_NAME)
          .eq("id_user", user.id)
          .maybeSingle(),
        supabase
          .from("asset_details")
          .select("*", { count: "exact", head: true })
          .eq("id_user", user.id),
        supabase
          .from("asset_details")
          .select("*", { count: "exact", head: true })
          .eq("id_user", user.id)
          .eq("alerte", true),
      ]);

      if (keyRes.error) {
        console.error("Échec du chargement de la clé API:", keyRes.error);
      } else if (keyRes.data) {
        setRowId(keyRes.data.id);
        setApiKey(keyRes.data.api_key ?? "");
      }

      if (assetsRes.error) console.error("Échec du comptage des actifs:", assetsRes.error);
      else setAssetCount(assetsRes.count ?? 0);

      if (alertsRes.error) console.error("Échec du comptage des alertes:", alertsRes.error);
      else setAlertCount(alertsRes.count ?? 0);

      setLoading(false);
    };

    load();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      toast({
        variant: "destructive",
        title: "Clé vide",
        description: "Veuillez saisir votre clé API Alpha Vantage.",
      });
      return;
    }

    setSaving(true);
    try {
      if (rowId !== null) {
        const { error } = await supabase
          .from("api")
          .update({ api_key: trimmedKey })
          .eq("id", rowId)
          .eq("id_user", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("api")
          .insert({ api_name: API_NAME, api_key: trimmedKey, id_user: user.id })
          .select("id")
          .single();
        if (error) throw error;
        setRowId(data.id);
      }

      setApiKey(trimmedKey);
      toast({
        title: rowId !== null ? "Clé mise à jour" : "Clé enregistrée",
        description: "Votre clé API Alpha Vantage a bien été sauvegardée.",
        duration: 2500,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    const removed = Object.keys(localStorage).filter((key) => key.startsWith(CACHE_PREFIX));
    removed.forEach((key) => localStorage.removeItem(key));

    toast({
      title: "Données actualisées",
      description: `${removed.length} cache(s) local(aux) vidé(s). Rechargement...`,
      duration: 2000,
    });

    setTimeout(() => window.location.reload(), 600);
  };

  const handleLogout = async () => {
    await unsubscribeFromPush();
    await supabase.auth.signOut();
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (error) throw error;

      Object.keys(localStorage)
        .filter((key) => key.startsWith(CACHE_PREFIX))
        .forEach((key) => localStorage.removeItem(key));

      toast({
        title: "Compte supprimé",
        description: "Votre compte et vos données ont été définitivement supprimés.",
        duration: 3000,
      });

      await supabase.auth.signOut();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: error?.message ?? "Une erreur est survenue.",
      });
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="h-8 px-2 hover:bg-secondary/50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <UserBadge compact={false} />
        </header>

        <h1 className="text-2xl font-black tracking-tight">Mon compte</h1>

        {/* Statistiques */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="glassmorphism border-none shadow-lg">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Mes actifs</span>
              </div>
              <p className="text-2xl font-black">
                {assetCount === null ? "—" : assetCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Actifs personnels ajoutés</p>
            </CardContent>
          </Card>

          <Card className="glassmorphism border-none shadow-lg">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Bell className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-medium text-muted-foreground">Alertes activées</span>
              </div>
              <p className="text-2xl font-black">
                {alertCount === null ? "—" : alertCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Surveillance RSI Weekly</p>
            </CardContent>
          </Card>
        </div>

        {/* Clé API Alpha Vantage */}
        <Card className="glassmorphism border-none shadow-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Clé API Alpha Vantage</CardTitle>
                <CardDescription>
                  Nécessaire pour lancer les analyses techniques (RSI / SMA) de vos actifs.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-lg border border-white/20 bg-white/30 p-3 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Comment obtenir votre clé ?</p>
              <p>
                Rendez-vous sur{" "}
                <a
                  href={API_KEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary font-medium underline"
                >
                  Alpha Vantage <ExternalLink className="w-3 h-3" />
                </a>
                , saisissez votre email pour obtenir une clé gratuite, copiez-la puis collez-la
                ci-dessous.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">
                    Votre clé API {rowId !== null && <span className="text-green-600">(enregistrée)</span>}
                  </Label>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showKey ? "text" : "password"}
                      placeholder="Collez votre clé Alpha Vantage ici"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="pr-10 font-mono text-sm"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {rowId !== null ? "Mettre à jour la clé" : "Enregistrer la clé"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Actualisation du cache local */}
        <Card className="glassmorphism border-none shadow-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <RefreshCw className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Actualisation des données</CardTitle>
                <CardDescription>
                  Vide le cache local pour forcer le rechargement des dernières valeurs.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={handleRefresh} variant="outline" className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser maintenant
            </Button>
          </CardContent>
        </Card>

        {/* Session et compte */}
        <Card className="glassmorphism border-none shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl font-bold">Session</CardTitle>
            <CardDescription>Déconnexion et gestion du compte.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleLogout} variant="outline" className="w-full">
              <LogOut className="mr-2 h-4 w-4 text-destructive" />
              Se déconnecter
            </Button>

            {confirmDelete ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm text-destructive font-medium">
                  Confirmer la suppression définitive ? Cette action est irréversible : votre compte
                  et toutes vos données seront effacés.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Oui, supprimer
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer mon compte
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Account;
