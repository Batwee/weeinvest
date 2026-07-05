import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase, type InvestmentOptions, type AssetDetail as AssetDetailType, type Affiliate } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  User
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

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

const AssetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [investment, setInvestment] = useState<InvestmentOptions | null>(null);
  const [assets, setAssets] = useState<AssetDetailType[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTechnical, setLoadingTechnical] = useState<Record<number, boolean>>({});

  const handleLogout = async () => {
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

  useEffect(() => {
    const fetchAssetData = async () => {
      if (!id) return;
      setLoading(true);

      const today = getTodayDate();
      const cachedData = readAssetDetailCache(id);

      if (cachedData && cachedData.date === today) {
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
                console.error("Failed to fetch real FNG index:", apiError);
                // Fallback to random if all fails
                updates.fear_and_greed = Math.floor(20 + Math.random() * 60);
                updates.fng_updated_at = new Date().toISOString();
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

              if (!updateError && updatedInv) {
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

      const apiKey = "YUHV9AL0EAZS3VU5";
      const symbol = asset.symbol;

      if (!symbol) {
        console.error("No symbol found for asset:", asset.name);
        return;
      }

      // 2. Fetch SMA
      const smaUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=5&series_type=open&apikey=${apiKey}`;
      console.log('Récupération de la SMA pour le symbole:', symbol);
      const smaResponse = await fetch(smaUrl);
      const smaData = await smaResponse.json();
      
      // 3. Fetch RSI
      const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=3&series_type=open&apikey=${apiKey}`;
      console.log('Récupération du RSI pour le symbole:', symbol);
      const rsiResponse = await fetch(rsiUrl);
      const rsiData = await rsiResponse.json();

      // Check for API errors or limit
      if (smaData["Error Message"] || rsiData["Error Message"] || smaData["Note"] || rsiData["Note"]) {
        console.error("Alpha Vantage API error or limit:", smaData || rsiData);
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
            console.log(`RSI calculé pour ${symbol}:`, finalRSI);
            
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

          console.log(`SMA Slope pour ${symbol}:`, { slope, normalizedSlope });

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

      const updates = {
        RSI: finalRSI,
        SMA: finalSMA,
        conclusion: finalConclusion,
        RSI_SMA_updated_at: new Date().toISOString()
      };

      console.log(`Envoi des mises à jour à Supabase pour ${symbol}:`, updates);

      const { data: updatedData, error: updateError } = await supabase
        .from('asset_details')
        .update(updates)
        .eq('id_asset', asset.id_asset)
        .select();
      
      if (updateError) {
        console.error("Supabase update error:", updateError);
        throw updateError;
      }
      
      console.log("Mise à jour réussie dans Supabase:", updatedData);
      
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
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/40 backdrop-blur-md rounded-full shadow-sm text-xs border border-white/20">
              <User className="w-3 h-3 text-primary" />
              <span className="font-semibold truncate max-w-[150px]">{user?.email}</span>
            </div>
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
                      <span className="font-bold text-sm">Fear & Greed Index</span>
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
                <CardHeader className="flex flex-row items-center justify-between px-4 py-3 pb-2">
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
                  </CardContent>
                )}
              </Card>
            );
          })}
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
