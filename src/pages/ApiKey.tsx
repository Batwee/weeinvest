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
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
} from "lucide-react";

const API_NAME = "alphavantage";
const API_KEY_URL = "https://www.alphavantage.co/support/#api-key";

const ApiKeyPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [rowId, setRowId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const fetchKey = async () => {
      if (!user) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("api")
        .select("id, api_key")
        .eq("api_name", API_NAME)
        .eq("id_user", user.id)
        .maybeSingle();

      if (error) {
        console.error("Échec du chargement de la clé API:", error);
      } else if (data) {
        setRowId(data.id);
        setApiKey(data.api_key ?? "");
      }

      setLoading(false);
    };

    fetchKey();
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
          <div className="flex items-center gap-3">
            <UserBadge />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="rounded-full bg-white/40 hover:bg-white/60 shadow-sm border border-white/20 h-7 w-7"
            >
              <LogOut className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </header>

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
      </div>
    </div>
  );
};

export default ApiKeyPage;
