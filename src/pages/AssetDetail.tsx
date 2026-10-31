import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase, getApiKey, type InvestmentOptions, type AssetDetail as AssetDetailType, type Affiliate } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowLeft, 
  Calculator, 
  ExternalLink, 
  ShieldCheck,
  Loader2,
  AlertCircle,
  Gauge,
  TrendingUp as TrendUp,
  LogOut,
  KeyRound,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Bell,
  BellOff
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserBadge } from "@/components/UserBadge";
import { useAuth } from "@/hooks/useAuth";
import {
  isPushSupported,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

type AssetDetailCache = {
  date: string;
  investment: InvestmentOptions | null;
  assets: AssetDetailType[];
  affiliates: Affiliate[];
};

const getTodayDate = () => new Date().toISOString().split("T")[0];

const getAssetDetailCacheKey = (id: string) => `asset-detail-cache-${id}`;
const ANALYSIS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const readAssetDetailCache = (id: string): AssetDetailCache | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawCache = localStorage.getItem(getAssetDetailCacheKey(id));
    return rawCache ? JSON.parse(rawCache) : null;
  } catch (error) {
    console.error("Failed to read asset detail cache:", error);
    return null;
  }
};

const writeAssetDetailCache = (id: string, payload: AssetDetailCache) => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(getAssetDetailCacheKey(id), JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to write asset detail cache:", error);
  }
};

const getRemainingAnalysisCooldown = (updatedAt?: string) => {
  if (!updatedAt) return 0;

  const lastUpdate = new Date(updatedAt).getTime();
  if (Number.isNaN(lastUpdate)) return 0;

  return Math.max(0, ANALYSIS_COOLDOWN_MS - (Date.now() - lastUpdate));
};

const isAnalysisLocked = (updatedAt?: string) => getRemainingAnalysisCooldown(updatedAt) > 0;

const formatRemainingCooldown = (updatedAt?: string) => {
  const remaining = getRemainingAnalysisCooldown(updatedAt);
  if (remaining <= 0) return "";

  const totalHours = Math.ceil(remaining / (60 * 60 * 1000));
  return `${totalHours} h`;
};

// Un indice dont la date n'est pas celle du jour doit être retenté.
// Sans ce test, le cache local masquait un échec d'actualisation pendant 24 h.
const needsIndexRefresh = (investment?: InvestmentOptions | null) => {
  if (!investment) return false;

  const today = getTodayDate();

  const fngStale =
    investment.fear_and_greed != null &&
    (!investment.fng_updated_at || !investment.fng_updated_at.startsWith(today));

  const altcoinStale =
    investment.altcoin_index != null &&
    (!investment.altcoin_index_updated_at || !investment.altcoin_index_updated_at.startsWith(today));

  return fngStale || altcoinStale;
};

// Catégories d'investissement autorisant l'ajout d'un ticker (voir table investment_options)
// id_invest : 1 = Crypto, 2 = Bourse, 5 = Métaux Précieux
const TICKER_INVEST_IDS = [1, 2, 5];

const supportsTicker = (idInvest?: number) => TICKER_INVEST_IDS.includes(Number(idInvest));

const AssetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [investment, setInvestment] = useState<InvestmentOptions | null>(null);
  const [assets, setAssets] = useState<AssetDetailType[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTechnical, setLoadingTechnical] = useState<Record<number, boolean>>({});
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetSymbol, setNewAssetSymbol] = useState("");
  const [addingAsset, setAddingAsset] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSymbol, setEditSymbol] = useState("");
  const [busyAssetId, setBusyAssetId] = useState<number | null>(null);
  const [busyAlertId, setBusyAlertId] = useState<number | null>(null);

  const handleLogout = async () => {
    // Supprime l'abonnement Push de cet appareil avant de quitter la session
    try {
      await unsubscribeFromPush();
    } catch (error) {
      console.error("Échec de la désinscription Push:", error);
    }
    await supabase.auth.signOut();
  };

  const updateCache = (
    nextInvestment: InvestmentOptions | null = investment,
    nextAssets: AssetDetailType[] = assets,
    nextAffiliates: Affiliate[] = affiliates
  ) => {
    if (!id) return;

    writeAssetDetailCache(id, {
      date: getTodayDate(),
      investment: nextInvestment,
      assets: nextAssets,
      affiliates: nextAffiliates,
    });
  };

  const handleAddAsset = async () => {
    const name = newAssetName.trim();
    const symbol = newAssetSymbol.trim().toUpperCase();

    if (!name || !symbol) {
      toast({ variant: "destructive", title: "Champs requis", description: "Renseignez le nom et le ticker." });
      return;
    }
    if (!user || !id) return;

    setAddingAsset(true);
    try {
      const { data, error } = await supabase
        .from("asset_details")
        .insert({ name_asset: name, symbol, id_invest: Number(id), id_user: user.id })
        .select()
        .single();

      if (error) throw error;

      const nextAssets = [...assets, data as AssetDetailType].sort(
        (a, b) => (b.market_cap || 0) - (a.market_cap || 0)
      );
      setAssets(nextAssets);
      updateCache(investment, nextAssets, affiliates);
      setNewAssetName("");
      setNewAssetSymbol("");
      toast({ title: "Actif ajouté", duration: 2000 });
    } catch (err) {
      console.error("Failed to add asset:", err);
      toast({
        variant: "destructive",
        title: "Ajout impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setAddingAsset(false);
    }
  };

  const startEditAsset = (asset: AssetDetailType) => {
    setEditingAssetId(asset.id_asset);
    setEditName(asset.name_asset || asset.name || "");
    setEditSymbol(asset.symbol || "");
  };

  const cancelEditAsset = () => {
    setEditingAssetId(null);
    setEditName("");
    setEditSymbol("");
  };

  const handleSaveAsset = async (asset: AssetDetailType) => {
    const name = editName.trim();
    const symbol = editSymbol.trim().toUpperCase();

    if (!name || !symbol) {
      toast({ variant: "destructive", title: "Champs requis", description: "Renseignez le nom et le ticker." });
      return;
    }

    setBusyAssetId(asset.id_asset);
    try {
      const { error } = await supabase
        .from("asset_details")
        .update({ name_asset: name, symbol })
        .eq("id_asset", asset.id_asset);

      if (error) throw error;

      const nextAssets = assets.map((a) =>
        a.id_asset === asset.id_asset ? { ...a, name_asset: name, symbol } : a
      );
      setAssets(nextAssets);
      updateCache(investment, nextAssets, affiliates);
      cancelEditAsset();
      toast({ title: "Actif mis à jour", duration: 2000 });
    } catch (err) {
      console.error("Failed to update asset:", err);
      toast({
        variant: "destructive",
        title: "Modification impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setBusyAssetId(null);
    }
  };

  const handleDeleteAsset = async (asset: AssetDetailType) => {
    setBusyAssetId(asset.id_asset);
    try {
      const { error } = await supabase
        .from("asset_details")
        .delete()
        .eq("id_asset", asset.id_asset);

      if (error) throw error;

      const nextAssets = assets.filter((a) => a.id_asset !== asset.id_asset);
      setAssets(nextAssets);
      updateCache(investment, nextAssets, affiliates);
      toast({ title: "Actif supprimé", duration: 2000 });
    } catch (err) {
      console.error("Failed to delete asset:", err);
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setBusyAssetId(null);
    }
  };

  // Bascule des alertes RSI. asset_details.alerte reste la source de vérité :
  // le bouton reflète toujours la valeur enregistrée en base.
  const handleToggleAlerts = async (asset: AssetDetailType) => {
    if (!user) return;

    const nextValue = !asset.alerte;
    setBusyAlertId(asset.id_asset);

    try {
      const { error } = await supabase
        .from("asset_details")
        .update({ alerte: nextValue })
        .eq("id_asset", asset.id_asset);

      if (error) throw error;

      if (nextValue) {
        if (!isPushSupported()) {
          toast({
            variant: "destructive",
            title: "Notifications non supportées",
            description: "Ce navigateur ne gère pas les notifications Push. Les alertes restent activées en base.",
          });
        } else {
          const permission = await requestNotificationPermission();

          if (permission === "granted") {
            await subscribeToPush(user.id);
            toast({
              title: "Alertes RSI activées",
              description: "Une notification sera envoyée au franchissement des seuils 35 / 70.",
            });
          } else {
            // Refus : alerte conservée à true, l'utilisateur pourra réactiver plus tard
            toast({
              variant: "destructive",
              title: "Notifications refusées",
              description: "Alertes enregistrées, mais aucune notification ne sera envoyée. Autorisez les notifications dans les réglages du navigateur.",
            });
          }
        }
      } else {
        toast({ title: "Alertes RSI désactivées", duration: 2000 });
      }

      const nextAssets = assets.map((a) =>
        a.id_asset === asset.id_asset ? { ...a, alerte: nextValue } : a
      );
      setAssets(nextAssets);
      updateCache(investment, nextAssets, affiliates);
    } catch (err) {
      console.error("Failed to toggle RSI alerts:", err);
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setBusyAlertId(null);
    }
  };

  useEffect(() => {
    const fetchAssetData = async () => {
      if (!id) return;
      setLoading(true);

      const today = getTodayDate();
      const cachedData = readAssetDetailCache(id);

      if (cachedData && cachedData.date === today && !needsIndexRefresh(cachedData.investment)) {
        setInvestment(cachedData.investment);
        setAssets(cachedData.assets);
        setAffiliates(cachedData.affiliates);
        setLoading(false);
        return;
      }

      try {
        // Fetch investment option
        const { data: invData, error: invError } = await supabase
          .from('investment_options')
          .select('*')
          .eq('id_invest', id)
          .single();
        
        if (invError) throw invError;
        let finalInvestment = invData;

        // Auto-update indices if needed (once per day)
        if (invData) {
          const needsFngUpdate = !invData.fng_updated_at || !invData.fng_updated_at.startsWith(today);
          const needsAltUpdate = !invData.altcoin_index_updated_at || !invData.altcoin_index_updated_at.startsWith(today);

          if ((needsFngUpdate && invData.fear_and_greed !== null) || (needsAltUpdate && invData.altcoin_index !== null)) {
            const updates: any = {};
            
            if (needsFngUpdate && invData.fear_and_greed !== null) {
              try {
                // Determine which API to use based on lien_fng
                const apiUrl = invData.lien_fng || (invData.name_invest?.toLowerCase().includes("crypto") ? 'https://api.alternative.me/fng/' : null);
                
                if (apiUrl) {
                  const response = await fetch(apiUrl);
                  const fngData = await response.json();
                  
                  // Use dynamic json_path from Supabase if available
                  if (invData.json_path) {
                    const keys = invData.json_path.split('.');
                    let value: any = fngData;
                    
                    // Traverse the JSON object using the path
                    for (const key of keys) {
                      if (value && typeof value === 'object') {
                        // Handle array index notation like data[0]
                        const arrayMatch = key.match(/(\w+)\[(\d+)\]/);
                        if (arrayMatch) {
                          const [, prop, index] = arrayMatch;
                          value = value[prop]?.[parseInt(index)];
                        } else {
                          value = value[key];
                        }
                      } else {
                        value = undefined;
                        break;
                      }
                    }

                    if (value !== undefined && value !== null) {
                      updates.fear_and_greed = Math.round(parseFloat(value.toString()));
                      updates.fng_updated_at = new Date().toISOString();
                    }
                  } else {
                    // Fallback to legacy hardcoded logic if json_path is missing
                    if (apiUrl.includes('alternative.me')) {
                      if (fngData.data && fngData.data[0]) {
                        updates.fear_and_greed = parseInt(fngData.data[0].value);
                        updates.fng_updated_at = new Date().toISOString();
                      }
                    } else if (apiUrl.includes('cnn.io')) {
                      if (fngData.fear_and_greed && fngData.fear_and_greed.score) {
                        updates.fear_and_greed = Math.round(parseFloat(fngData.fear_and_greed.score));
                        updates.fng_updated_at = new Date().toISOString();
                      }
                    }
                  }
                }
              } catch (apiError) {
                // Échec du fetch (CORS, réseau, quota) : on ne touche pas à
                // fng_updated_at pour ne pas verrouiller le cooldown sur une
                // valeur fausse. La dernière valeur connue est conservée.
                console.warn("Fear & Greed indisponible, dernière valeur conservée:", apiError);
              }
            }

            if (needsAltUpdate && invData.altcoin_index !== null) {
              // Simulate Altcoin index fetch
              updates.altcoin_index = Math.floor(10 + Math.random() * 80);
              updates.altcoin_index_updated_at = new Date().toISOString();
            }

            if (Object.keys(updates).length > 0) {
              const { data: updatedInv, error: updateError } = await supabase
                .from('investment_options')
                .update(updates)
                .eq('id_invest', id)
                .select()
                .single();

              if (updateError) {
                // Erreur silencieuse auparavant : typiquement un refus RLS sur investment_options
                console.error("Mise à jour des indices refusée:", updateError.message);
              } else if (updatedInv) {
                finalInvestment = updatedInv;
              }
            }
          }
        }

        setInvestment(finalInvestment);

        // Fetch asset details (tokens, stocks, etc.)
        const { data: assetsData } = await supabase
          .from('asset_details')
          .select('*')
          .eq('id_invest', id);
        
        const sortedAssets = assetsData
          ? [...assetsData].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
          : [];

        setAssets(sortedAssets);

        // Fetch affiliates
        const { data: affiliatesData } = await supabase
          .from('affiliates')
          .select('*')
          .eq('id_invest', id);
        
        const nextAffiliates = affiliatesData || [];
        setAffiliates(nextAffiliates);
        writeAssetDetailCache(id, {
          date: today,
          investment: finalInvestment,
          assets: sortedAssets,
          affiliates: nextAffiliates,
        });
      } catch (err) {
        console.error("Error fetching asset details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssetData();
  }, [id]);

  const handleTechnicalAnalysis = async (asset: AssetDetailType) => {
    if (isAnalysisLocked(asset.RSI_SMA_updated_at)) {
      return;
    }

    setLoadingTechnical(prev => ({ ...prev, [asset.id_asset]: true }));
    try {
      // 1. Check if already updated in the last 24 hours
      if (isAnalysisLocked(asset.RSI_SMA_updated_at)) {
        return;
      }
      const apiKey = await getApiKey('alphavantage');
      const symbol = asset.symbol;

      if (!symbol) {
        console.error("No symbol found for asset:", asset.name);
        return;
      }

      if (!apiKey) {
        toast({
          variant: "destructive",
          title: "Clé API requise",
          description: "Ajoutez votre clé Alpha Vantage pour lancer l'analyse technique.",
        });
        navigate("/api-key");
        return;
      }

      // 2. Fetch SMA (intervalle weekly : aucune donnée daily dans l'app)
      const smaUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=weekly&time_period=5&series_type=open&apikey=${apiKey}`;
      const smaResponse = await fetch(smaUrl);
      const smaData = await smaResponse.json();

      // Alpha Vantage limite le tier gratuit à 1 requête/seconde : on patiente
      // avant la seconde requête, sinon elle est rejetée.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // 3. Fetch RSI (weekly également)
      const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=weekly&time_period=3&series_type=open&apikey=${apiKey}`;
      const rsiResponse = await fetch(rsiUrl);
      const rsiData = await rsiResponse.json();

      // 3bis. Détection du quota / de la limite de débit (clé "Information")
      const limitMessage = smaData["Information"] || rsiData["Information"] || smaData["Note"] || rsiData["Note"];
      if (limitMessage) {
        console.error("Alpha Vantage quota/limit:", limitMessage);
        toast({
          variant: "destructive",
          title: "Quota Alpha Vantage atteint",
          description: "Limite gratuite : 25 requêtes par jour et 1 par seconde. Réessayez plus tard.",
        });
        return;
      }

      if (smaData["Error Message"] || rsiData["Error Message"]) {
        console.error("Alpha Vantage API error:", smaData["Error Message"] || rsiData["Error Message"]);
        toast({
          variant: "destructive",
          title: "Erreur Alpha Vantage",
          description: smaData["Error Message"] || rsiData["Error Message"],
        });
        return;
      }

      let finalRSI: number | null = null;
      let finalSMA = "Non calculé";
      let finalConclusion = "En attente d'analyse";

      // Traitement des données RSI avec moyenne sur 3 jours
      if (rsiData['Technical Analysis: RSI']) {
        const rsiEntries = rsiData['Technical Analysis: RSI'];
        const dates = Object.keys(rsiEntries).slice(0, 3);
        
        if (dates.length > 0) {
          const rsiValues = dates.map(date => Number(rsiEntries[date].RSI));
          const rsiAverage = rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length;
          
          if (!isNaN(rsiAverage)) {
              finalRSI = parseFloat(rsiAverage.toFixed(2));
              
              if (finalRSI < 35) {
                finalConclusion = "Achat fort conseillé";
              } else if (finalRSI > 70) {
                finalConclusion = "Vente conseillée";
              } else {
                finalConclusion = "Marché neutre";
              }
            }
        }
      } else {
        console.warn(`Aucune donnée RSI reçue pour ${symbol}:`, rsiData);
      }

      // Traitement des données SMA avec calcul de pente
      if (smaData['Technical Analysis: SMA']) {
        const smaEntries = smaData['Technical Analysis: SMA'];
        const dates = Object.keys(smaEntries).slice(0, 5);
        
        if (dates.length >= 5) {
          const smaValues = dates.map(date => Number(smaEntries[date].SMA));

          // Calcul de la pente (slope)
          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
          const n = smaValues.length;

          for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += smaValues[i];
            sumXY += i * smaValues[i];
            sumX2 += i * i;
          }

          const denominator = (n * sumX2 - sumX * sumX);
          const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
          const normalizedSlope = smaValues[0] !== 0 ? (slope / smaValues[0]) * 100 : 0;

          // Déterminer la tendance SMA
          if (normalizedSlope > 0.5) {
            finalSMA = 'Forte hausse 📈';
          } else if (normalizedSlope > 0 && normalizedSlope <= 0.5) {
            finalSMA = 'Légère hausse 🟰';
          } else if (normalizedSlope >= -0.5 && normalizedSlope <= 0) {
            finalSMA = 'Légère baisse 🟰';
          } else if (normalizedSlope < -0.5) {
            finalSMA = 'Baisse forte 📉';
          } else {
            finalSMA = 'Marché stable 💤';
          }
        }
      } else {
        console.warn(`Aucune donnée SMA reçue pour ${symbol}:`, smaData);
      }

      // Rien d'exploitable : on n'écrase pas les valeurs existantes et on
      // ne verrouille pas le cooldown de 24 h.
      if (finalRSI === null && finalSMA === "Non calculé") {
        console.error("Aucune donnée technique exploitable reçue pour", symbol);
        toast({
          variant: "destructive",
          title: "Analyse indisponible",
          description: "Aucune donnée reçue d'Alpha Vantage pour ce symbole.",
        });
        return;
      }

      const updates = {
        RSI: finalRSI,
        SMA: finalSMA,
        conclusion: finalConclusion,
        RSI_SMA_updated_at: new Date().toISOString()
      };

      const { data: updatedData, error: updateError } = await supabase
        .from('asset_details')
        .update(updates)
        .eq('id_asset', asset.id_asset)
        .select();
      
      if (updateError) {
        console.error("Supabase update error:", updateError);
        throw updateError;
      }
      
      const nextAssets = assets.map((a) =>
        a.id_asset === asset.id_asset ? { ...a, ...updates } : a
      );

      setAssets(nextAssets);
      updateCache(investment, nextAssets, affiliates);
    } catch (err) {
      console.error("Technical analysis failed:", err);
    } finally {
      setLoadingTechnical(prev => ({ ...prev, [asset.id_asset]: false }));
    }
  };

  const handleAffiliateClick = async (affiliate: Affiliate) => {
    const nextClickCount = (affiliate.click_count || 0) + 1;
    const nextAffiliates = affiliates.map((item) =>
      item.id_affiliate === affiliate.id_affiliate
        ? { ...item, click_count: nextClickCount }
        : item
    );

    setAffiliates(nextAffiliates);
    updateCache(investment, assets, nextAffiliates);
    window.open(affiliate.link, "_blank");

    const { error } = await supabase
      .from("affiliates")
      .update({ click_count: nextClickCount })
      .eq("id_affiliate", affiliate.id_affiliate);

    if (error) {
      console.error("Failed to update affiliate click count:", error);
    }
  };

  const isSavings = investment?.name_invest?.toLowerCase().includes("epargne") || investment?.name_invest?.toLowerCase().includes("livret");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!investment) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center space-y-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>Impossible de trouver les détails de cet investissement.</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/")} variant="outline">Retour à l'accueil</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex items-center justify-between mb-2 pb-3 border-b border-white/10">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/")} 
            className="h-8 px-2 hover:bg-secondary/50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <div className="flex items-center gap-3">
            <UserBadge compact={false} />
            <Button variant="ghost" size="icon" onClick={() => navigate("/api-key")} className="rounded-full bg-white/40 hover:bg-white/60 shadow-sm border border-white/20 h-9 w-9">
              <KeyRound className="w-4 h-4 text-primary" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full bg-white/40 hover:bg-white/60 shadow-sm border border-white/20 h-9 w-9">
              <LogOut className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </header>

        <header className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{investment.name_invest}</h1>
                <Badge variant="outline" className="text-primary border-primary">
                  Risque {investment.risk_level}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{investment.description}</p>
            </div>
          </div>

          {/* Indices Spécifiques à l'Asset */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            {!isSavings && investment.fear_and_greed !== null && (
              <Card className="glassmorphism border-none shadow-lg overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-5 h-5 text-orange-500" />
                      <span className="font-bold text-sm">Fear &amp; Greed {investment.name_invest} Index</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-black text-orange-600">
                        {investment.fear_and_greed}
                      </span>
                      {investment.fear_and_greed <= 25 && (
                        <span className="text-[10px] font-bold text-red-600 uppercase">Extreme Fear</span>
                      )}
                      {investment.fear_and_greed > 25 && investment.fear_and_greed <= 45 && (
                        <span className="text-[10px] font-bold text-orange-500 uppercase">Fear</span>
                      )}
                      {investment.fear_and_greed > 45 && investment.fear_and_greed <= 55 && (
                        <span className="text-[10px] font-bold text-yellow-500 uppercase">Neutral</span>
                      )}
                      {investment.fear_and_greed > 55 && investment.fear_and_greed <= 75 && (
                        <span className="text-[10px] font-bold text-green-500 uppercase">Greed</span>
                      )}
                      {investment.fear_and_greed > 75 && (
                        <span className="text-[10px] font-bold text-green-700 uppercase">Extreme Greed</span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-secondary/50 h-2.5 rounded-full overflow-hidden border border-secondary">
                    <div 
                      className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" 
                      style={{ width: `${investment.fear_and_greed}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    Mis à jour le {investment.fng_updated_at ? new Date(investment.fng_updated_at).toLocaleDateString() : 'N/A'}
                  </p>
                </CardContent>
              </Card>
            )}

            {!isSavings && investment.altcoin_index !== null && (
              <Card className="glassmorphism border-none shadow-lg overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendUp className="w-5 h-5 text-purple-500" />
                      <span className="font-bold text-sm">Altcoin Season Index</span>
                    </div>
                    <span className="text-2xl font-black text-purple-600">
                      {investment.altcoin_index}
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 h-2.5 rounded-full overflow-hidden border border-secondary">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500" 
                      style={{ width: `${investment.altcoin_index}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    Mis à jour le {investment.altcoin_index_updated_at ? new Date(investment.altcoin_index_updated_at).toLocaleDateString() : 'N/A'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3">
          <h2 className="text-xl font-semibold">{isSavings ? "Supports d'épargne" : "Composants de l'allocation"}</h2>
          {assets.map((asset) => {
            const lastUpdate = asset.RSI_SMA_updated_at ? new Date(asset.RSI_SMA_updated_at).getTime() : 0;
            const timeSinceLastUpdate = Date.now() - lastUpdate;
            const canAnalyze = timeSinceLastUpdate >= ANALYSIS_COOLDOWN_MS;
            
            return (
              <Card key={asset.id_asset} className="glassmorphism border-none overflow-hidden group">
                <CardHeader className="flex flex-row items-center justify-between px-4 py-3 pb-2 gap-2">
                  {editingAssetId === asset.id_asset ? (
                    <div className="flex w-full items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nom de l'actif"
                        className="h-8"
                      />
                      <Input
                        value={editSymbol}
                        onChange={(e) => setEditSymbol(e.target.value)}
                        placeholder="Ticker"
                        className="h-8 w-28 font-mono uppercase"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleSaveAsset(asset)}
                        disabled={busyAssetId === asset.id_asset}
                      >
                        {busyAssetId === asset.id_asset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={cancelEditAsset}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <CardTitle className={!asset.symbol ? "text-xl font-bold" : "text-lg"}>
                          {asset.name_asset || asset.name}
                        </CardTitle>
                        {asset.symbol && (
                          <CardDescription className="font-mono text-xs text-primary">
                            {asset.symbol}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {asset.id_user === user?.id && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEditAsset(asset)}
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteAsset(asset)}
                              disabled={busyAssetId === asset.id_asset}
                              title="Supprimer"
                            >
                              {busyAssetId === asset.id_asset
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4 text-destructive" />}
                            </Button>
                          </>
                        )}
                        {asset.symbol && (
                          <Button 
                            onClick={() => handleTechnicalAnalysis(asset)}
                            disabled={!canAnalyze || loadingTechnical[asset.id_asset]}
                            size="sm"
                            variant={canAnalyze ? "secondary" : "outline"}
                            className={`h-8 gap-2 px-3 ${!canAnalyze ? "bg-gray-100 text-gray-400" : ""}`}
                          >
                            {loadingTechnical[asset.id_asset] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Calculator className="w-4 h-4" />
                            )}
                            {canAnalyze ? "Analyse" : `Dans ${formatRemainingCooldown(asset.RSI_SMA_updated_at)}`}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardHeader>
                {asset.symbol && (
                  <CardContent className="space-y-2 px-4 pb-3 pt-0">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-xs text-muted-foreground font-semibold">RSI :</span>
                          <span className="font-bold">
                            {asset.RSI !== null && asset.RSI !== undefined ? asset.RSI : "—"}
                          </span>
                          {asset.RSI !== null && asset.RSI !== undefined && asset.RSI < 35 && <TrendingUp className="w-4 h-4 text-green-500" />}
                          {asset.RSI !== null && asset.RSI !== undefined && asset.RSI > 70 && <TrendingDown className="w-4 h-4 text-red-500" />}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-xs text-muted-foreground font-semibold">SMA :</span>
                          <span className="font-medium">{asset.SMA || "Non calculé"}</span>
                        </div>
                      </div>
                      <div className="space-y-1 text-sm text-right">
                        <div className="text-xs text-muted-foreground font-semibold">Conclusion :</div>
                        <div className="flex justify-end">
                          <Badge variant={asset.conclusion?.includes("Achat") ? "default" : "secondary"}>
                            {asset.conclusion || "En attente d'analyse"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {asset.RSI_SMA_updated_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Dernière analyse le {new Date(asset.RSI_SMA_updated_at).toLocaleString()}
                      </p>
                    )}
                    {asset.id_user === user?.id && (
                      <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-white/10">
                        <div className="flex items-center gap-2 min-w-0">
                          {asset.alerte ? (
                            <Bell className="w-4 h-4 text-primary shrink-0" />
                          ) : (
                            <BellOff className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground truncate">
                            Alertes RSI Weekly (seuils 35 / 70)
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant={asset.alerte ? "outline" : "secondary"}
                          className="h-7 px-3 text-xs shrink-0"
                          onClick={() => handleToggleAlerts(asset)}
                          disabled={busyAlertId === asset.id_asset}
                        >
                          {busyAlertId === asset.id_asset ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : asset.alerte ? (
                            "Désactiver"
                          ) : (
                            "Activer"
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {supportsTicker(investment.id_invest) && (
            <Card className="border border-dashed border-white/30 bg-white/10 shadow-none">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Plus className="w-4 h-4 text-primary" />
                  Ajouter un actif
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={newAssetName}
                    onChange={(e) => setNewAssetName(e.target.value)}
                    placeholder="Nom de l'actif (ex : Bitcoin)"
                    className="h-9"
                  />
                  <Input
                    value={newAssetSymbol}
                    onChange={(e) => setNewAssetSymbol(e.target.value)}
                    placeholder="Ticker (ex : BTCUSD)"
                    className="h-9 sm:w-44 font-mono uppercase"
                  />
                  <Button
                    onClick={handleAddAsset}
                    disabled={addingAsset}
                    className="h-9 shrink-0 gap-2"
                  >
                    {addingAsset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Ajouter
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  L'actif sera rattaché à cette allocation et à votre compte.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {affiliates.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Plateformes recommandées</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {affiliates.map((affiliate) => (
                <Card key={affiliate.id_affiliate} className="glassmorphism border-none hover:bg-secondary/20 transition-colors">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                        <span className="font-bold">{affiliate.name_affiliate}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50">
                        ✓ Recommandé
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {affiliate.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      {affiliate.click_count || 0} clic{(affiliate.click_count || 0) > 1 ? "s" : ""}
                    </p>
                    <Button 
                      className="w-full gap-2" 
                      onClick={() => handleAffiliateClick(affiliate)}
                    >
                      S'inscrire <ExternalLink className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetDetailPage;
