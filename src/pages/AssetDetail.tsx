import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase, getApiKey, type InvestmentOptions, type AssetDetail as AssetDetailType, type Affiliate, type UserAssetPreference, type StockPosition } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Bell,
  BellOff,
  Upload,
  FileSpreadsheet,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserBadge } from "@/components/UserBadge";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { useAuth } from "@/hooks/useAuth";
import {
  isPushSupported,
  requestNotificationPermission,
  subscribeToPush,
} from "@/lib/push";

type AssetDetailCache = {
  version?: number;
  date: string;
  cachedAt?: string;
  investment: InvestmentOptions | null;
  assets: AssetDetailType[];
  affiliates: Affiliate[];
};

// V2 : les caches antérieurs ont pu être écrits avant que la session soit
// résolue (liste sans les actifs personnels). On les ignore pour forcer un
// rechargement propre.
const CACHE_VERSION = 2;

const getTodayDate = () => new Date().toISOString().split("T")[0];

const getAssetDetailCacheKey = (id: string) => `asset-detail-cache-${id}`;
const ANALYSIS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Le cache d'affichage (liste d'actifs, affiliés) est rechargé depuis la base
// toutes les 3 h au lieu de 24 h : lecture BD uniquement, sans impact sur le
// quota Alpha Vantage (RSI/SMA et indices restent actualisés au plus une fois
// par jour, indépendamment de ce délai).
const CACHE_FRESHNESS_MS = 3 * 60 * 60 * 1000;

// --- Positions boursières (onglet Bourse : investment_options.id_invest = 2) ---
const STOCK_INVEST_ID = 2;

const ACCOUNT_TYPES = ["PEA", "CTO"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];
type PositionFilter = "TOUS" | AccountType;

const POSITION_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;

// Valeur sentinelle du sélecteur d'entreprise : saisie manuelle (nom + ticker).
const MANUAL_ASSET_KEY = "__manual__";

// Un cours actualisé il y a moins d'une heure n'est pas redemandé : évite les
// appels redondants et protège le quota Alpha Vantage (25 requêtes/jour).
const PRICE_FRESHNESS_MS = 60 * 60 * 1000;
// Nombre maximum d'appels par clic sur « Actualiser les cours ».
const PRICE_REFRESH_MAX = 10;
// Alpha Vantage limite le tier gratuit à 1 requête/seconde.
const PRICE_THROTTLE_MS = 1200;

const formatAmount = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);

const formatDateTimeLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

const signedAmount = (value: number, currency: string) =>
  `${value >= 0 ? "+" : ""}${formatAmount(value, currency)}`;

const isCacheFresh = (cache: AssetDetailCache | null) => {
  if (!cache) return false;
  if (cache.version !== CACHE_VERSION) return false;

  if (cache.cachedAt) {
    const cachedTime = new Date(cache.cachedAt).getTime();
    if (!Number.isNaN(cachedTime)) {
      return Date.now() - cachedTime < CACHE_FRESHNESS_MS;
    }
  }

  // Ancien format de cache (sans horodatage) : on retombe sur la date du jour.
  return cache.date === getTodayDate();
};

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

  // Une source F&G est configurée mais la valeur manque : le cache a été écrit
  // avant la configuration, il faut retenter plutôt que de garder la carte vide.
  if (investment.lien_fng && investment.fear_and_greed == null) return true;

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

// Libellé du bouton d'ajout, adapté à la nature de l'actif de l'allocation.
const ADD_ASSET_LABELS: Record<number, string> = {
  1: "Ajouter une crypto",
  2: "Ajouter une action",
  5: "Ajouter un métal",
};

const getAddAssetLabel = (idInvest?: number) =>
  ADD_ASSET_LABELS[Number(idInvest)] ?? "Ajouter un actif";

// Actifs visibles dans la watchlist : ceux de base (id_user NULL) et ceux de
// l'utilisateur connecté, en excluant les entreprises simplement référencées
// par une position (is_followed = false). Les actifs des autres comptes sont exclus.
const filterVisibleAssets = (list: AssetDetailType[], userId?: string) =>
  list.filter(
    (asset) => asset.is_followed !== false && (!asset.id_user || asset.id_user === userId)
  );

// Préférence d'affichage des actifs de base (id_user NULL). Persistée en base
// dans public.user_asset_preferences, une ligne par couple (utilisateur, type
// d'allocation). Valeur par défaut si aucune ligne : affichés (débutants).
const isBaseAsset = (asset: AssetDetailType) => !asset.id_user;

// Analyse un CSV à deux colonnes (Nom, Symbol/Ticker). Séparateur « , » ou « ; ».
// La ligne d'en-tête éventuelle est ignorée, les lignes vides sont écartées.
const parseCsvRows = (text: string): { name: string; symbol: string }[] => {
  const rows: { name: string; symbol: string }[] = [];

  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .forEach((line) => {
      const separator = line.includes(";") && !line.includes(",") ? ";" : ",";
      const cells = line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, "").trim());
      const name = cells[0] ?? "";
      const symbol = (cells[1] ?? "").toUpperCase();

      if (!name || !symbol) return;
      // En-tête du type « Nom,Ticker »
      if (
        rows.length === 0 &&
        /^(nom|name)$/i.test(name) &&
        /^(symbol|symbole|ticker|sym)$/i.test(symbol)
      ) {
        return;
      }

      rows.push({ name, symbol });
    });

  return rows;
};

const AssetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<AssetDetailType | null>(null);
  const [showBaseAssets, setShowBaseAssets] = useState(true);
  const [csvRows, setCsvRows] = useState<{ name: string; symbol: string }[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [importing, setImporting] = useState(false);
  // Positions détenues (onglet Bourse uniquement)
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("TOUS");
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<number | null>(null);
  const [positionForm, setPositionForm] = useState({
    assetKey: "",
    manualName: "",
    manualSymbol: "",
    accountType: "PEA" as AccountType,
    quantity: "",
    avgPrice: "",
    currency: "EUR",
    exchange: "",
  });
  const [savingPosition, setSavingPosition] = useState(false);
  const [positionToDelete, setPositionToDelete] = useState<StockPosition | null>(null);
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  const resetAddForm = () => {
    setNewAssetName("");
    setNewAssetSymbol("");
    setCsvRows([]);
    setCsvFileName("");
    setAddDialogOpen(false);
  };

  const updateCache = (
    nextInvestment: InvestmentOptions | null = investment,
    nextAssets: AssetDetailType[] = assets,
    nextAffiliates: Affiliate[] = affiliates
  ) => {
    if (!id) return;

    writeAssetDetailCache(id, {
      version: CACHE_VERSION,
      date: getTodayDate(),
      cachedAt: new Date().toISOString(),
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
      resetAddForm();
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

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = parseCsvRows(await file.text());
      setCsvRows(parsed);
      setCsvFileName(file.name);

      if (parsed.length === 0) {
        toast({
          variant: "destructive",
          title: "Aucune ligne valide",
          description: "Le fichier doit contenir deux colonnes : Nom puis Ticker.",
        });
      }
    } catch (err) {
      console.error("Failed to read CSV:", err);
      toast({
        variant: "destructive",
        title: "Lecture impossible",
        description: "Le fichier CSV n'a pas pu être lu.",
      });
    } finally {
      // Permet de relire le même fichier après correction
      event.target.value = "";
    }
  };

  const handleImportCsv = async () => {
    if (!user || !id) return;

    if (csvRows.length === 0) {
      toast({
        variant: "destructive",
        title: "Aucun actif à importer",
        description: "Sélectionnez d'abord un fichier CSV valide.",
      });
      return;
    }

    setImporting(true);
    try {
      const payload = csvRows.map((row) => ({
        name_asset: row.name,
        symbol: row.symbol,
        id_invest: Number(id),
        id_user: user.id,
      }));

      const { data, error } = await supabase.from("asset_details").insert(payload).select();
      if (error) throw error;

      const inserted = (data ?? []) as AssetDetailType[];
      const nextAssets = [...assets, ...inserted].sort(
        (a, b) => (b.market_cap || 0) - (a.market_cap || 0)
      );
      setAssets(nextAssets);
      updateCache(investment, nextAssets, affiliates);
      resetAddForm();
      toast({ title: `${inserted.length} actif(s) importé(s)`, duration: 2500 });
    } catch (err) {
      console.error("Failed to import CSV:", err);
      toast({
        variant: "destructive",
        title: "Import impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setImporting(false);
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
              description: "Une notification sera envoyée au franchissement des seuils 40 / 65.",
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
      // Attendre que la session soit résolue : sinon `user` est null et le
      // filtre des actifs exclut à tort les actifs personnels, puis ce
      // résultat tronqué est mis en cache.
      if (authLoading) return;
      setLoading(true);

      const today = getTodayDate();
      const cachedData = readAssetDetailCache(id);

      if (isCacheFresh(cachedData) && !needsIndexRefresh(cachedData?.investment)) {
        setInvestment(cachedData.investment);
        setAssets(filterVisibleAssets(cachedData.assets, user?.id));
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
          ? [...filterVisibleAssets(assetsData, user?.id)].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
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
          version: CACHE_VERSION,
          date: today,
          cachedAt: new Date().toISOString(),
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
  }, [id, user?.id, authLoading]);

  // Charge la préférence d'affichage des actifs de base pour ce type d'allocation.
  // Aucune ligne trouvée : on conserve la valeur par défaut (affichés).
  useEffect(() => {
    const fetchDisplayPreference = async () => {
      if (!user || !id) return;

      const { data, error } = await supabase
        .from("user_asset_preferences")
        .select("show_base_assets")
        .eq("id_user", user.id)
        .eq("id_invest", Number(id))
        .maybeSingle();

      if (error) {
        console.error("Failed to load asset display preference:", error);
        return;
      }

      const preference = data as UserAssetPreference | null;
      if (preference) setShowBaseAssets(preference.show_base_assets);
    };

    fetchDisplayPreference();
  }, [id, user?.id]);

  // Charge les positions détenues : uniquement sur l'onglet Bourse.
  useEffect(() => {
    const fetchPositions = async () => {
      if (!user || !id || Number(id) !== STOCK_INVEST_ID) return;

      setPositionsLoading(true);
      const { data, error } = await supabase
        .from("stock_positions")
        .select("*, asset_details(*)")
        .eq("id_user", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load positions:", error);
      } else {
        setPositions((data ?? []) as StockPosition[]);
      }
      setPositionsLoading(false);
    };

    fetchPositions();
  }, [id, user?.id]);

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
        navigate("/compte");
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
      const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=weekly&time_period=10&series_type=open&apikey=${apiKey}`;
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

      // RSI : on retient la dernière valeur hebdomadaire publiée (période 10),
      // identique à l'appel API de référence, sans moyenne sur plusieurs semaines.
      if (rsiData['Technical Analysis: RSI']) {
        const rsiEntries = rsiData['Technical Analysis: RSI'];
        // Alpha Vantage renvoie les dates de la plus récente à la plus ancienne.
        const latestDate = Object.keys(rsiEntries)[0];

        if (latestDate) {
          const latestRSI = Number(rsiEntries[latestDate].RSI);

          if (!isNaN(latestRSI)) {
              finalRSI = parseFloat(latestRSI.toFixed(2));
              
              if (finalRSI < 40) {
                finalConclusion = "Achat fort conseillé";
              } else if (finalRSI > 65) {
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

  const toggleBaseAssets = async () => {
    if (!user || !id) return;

    const next = !showBaseAssets;
    // Mise à jour optimiste : la bascule est appliquée immédiatement.
    setShowBaseAssets(next);

    const { error } = await supabase
      .from("user_asset_preferences")
      .upsert(
        {
          id_user: user.id,
          id_invest: Number(id),
          show_base_assets: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id_user,id_invest" }
      );

    if (error) {
      console.error("Failed to save asset display preference:", error);
      setShowBaseAssets(!next); // annule la bascule en cas d'échec
      toast({
        variant: "destructive",
        title: "Préférence non enregistrée",
        description: error.message,
      });
    }
  };

  // --- Positions détenues -----------------------------------------------------

  const resetPositionForm = () => {
    setPositionForm({
      assetKey: "",
      manualName: "",
      manualSymbol: "",
      accountType: "PEA",
      quantity: "",
      avgPrice: "",
      currency: "EUR",
      exchange: "",
    });
    setEditingPositionId(null);
    setPositionDialogOpen(false);
  };

  const openAddPosition = () => {
    resetPositionForm();
    setPositionDialogOpen(true);
  };

  const openEditPosition = (position: StockPosition) => {
    setEditingPositionId(position.id_position);
    setPositionForm({
      assetKey: String(position.id_asset),
      manualName: "",
      manualSymbol: "",
      accountType: position.account_type,
      quantity: String(position.quantity),
      avgPrice: String(position.avg_price),
      currency: position.currency || "EUR",
      exchange: position.exchange || "",
    });
    setPositionDialogOpen(true);
  };

  // Réutilise une entreprise du référentiel (suivie ou déjà créée par une
  // position) plutôt que de créer un doublon.
  const findExistingAsset = async (symbol: string): Promise<AssetDetailType | null> => {
    if (!user) return null;
    const normalized = symbol.trim().toUpperCase();
    const inState = assets.find((a) => (a.symbol || "").toUpperCase() === normalized);
    if (inState) return inState;

    const { data, error } = await supabase
      .from("asset_details")
      .select("*")
      .eq("id_user", user.id)
      .eq("id_invest", STOCK_INVEST_ID)
      .ilike("symbol", normalized)
      .limit(1);

    if (error) {
      console.error("Failed to look up asset:", error);
      return null;
    }
    return (data?.[0] as AssetDetailType) ?? null;
  };

  const handleSavePosition = async () => {
    if (!user || !id) return;

    const quantity = Number(positionForm.quantity.replace(",", "."));
    const avgPrice = Number(positionForm.avgPrice.replace(",", "."));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Quantité invalide",
        description: "Saisissez un nombre d'actions supérieur à 0.",
      });
      return;
    }
    if (!Number.isFinite(avgPrice) || avgPrice < 0) {
      toast({
        variant: "destructive",
        title: "Prix moyen invalide",
        description: "Saisissez un prix moyen d'achat positif.",
      });
      return;
    }

    setSavingPosition(true);
    try {
      // 1. Entreprise référencée (asset_details)
      let idAsset: number | null = null;
      const isManual = !editingPositionId && positionForm.assetKey === MANUAL_ASSET_KEY;

      if (isManual) {
        const name = positionForm.manualName.trim();
        const symbol = positionForm.manualSymbol.trim().toUpperCase();

        if (!name || !symbol) {
          toast({
            variant: "destructive",
            title: "Champs requis",
            description: "Renseignez le nom et le ticker de l'entreprise.",
          });
          return;
        }

        const existing = await findExistingAsset(symbol);
        if (existing) {
          idAsset = existing.id_asset;
        } else {
          const { data, error } = await supabase
            .from("asset_details")
            .insert({
              name_asset: name,
              symbol,
              id_invest: STOCK_INVEST_ID,
              id_user: user.id,
              // Détenir une entreprise ne l'ajoute pas à la watchlist.
              is_followed: false,
            })
            .select()
            .single();

          if (error) throw error;
          idAsset = (data as AssetDetailType).id_asset;
        }
      } else {
        idAsset = Number(positionForm.assetKey);
      }

      if (!idAsset || Number.isNaN(idAsset)) {
        toast({
          variant: "destructive",
          title: "Entreprise requise",
          description: "Sélectionnez une entreprise ou saisissez son nom et son ticker.",
        });
        return;
      }

      // 2. Anti-doublon : une seule position par (entreprise, compte)
      const duplicate = positions.find(
        (p) =>
          p.id_asset === idAsset &&
          p.account_type === positionForm.accountType &&
          p.id_position !== editingPositionId
      );
      if (duplicate) {
        toast({
          variant: "destructive",
          title: "Position déjà existante",
          description: `Cette entreprise est déjà détenue sur ce compte (${positionForm.accountType}).`,
        });
        return;
      }

      const payload = {
        id_user: user.id,
        id_asset: idAsset,
        account_type: positionForm.accountType,
        quantity,
        avg_price: avgPrice,
        currency: positionForm.currency,
        exchange: positionForm.exchange.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingPositionId) {
        const { data, error } = await supabase
          .from("stock_positions")
          .update(payload)
          .eq("id_position", editingPositionId)
          .select("*, asset_details(*)")
          .single();

        if (error) throw error;
        setPositions((prev) =>
          prev.map((p) => (p.id_position === editingPositionId ? (data as StockPosition) : p))
        );
        toast({ title: "Position mise à jour", duration: 2000 });
      } else {
        const { data, error } = await supabase
          .from("stock_positions")
          .insert(payload)
          .select("*, asset_details(*)")
          .single();

        if (error) throw error;
        setPositions((prev) => [...prev, data as StockPosition]);
        toast({ title: "Position ajoutée", duration: 2000 });
      }

      resetPositionForm();
    } catch (err) {
      console.error("Failed to save position:", err);
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    } finally {
      setSavingPosition(false);
    }
  };

  const handleDeletePosition = async (position: StockPosition) => {
    try {
      const { error } = await supabase
        .from("stock_positions")
        .delete()
        .eq("id_position", position.id_position);

      if (error) throw error;
      setPositions((prev) => prev.filter((p) => p.id_position !== position.id_position));
      toast({ title: "Position supprimée", duration: 2000 });
    } catch (err) {
      console.error("Failed to delete position:", err);
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
      });
    }
  };

  // Actualisation des cours : un appel GLOBAL_QUOTE par entreprise détenue,
  // throttlé et plafonné. En cas d'échec, le dernier cours connu est conservé.
  const handleRefreshPrices = async () => {
    // Un même titre peut être détenu sur plusieurs comptes : un seul appel.
    const stale = Array.from(new Map(positions.map((p) => [p.id_asset, p])).values()).filter((p) => {
      const updatedAt = p.asset_details?.price_updated_at;
      if (p.asset_details?.price == null || !updatedAt) return true;
      const time = new Date(updatedAt).getTime();
      return Number.isNaN(time) || Date.now() - time >= PRICE_FRESHNESS_MS;
    });

    if (stale.length === 0) {
      toast({
        title: "Cours déjà à jour",
        description: "Aucun appel API nécessaire pour l'instant.",
        duration: 2500,
      });
      return;
    }

    const apiKey = await getApiKey("alphavantage");
    if (!apiKey) {
      toast({
        variant: "destructive",
        title: "Clé API requise",
        description: "Ajoutez votre clé Alpha Vantage pour actualiser les cours.",
      });
      navigate("/compte");
      return;
    }

    const targets = stale.slice(0, PRICE_REFRESH_MAX);
    setRefreshingPrices(true);

    const priceUpdates = new Map<number, { price: number; price_updated_at: string }>();
    let failed = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const symbol = target.asset_details?.symbol;
        if (!symbol) {
          failed += 1;
          continue;
        }

        if (i > 0) await new Promise((resolve) => setTimeout(resolve, PRICE_THROTTLE_MS));

        try {
          const response = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
          );
          const data = await response.json();

          const limitMessage = data["Information"] || data["Note"];
          if (limitMessage) {
            console.error("Alpha Vantage quota/limit:", limitMessage);
            toast({
              variant: "destructive",
              title: "Quota Alpha Vantage atteint",
              description: "Limite gratuite : 25 requêtes par jour. Réessayez plus tard.",
            });
            break;
          }

          if (data["Error Message"]) {
            console.error("Alpha Vantage API error:", data["Error Message"]);
            failed += 1;
            continue;
          }

          const price = Number(data["Global Quote"]?.["05. price"]);
          if (!Number.isFinite(price) || price <= 0) {
            // Aucun cours exploitable : le dernier cours connu est conservé.
            failed += 1;
            continue;
          }

          const priceUpdatedAt = new Date().toISOString();
          const { error } = await supabase
            .from("asset_details")
            .update({ price, price_updated_at: priceUpdatedAt })
            .eq("id_asset", target.id_asset);

          if (error) {
            console.error("Failed to store price:", error);
            failed += 1;
            continue;
          }

          priceUpdates.set(target.id_asset, { price, price_updated_at: priceUpdatedAt });
        } catch (err) {
          // Réseau indisponible : le dernier cours connu est conservé.
          console.error("Price refresh failed:", err);
          failed += 1;
        }
      }

      if (priceUpdates.size > 0) {
        setPositions((prev) =>
          prev.map((p) => {
            const update = priceUpdates.get(p.id_asset);
            return update && p.asset_details
              ? { ...p, asset_details: { ...p.asset_details, ...update } }
              : p;
          })
        );
        // Le référentiel est partagé avec la watchlist : on répercute le cours.
        setAssets((prev) =>
          prev.map((a) => {
            const update = priceUpdates.get(a.id_asset);
            return update ? { ...a, ...update } : a;
          })
        );
      }

      const remaining = Math.max(0, stale.length - targets.length);
      const details = [
        failed > 0 ? `${failed} échec(s) — dernier cours connu conservé` : "",
        remaining > 0 ? `${remaining} titre(s) restant(s) : relancez l'actualisation` : "",
      ].filter(Boolean);

      toast({
        title: priceUpdates.size > 0 ? `${priceUpdates.size} cours mis à jour` : "Aucun cours mis à jour",
        description: details.length > 0 ? details.join(" · ") : undefined,
        duration: 3000,
      });
    } finally {
      setRefreshingPrices(false);
    }
  };

  const hasBaseAssets = assets.some(isBaseAsset);
  // Les actifs de base restent chargés en mémoire ; seul l'affichage est filtré
  // afin que la bascule soit instantanée, sans rechargement.
  const displayedAssets = showBaseAssets ? assets : assets.filter((asset) => !isBaseAsset(asset));

  // investment peut être null pendant le chargement : accès optionnel obligatoire
  // sinon la page plante avant les retours anticipés (écran blanc).
  const addAssetLabel = getAddAssetLabel(investment?.id_invest);

  const isSavings = investment?.name_invest?.toLowerCase().includes("epargne") || investment?.name_invest?.toLowerCase().includes("livret");

  // Positions détenues : section réservée à l'onglet Bourse.
  const isBourse = Number(investment?.id_invest) === STOCK_INVEST_ID;
  const displayedPositions =
    positionFilter === "TOUS" ? positions : positions.filter((p) => p.account_type === positionFilter);

  // Totaux par devise : aucune conversion n'est appliquée, des montants en
  // devises différentes ne sont jamais additionnés ensemble.
  const positionTotals = (() => {
    const map = new Map<string, { value: number; cost: number; count: number; missing: number }>();

    displayedPositions.forEach((p) => {
      const currency = p.currency || "EUR";
      const entry = map.get(currency) ?? { value: 0, cost: 0, count: 0, missing: 0 };
      const price = p.asset_details?.price;

      entry.cost += Number(p.quantity) * Number(p.avg_price);
      if (price == null) {
        entry.missing += 1;
      } else {
        entry.value += Number(p.quantity) * Number(price);
      }
      entry.count += 1;
      map.set(currency, entry);
    });

    return Array.from(map.entries());
  })();

  const priceTimestamps = positions
    .map((p) => p.asset_details?.price_updated_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  const lastPriceUpdate = priceTimestamps.length > 0 ? priceTimestamps[priceTimestamps.length - 1] : undefined;

  // Entreprises proposées dans le sélecteur : la watchlist, plus l'entreprise
  // de la position éditée si celle-ci n'y figure pas (position sans suivi).
  const positionAssetOptions = (() => {
    if (editingPositionId === null) return assets;
    const current = positions.find((p) => p.id_position === editingPositionId);
    if (!current?.asset_details || assets.some((a) => a.id_asset === current.id_asset)) {
      return assets;
    }
    return [current.asset_details, ...assets];
  })();

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
          <UserBadge compact={false} />
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
                      <span className="font-bold text-sm">{investment.name_invest} Fear &amp; Greed Index</span>
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
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground truncate">
                      {investment.fng_name ?? ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Mis à jour le {investment.fng_updated_at ? new Date(investment.fng_updated_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
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

        {isBourse && (
          <PortfolioDashboard positions={positions} />
        )}

        {isBourse && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Mes positions</h2>
                <Badge variant="outline" className="text-[10px]">{positions.length}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <div className="flex rounded-full border border-white/20 bg-white/40 p-0.5">
                  {(["TOUS", "PEA", "CTO"] as PositionFilter[]).map((filterValue) => (
                    <button
                      key={filterValue}
                      type="button"
                      onClick={() => setPositionFilter(filterValue)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        positionFilter === filterValue
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {filterValue === "TOUS" ? "Tous" : filterValue}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  onClick={handleRefreshPrices}
                  disabled={refreshingPrices || positions.length === 0}
                  title="Actualiser les cours (source Alpha Vantage)"
                  className="h-8 gap-1.5 rounded-full border border-white/20 bg-white/40 px-3 text-xs font-medium text-primary shadow-sm hover:bg-white/60"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshingPrices ? "animate-spin" : ""}`} />
                  Actualiser
                </Button>
                <Button
                  variant="ghost"
                  onClick={openAddPosition}
                  className="h-8 gap-1.5 rounded-full border border-white/20 bg-white/40 px-3 text-xs font-medium text-primary shadow-sm hover:bg-white/60"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une position
                </Button>
              </div>
            </div>

            <p className="px-1 text-[10px] text-muted-foreground">
              Cours récupérés à la demande via Alpha Vantage (25 requêtes/jour).
              {lastPriceUpdate
                ? ` Dernière actualisation : ${formatDateTimeLabel(lastPriceUpdate)}.`
                : " Aucun cours enregistré pour l'instant."}
            </p>

            {positionsLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}

            {!positionsLoading && positions.length === 0 && (
              <Card className="glassmorphism border-none">
                <CardContent className="space-y-1 py-6 text-center">
                  <p className="text-sm text-muted-foreground">Aucune position enregistrée.</p>
                  <p className="text-xs text-muted-foreground">
                    Ajoutez vos lignes PEA / CTO pour suivre vos plus-values latentes.
                  </p>
                </CardContent>
              </Card>
            )}

            {!positionsLoading && positions.length > 0 && displayedPositions.length === 0 && (
              <p className="px-1 text-sm text-muted-foreground">Aucune position sur ce compte.</p>
            )}

            {positionTotals.map(([currency, total]) => {
              const gain = total.value - total.cost;
              const isPositive = gain >= 0;

              return (
                <Card key={currency} className="glassmorphism border-none">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">{currency}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {total.count} position{total.count > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {total.missing === 0 ? formatAmount(total.value, currency) : "—"}
                        </p>
                        {total.missing === 0 ? (
                          <p className={`text-xs font-semibold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                            {signedAmount(gain, currency)}
                            {total.cost > 0
                              ? ` (${isPositive ? "+" : ""}${((total.value / total.cost - 1) * 100).toFixed(2)} %)`
                              : ""}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            Cours manquant pour {total.missing} titre{total.missing > 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Prix de revient : {formatAmount(total.cost, currency)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            {displayedPositions.map((position) => {
              const asset = position.asset_details;
              const currency = position.currency || "EUR";
              const quantity = Number(position.quantity);
              const avgPrice = Number(position.avg_price);
              const cost = quantity * avgPrice;
              const price = asset?.price;
              const hasPrice = price != null;
              const currentValue = hasPrice ? quantity * Number(price) : null;
              const gain = currentValue != null ? currentValue - cost : null;
              const gainPercent =
                currentValue != null && avgPrice > 0 ? (Number(price) / avgPrice - 1) * 100 : null;
              const isPositive = (gain ?? 0) >= 0;

              return (
                <Card key={position.id_position} className="glassmorphism border-none overflow-hidden group">
                  <CardContent className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">
                            {asset?.name_asset || asset?.name || "Entreprise"}
                          </span>
                          {asset?.symbol && (
                            <Badge variant="outline" className="font-mono text-[10px]">{asset.symbol}</Badge>
                          )}
                          <Badge
                            variant={position.account_type === "PEA" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {position.account_type}
                          </Badge>
                          {position.exchange && (
                            <span className="text-[10px] text-muted-foreground">{position.exchange}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Cours {hasPrice ? formatAmount(Number(price), currency) : "non disponible"}
                          {" · "}
                          {formatDateTimeLabel(asset?.price_updated_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Modifier la position"
                          onClick={() => openEditPosition(position)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Supprimer la position"
                          onClick={() => setPositionToDelete(position)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground">Quantité</p>
                        <p className="font-medium">{formatQuantity(quantity)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground">Prix moyen</p>
                        <p className="font-medium">{formatAmount(avgPrice, currency)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground">Prix de revient</p>
                        <p className="font-medium">{formatAmount(cost, currency)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground">Valeur actuelle</p>
                        <p className="font-medium">
                          {currentValue != null ? formatAmount(currentValue, currency) : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <span className="text-[10px] text-muted-foreground">Plus-value latente</span>
                      {gain != null && gainPercent != null ? (
                        <span
                          className={`flex items-center gap-1 text-sm font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}
                        >
                          {isPositive
                            ? <TrendingUp className="h-4 w-4" />
                            : <TrendingDown className="h-4 w-4" />}
                          {signedAmount(gain, currency)}
                          <span className="text-xs">
                            ({isPositive ? "+" : ""}{gainPercent.toFixed(2)} %)
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Cours indisponible — actualisez les cours
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{isSavings ? "Supports d'épargne" : "Composants de l'allocation"}</h2>
            <div className="flex items-center gap-1">
              {hasBaseAssets && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleBaseAssets}
                  title={showBaseAssets ? "Masquer les actifs de base" : "Afficher les actifs de base"}
                  className="h-8 w-8 rounded-full bg-white/40 hover:bg-white/60 shadow-sm border border-white/20 shrink-0"
                >
                  {showBaseAssets
                    ? <Eye className="w-4 h-4 text-primary" />
                    : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                </Button>
              )}
              {supportsTicker(investment.id_invest) && (
                <Button
                  variant="ghost"
                  onClick={() => setAddDialogOpen(true)}
                  title={addAssetLabel}
                  className="h-8 gap-1.5 px-3 rounded-full bg-white/40 hover:bg-white/60 shadow-sm border border-white/20 shrink-0 text-xs font-medium text-primary"
                >
                  <Plus className="w-4 h-4" />
                  {addAssetLabel}
                </Button>
              )}
            </div>
          </div>
          {assets.length > 0 && displayedAssets.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">
              Les actifs de base sont masqués. Utilisez l'icône œil pour les réafficher.
            </p>
          )}
          {displayedAssets.map((asset) => {
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
                              onClick={() => setAssetToDelete(asset)}
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
                          {asset.RSI !== null && asset.RSI !== undefined && asset.RSI < 40 && <TrendingUp className="w-4 h-4 text-green-500" />}
                          {asset.RSI !== null && asset.RSI !== undefined && asset.RSI > 65 && <TrendingDown className="w-4 h-4 text-red-500" />}
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
                            Alertes RSI Weekly (seuils 40 / 65)
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

      <Dialog open={addDialogOpen} onOpenChange={(open) => (open ? setAddDialogOpen(true) : resetAddForm())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un actif</DialogTitle>
            <DialogDescription>
              L'actif sera rattaché à cette allocation et à votre compte.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="manuel" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manuel">Ajout manuel</TabsTrigger>
              <TabsTrigger value="csv">Import CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="manuel" className="space-y-3 pt-3">
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
                className="h-9 font-mono uppercase"
              />
              <Button
                onClick={handleAddAsset}
                disabled={addingAsset}
                className="w-full gap-2"
              >
                {addingAsset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Ajouter
              </Button>
            </TabsContent>

            <TabsContent value="csv" className="space-y-3 pt-3">
              <div className="rounded-lg border border-white/20 bg-white/30 p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  Format attendu
                </div>
                <p>Fichier CSV à deux colonnes : Nom puis Ticker.</p>
                <p className="font-mono text-[11px]">Bitcoin,BTCUSD</p>
                <p className="font-mono text-[11px]">Or,XAUUSD</p>
              </div>

              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFile}
                className="h-9 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-primary"
              />

              {csvFileName && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Upload className="w-3.5 h-3.5" />
                  <span className="truncate">{csvFileName}</span>
                  <span className="ml-auto shrink-0 font-medium text-foreground">
                    {csvRows.length} ligne(s)
                  </span>
                </div>
              )}

              {csvRows.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-white/20 bg-white/20 divide-y divide-white/10">
                  {csvRows.map((row, index) => (
                    <div key={`${row.symbol}-${index}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                      <span className="truncate">{row.name}</span>
                      <span className="shrink-0 font-mono text-primary">{row.symbol}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleImportCsv}
                disabled={importing || csvRows.length === 0}
                className="w-full gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importer {csvRows.length > 0 ? `(${csvRows.length})` : ""}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={assetToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setAssetToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet actif ?</AlertDialogTitle>
            <AlertDialogDescription>
              {assetToDelete
                ? `« ${assetToDelete.name_asset || assetToDelete.name} » sera définitivement retiré de cette allocation. Cette action est irréversible.`
                : "Cet actif sera définitivement retiré de cette allocation. Cette action est irréversible."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (assetToDelete) handleDeleteAsset(assetToDelete);
                setAssetToDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={positionDialogOpen}
        onOpenChange={(open) => {
          if (open) setPositionDialogOpen(true);
          else resetPositionForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPositionId ? "Modifier la position" : "Ajouter une position"}</DialogTitle>
            <DialogDescription>
              Compte, quantité et prix moyen. Détenir une entreprise ne l'ajoute pas à votre watchlist.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Entreprise</span>
              <Select
                value={positionForm.assetKey}
                onValueChange={(value) => setPositionForm((prev) => ({ ...prev, assetKey: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sélectionner une entreprise" />
                </SelectTrigger>
                <SelectContent>
                  {positionAssetOptions.map((asset) => (
                    <SelectItem key={asset.id_asset} value={String(asset.id_asset)}>
                      {asset.name_asset || asset.name || asset.symbol}
                      {asset.symbol ? ` (${asset.symbol})` : ""}
                    </SelectItem>
                  ))}
                  {editingPositionId === null && (
                    <SelectItem value={MANUAL_ASSET_KEY}>Nouvelle entreprise (saisie manuelle)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {positionForm.assetKey === MANUAL_ASSET_KEY && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Nom</span>
                  <Input
                    value={positionForm.manualName}
                    onChange={(e) => setPositionForm((prev) => ({ ...prev, manualName: e.target.value }))}
                    placeholder="Ex : Apple"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Ticker</span>
                  <Input
                    value={positionForm.manualSymbol}
                    onChange={(e) => setPositionForm((prev) => ({ ...prev, manualSymbol: e.target.value }))}
                    placeholder="Ex : AAPL"
                    className="h-9 font-mono uppercase"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Compte</span>
              <div className="flex rounded-full border border-white/20 bg-white/40 p-0.5">
                {ACCOUNT_TYPES.map((accountType) => (
                  <button
                    key={accountType}
                    type="button"
                    onClick={() => setPositionForm((prev) => ({ ...prev, accountType }))}
                    className={`flex-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      positionForm.accountType === accountType
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {accountType}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Quantité</span>
                <Input
                  value={positionForm.quantity}
                  onChange={(e) => setPositionForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Ex : 10"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Prix moyen</span>
                <Input
                  value={positionForm.avgPrice}
                  onChange={(e) => setPositionForm((prev) => ({ ...prev, avgPrice: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Ex : 145,30"
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Devise</span>
                <Select
                  value={positionForm.currency}
                  onValueChange={(value) => setPositionForm((prev) => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Place (optionnel)</span>
                <Input
                  value={positionForm.exchange}
                  onChange={(e) => setPositionForm((prev) => ({ ...prev, exchange: e.target.value }))}
                  placeholder="Ex : NASDAQ"
                  className="h-9"
                />
              </div>
            </div>

            <Button
              onClick={handleSavePosition}
              disabled={savingPosition}
              className="w-full gap-2"
            >
              {savingPosition
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : editingPositionId
                  ? <Check className="w-4 h-4" />
                  : <Plus className="w-4 h-4" />}
              {editingPositionId ? "Enregistrer" : "Ajouter la position"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={positionToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPositionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette position ?</AlertDialogTitle>
            <AlertDialogDescription>
              {positionToDelete
                ? `La position ${positionToDelete.account_type} sur « ${
                    positionToDelete.asset_details?.name_asset ||
                    positionToDelete.asset_details?.name ||
                    positionToDelete.asset_details?.symbol ||
                    "cette entreprise"
                  } » sera définitivement supprimée. L'entreprise reste dans le référentiel.`
                : "Cette position sera définitivement supprimée."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (positionToDelete) handleDeletePosition(positionToDelete);
                setPositionToDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AssetDetailPage;
