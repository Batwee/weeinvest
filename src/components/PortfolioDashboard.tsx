import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { supabase, type AccountType, type PortfolioSnapshot, type StockPosition } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer } from "@/components/ui/chart";

const ALL_ACCOUNTS = "TOUS" as const;
type AccountFilter = typeof ALL_ACCOUNTS | AccountType;

// Devise de consolidation du tableau de bord.
const BASE_CURRENCY = "EUR";

// Taux de référence BCE, sans clé API (n'entame pas le quota Alpha Vantage).
const FX_ENDPOINT = "https://api.frankfurter.app/latest";
const FX_SOURCE = "BCE (Frankfurter)";

type Period = "1S" | "1M" | "YTD" | "1A" | "MAX";
const PERIODS: { value: Period; label: string }[] = [
  { value: "1S", label: "1 S" },
  { value: "1M", label: "1 M" },
  { value: "YTD", label: "YTD" },
  { value: "1A", label: "1 A" },
  { value: "MAX", label: "Max" },
];

const DONUT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#84cc16", "#0ea5e9", "#f97316",
];

const formatMoney = (value: number, currency: string) => {
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

const formatCompactMoney = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
};

const formatRate = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);

const formatSigned = (value: number, currency: string) =>
  `${value >= 0 ? "+" : "−"}${formatMoney(Math.abs(value), currency)}`;

const formatSignedPercent = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} %`;

const formatDay = (date: string) =>
  format(parseISO(date), "d MMM", { locale: fr });

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Taux exprimés en EUR pour 1 unité de devise. EUR vaut toujours 1. */
type FxRates = { rates: Record<string, number>; date: string; source: string };

type AllocationDatum = {
  key: string;
  name: string;
  symbol?: string;
  value: number;
  percent: number;
};

export function PortfolioDashboard({ positions }: { positions: StockPosition[] }) {
  const { user } = useAuth();

  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>(ALL_ACCOUNTS);
  const [period, setPeriod] = useState<Period>("1M");
  const [chartMode, setChartMode] = useState<"value" | "perf">("value");
  const [activeSlice, setActiveSlice] = useState<number | null>(null);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [fxError, setFxError] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [showFx, setShowFx] = useState(false);

  const lastRecordedSignature = useRef("");

  const filteredPositions = useMemo(
    () =>
      accountFilter === ALL_ACCOUNTS
        ? positions
        : positions.filter((p) => p.account_type === accountFilter),
    [positions, accountFilter]
  );

  // --- Devise d'affichage : EUR consolidé, sauf vue CTO libellée à l'origine --
  const displayCurrency = useMemo(() => {
    if (accountFilter !== "CTO") return BASE_CURRENCY;
    const currencies = new Set(
      positions.filter((p) => p.account_type === "CTO").map((p) => p.currency || BASE_CURRENCY)
    );
    if (currencies.size === 1) return Array.from(currencies)[0];
    return BASE_CURRENCY;
  }, [positions, accountFilter]);

  // --- Devises étrangères à convertir (positions + historique enregistré) -----
  const foreignCurrencies = useMemo(() => {
    const set = new Set<string>();
    positions.forEach((p) => {
      const c = p.currency || BASE_CURRENCY;
      if (c !== BASE_CURRENCY) set.add(c);
    });
    snapshots.forEach((s) => {
      if (s.currency && s.currency !== BASE_CURRENCY) set.add(s.currency);
    });
    return Array.from(set).sort();
  }, [positions, snapshots]);

  // --- Chargement du taux de change (identifiable et daté) --------------------
  useEffect(() => {
    if (foreignCurrencies.length === 0) {
      setFx(null);
      setFxError(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setFxLoading(true);
      try {
        const res = await fetch(
          `${FX_ENDPOINT}?from=${BASE_CURRENCY}&to=${foreignCurrencies.join(",")}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
        if (cancelled) return;
        const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
        foreignCurrencies.forEach((c) => {
          const perEur = Number(json?.rates?.[c]);
          // L'API renvoie « 1 EUR = x DEV » : on stocke l'inverse (EUR par devise).
          rates[c] = Number.isFinite(perEur) && perEur > 0 ? 1 / perEur : NaN;
        });
        setFx({ rates, date: json?.date || todayIso(), source: FX_SOURCE });
        setFxError(false);
      } catch (error) {
        if (cancelled) return;
        console.error("Échec du chargement du taux de change:", error);
        setFx(null);
        setFxError(true);
      } finally {
        if (!cancelled) setFxLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [foreignCurrencies]);

  const eurRate = (currency: string): number | null => {
    if (currency === BASE_CURRENCY) return 1;
    const rate = fx?.rates?.[currency];
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  };

  /** Conversion explicite : renvoie null si un taux manque (jamais d'addition brute). */
  const convert = (value: number, from: string, to: string): number | null => {
    if (from === to) return value;
    const rateFrom = eurRate(from);
    const rateTo = eurRate(to);
    if (rateFrom == null || rateTo == null) return null;
    return (value * rateFrom) / rateTo;
  };

  // --- Carte unique : valorisation consolidée selon le filtre -----------------
  const summary = useMemo(() => {
    let value = 0;
    let cost = 0;
    let count = 0;
    let missingPrice = 0;
    let missingFx = 0;
    let converted = false;

    filteredPositions.forEach((p) => {
      count += 1;
      const from = p.currency || BASE_CURRENCY;
      if (from !== displayCurrency) converted = true;

      const factor = convert(1, from, displayCurrency);
      if (factor == null) {
        missingFx += 1;
        return;
      }

      cost += Number(p.quantity) * Number(p.avg_price) * factor;

      const price = p.asset_details?.price;
      if (price == null) {
        missingPrice += 1;
        return;
      }
      value += Number(p.quantity) * Number(price) * factor;
    });

    const gain = value - cost;
    return {
      currency: displayCurrency,
      value,
      cost,
      count,
      gain,
      gainPercent: cost > 0 ? (gain / cost) * 100 : 0,
      missingPrice,
      missingFx,
      converted,
      isComplete: missingPrice === 0 && missingFx === 0,
    };
  }, [filteredPositions, displayCurrency, fx]);

  // Devises réellement converties pour la sélection courante.
  const conversionCurrencies = useMemo(() => {
    const set = new Set<string>();
    filteredPositions.forEach((p) => {
      const c = p.currency || BASE_CURRENCY;
      if (c !== displayCurrency) set.add(c);
    });
    return Array.from(set).sort();
  }, [filteredPositions, displayCurrency]);

  // Répartition PEA / CTO (vue « Tous » uniquement), consolidée en EUR.
  const accountSplit = useMemo(() => {
    const totals: Record<AccountType, number> = { PEA: 0, CTO: 0 };
    positions.forEach((p) => {
      const price = p.asset_details?.price;
      if (price == null) return;
      const convertedValue = convert(Number(p.quantity) * Number(price), p.currency || BASE_CURRENCY, BASE_CURRENCY);
      if (convertedValue == null) return;
      totals[p.account_type] += convertedValue;
    });
    const sum = totals.PEA + totals.CTO;
    return {
      totals,
      sum,
      peaPercent: sum > 0 ? (totals.PEA / sum) * 100 : 0,
      ctoPercent: sum > 0 ? (totals.CTO / sum) * 100 : 0,
    };
  }, [positions, fx]);

  // --- PARTIE 2 : historique (snapshots réels, ajustés des apports) ----------
  const historyPoints = useMemo(() => {
    const byDate = new Map<string, { value: number; cost: number }>();
    snapshots
      .filter((s) => accountFilter === ALL_ACCOUNTS || s.account_type === accountFilter)
      .forEach((s) => {
        const value = convert(Number(s.market_value), s.currency, displayCurrency);
        const cost = convert(Number(s.cost_basis), s.currency, displayCurrency);
        if (value == null || cost == null) return;
        const entry = byDate.get(s.snapshot_date) ?? { value: 0, cost: 0 };
        entry.value += value;
        entry.cost += cost;
        byDate.set(s.snapshot_date, entry);
      });
    return Array.from(byDate.entries())
      .map(([date, entry]) => ({ date, ...entry }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [snapshots, accountFilter, displayCurrency, fx]);

  const firstSnapshotDate = historyPoints[0]?.date;

  const chartSeries = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    if (period === "1S") start = subDays(now, 7);
    else if (period === "1M") start = subMonths(now, 1);
    else if (period === "YTD") start = startOfYear(now);
    else if (period === "1A") start = subYears(now, 1);

    const windowed = start ? historyPoints.filter((p) => parseISO(p.date) >= start!) : historyPoints;

    // Performance ajustée des flux : on retire des variations la part liée aux
    // apports/retraits (approchés par la variation du prix de revient), de sorte
    // qu'un dépôt n'apparaisse jamais comme une performance.
    let index = 0;
    return windowed.map((point, i) => {
      if (i > 0) {
        const previous = windowed[i - 1];
        const flow = point.cost - previous.cost;
        const dailyReturn = previous.value > 0 ? (point.value - flow - previous.value) / previous.value : 0;
        index = (1 + index) * (1 + dailyReturn) - 1;
      }
      return { date: point.date, value: point.value, perf: index * 100 };
    });
  }, [historyPoints, period]);

  // Gain (€) et performance (%) de la période, corrigés des apports/retraits.
  const periodStats = useMemo(() => {
    if (chartSeries.length < 2) return null;
    const windowed = chartSeries;
    const firstPoint = historyPoints.find((p) => p.date === windowed[0].date)!;
    const lastPoint = historyPoints.find((p) => p.date === windowed[windowed.length - 1].date)!;
    const flows = lastPoint.cost - firstPoint.cost;
    const gain = lastPoint.value - firstPoint.value - flows;
    return {
      gain,
      perfPercent: windowed[windowed.length - 1].perf,
      valueStart: firstPoint.value,
      valueEnd: lastPoint.value,
      contributions: flows,
    };
  }, [chartSeries, historyPoints]);

  // --- PARTIE 3 : répartition par entreprise (valeur de marché) --------------
  const allocation = useMemo(() => {
    const map = new Map<string, { name: string; symbol?: string; value: number }>();
    filteredPositions.forEach((p) => {
      const price = p.asset_details?.price;
      if (price == null) return;
      const convertedValue = convert(Number(p.quantity) * Number(price), p.currency || BASE_CURRENCY, displayCurrency);
      if (convertedValue == null) return;
      const key = String(p.id_asset);
      const entry = map.get(key) ?? {
        name: p.asset_details?.name_asset || p.asset_details?.name || p.asset_details?.symbol || "Entreprise",
        symbol: p.asset_details?.symbol || undefined,
        value: 0,
      };
      entry.value += convertedValue;
      map.set(key, entry);
    });
    const rows = Array.from(map.entries())
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((acc, row) => acc + row.value, 0);
    return {
      total,
      data: rows.map<AllocationDatum>((row) => ({
        ...row,
        percent: total > 0 ? (row.value / total) * 100 : 0,
      })),
    };
  }, [filteredPositions, displayCurrency, fx]);

  // --- Chargement des snapshots ----------------------------------------------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoadingSnapshots(true);
      const { data, error } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("id_user", user.id)
        .order("snapshot_date", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("Failed to load portfolio snapshots:", error);
      } else {
        setSnapshots((data ?? []) as PortfolioSnapshot[]);
      }
      setLoadingSnapshots(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // --- Enregistrement de la photo du jour ------------------------------------
  // Conditionné : toutes les positions doivent avoir un cours, sinon la valeur
  // serait tronquée et fausserait l'historique. Une seule écriture par jour et
  // par (devise, compte), évitant tout appel redondant. Les devises d'origine
  // sont conservées telles quelles : la conversion n'intervient qu'à l'affichage.
  useEffect(() => {
    if (!user || positions.length === 0) return;
    if (!positions.every((p) => p.asset_details?.price != null)) return;

    const grouped = new Map<string, { currency: string; account_type: AccountType; market_value: number; cost_basis: number }>();
    positions.forEach((p) => {
      const c = p.currency || BASE_CURRENCY;
      const key = `${c}|${p.account_type}`;
      const entry = grouped.get(key) ?? { currency: c, account_type: p.account_type, market_value: 0, cost_basis: 0 };
      entry.cost_basis += Number(p.quantity) * Number(p.avg_price);
      entry.market_value += Number(p.quantity) * Number(p.asset_details!.price!);
      grouped.set(key, entry);
    });

    const today = todayIso();
    const payload = Array.from(grouped.values()).map((entry) => ({
      id_user: user.id,
      snapshot_date: today,
      currency: entry.currency,
      account_type: entry.account_type,
      market_value: Number(entry.market_value.toFixed(2)),
      cost_basis: Number(entry.cost_basis.toFixed(2)),
    }));

    const signature = JSON.stringify(payload);
    if (signature === lastRecordedSignature.current) return;
    lastRecordedSignature.current = signature;

    supabase
      .from("portfolio_snapshots")
      .upsert(payload, { onConflict: "id_user,snapshot_date,currency,account_type" })
      .select()
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to record portfolio snapshot:", error);
          return;
        }
        setSnapshots((prev) => {
          const otherDays = prev.filter((s) => s.snapshot_date !== today);
          return [...otherDays, ...((data ?? []) as PortfolioSnapshot[])].sort((a, b) =>
            a.snapshot_date.localeCompare(b.snapshot_date)
          );
        });
      });
  }, [positions, user?.id]);

  // --- Rendu ------------------------------------------------------------------
  if (positions.length === 0) {
    return (
      <Card className="glassmorphism border-none">
        <CardContent className="space-y-1 py-8 text-center">
          <Wallet className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="text-sm font-medium">Votre tableau de bord apparaîtra ici</p>
          <p className="text-xs text-muted-foreground">
            Ajoutez une position ci-dessous, puis actualisez les cours pour commencer le suivi.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    value: { label: "Valeur", color: "#6366f1" },
    perf: { label: "Performance", color: "#22c55e" },
  };

  const rangeLabel = (() => {
    if (period === "MAX") return "depuis l'origine";
    if (period === "YTD") return "depuis le 1ᵉʳ janvier";
    if (period === "1S") return "sur 1 semaine";
    if (period === "1M") return "sur 1 mois";
    return "sur 1 an";
  })();

  const hasValue = summary.isComplete && summary.value > 0;
  const isPositive = summary.gain >= 0;

  const fxDetails = fxLoading
    ? "Chargement du taux de change…"
    : fxError || !fx
      ? "Taux de change indisponible : la conversion en euros n'est pas appliquée."
      : `Taux utilisé : ${conversionCurrencies
          .map((c) => {
            const rate = eurRate(c);
            return rate == null ? `${c} : indisponible` : `1 ${c} = ${formatRate(rate)} ${BASE_CURRENCY}`;
          })
          .join(" · ")} — source ${fx.source}, taux du ${format(parseISO(fx.date), "d MMMM yyyy", { locale: fr })}.`;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Tableau de bord</h2>
        <div className="flex rounded-full border border-white/20 bg-white/40 p-0.5">
          {([ALL_ACCOUNTS, "PEA", "CTO"] as AccountFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccountFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                accountFilter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === ALL_ACCOUNTS ? "Tous" : value}
            </button>
          ))}
        </div>
      </div>

      {/* Carte unique : valorisation consolidée selon le filtre */}
      <Card className="glassmorphism border-none">
        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span>
                  Valeur du portefeuille
                  {accountFilter !== ALL_ACCOUNTS ? ` · ${accountFilter}` : ""}
                </span>
                {summary.converted && (
                  <button
                    type="button"
                    onClick={() => setShowFx((v) => !v)}
                    aria-expanded={showFx}
                    aria-label="Taux de change utilisé"
                    title="Taux de change utilisé"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                )}
              </p>
              <p className="text-3xl font-bold tracking-tight">
                {hasValue ? formatMoney(summary.value, summary.currency) : "—"}
              </p>
            </div>
            {hasValue && (
              <div className={`flex shrink-0 items-center gap-1 text-right ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                <div>
                  <p className="text-sm font-bold">{formatSigned(summary.gain, summary.currency)}</p>
                  <p className="text-xs font-semibold">{formatSignedPercent(summary.gainPercent)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Investi : {formatMoney(summary.cost, summary.currency)}</span>
            <span>
              {summary.count} position{summary.count > 1 ? "s" : ""}
            </span>
            {summary.missingPrice > 0 && (
              <span className="text-amber-600">
                Cours manquant pour {summary.missingPrice} titre{summary.missingPrice > 1 ? "s" : ""} — actualisez
              </span>
            )}
            {summary.missingFx > 0 && (
              <span className="text-amber-600">
                Taux de change indisponible pour {summary.missingFx} position{summary.missingFx > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {showFx && summary.converted && (
            <p className="rounded-lg border border-white/30 bg-white/30 px-3 py-2 text-[11px] text-muted-foreground">
              {fxDetails}
            </p>
          )}

          {accountFilter === ALL_ACCOUNTS && accountSplit.sum > 0 && (
            <div className="space-y-1">
              <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                <div className="bg-primary" style={{ width: `${accountSplit.peaPercent}%` }} />
                <div className="bg-amber-500" style={{ width: `${accountSplit.ctoPercent}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>
                  PEA {accountSplit.peaPercent.toFixed(0)} % · {formatMoney(accountSplit.totals.PEA, BASE_CURRENCY)}
                </span>
                <span>
                  CTO {accountSplit.ctoPercent.toFixed(0)} % · {formatMoney(accountSplit.totals.CTO, BASE_CURRENCY)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PARTIE 2 — évolution du portefeuille */}
      <Card className="glassmorphism border-none">
        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Évolution du portefeuille</p>
              <p className="text-[10px] text-muted-foreground">
                {displayCurrency} · {rangeLabel} · ajustée des apports/retraits
              </p>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex rounded-full border border-white/20 bg-white/40 p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPeriod(p.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {periodStats && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`text-2xl font-bold ${periodStats.gain >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatSigned(periodStats.gain, displayCurrency)}
              </span>
              <span className={`text-sm font-semibold ${periodStats.gain >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatSignedPercent(periodStats.perfPercent)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                apports nets période : {formatSigned(periodStats.contributions, displayCurrency)}
              </span>
            </div>
          )}

          {chartSeries.length >= 2 ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-[230px] w-full">
              <AreaChart data={chartSeries} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartMode === "value" ? "#6366f1" : "#22c55e"} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chartMode === "value" ? "#6366f1" : "#22c55e"} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(value: string) => formatDay(value)}
                />
                <YAxis
                  width={54}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) =>
                    chartMode === "value"
                      ? formatCompactMoney(value, displayCurrency)
                      : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
                  }
                />
                <Tooltip
                  cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as { date: string; value: number; perf: number };
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium">
                          {format(parseISO(point.date), "d MMMM yyyy", { locale: fr })}
                        </div>
                        <div className="text-foreground">{formatMoney(point.value, displayCurrency)}</div>
                        <div className={point.perf >= 0 ? "text-green-600" : "text-red-600"}>
                          Performance {formatSignedPercent(point.perf)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={chartMode === "value" ? "value" : "perf"}
                  name={chartMode === "value" ? "value" : "perf"}
                  stroke={chartMode === "value" ? "#6366f1" : "#22c55e"}
                  strokeWidth={2}
                  fill="url(#dashboardFill)"
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-white/30 bg-white/30 px-3 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Historique en constitution</p>
                <p>
                  {loadingSnapshots
                    ? "Chargement…"
                    : firstSnapshotDate
                      ? `Premier point enregistré le ${format(parseISO(firstSnapshotDate), "d MMMM yyyy", { locale: fr })}. La courbe s'affichera dès qu'un second jour sera enregistré.`
                      : "Aucun historique n'existe encore : la courbe se construira à partir d'aujourd'hui, à chaque actualisation des cours."}
                </p>
                <p>Aucune performance passée n'est inventée : seules les données réellement enregistrées sont utilisées.</p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setChartMode((m) => (m === "value" ? "perf" : "value"))}
            className="rounded-full border border-white/20 bg-white/40 px-3 py-1 text-[11px] font-medium text-primary hover:bg-white/60"
          >
            Afficher : {chartMode === "value" ? "valeur" : "performance ajustée"}
          </button>
        </CardContent>
      </Card>

      {/* PARTIE 3 — répartition par entreprise */}
      <Card className="glassmorphism border-none">
        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Répartition par entreprise</p>
              <p className="text-[10px] text-muted-foreground">
                {displayCurrency}
                {accountFilter !== ALL_ACCOUNTS ? ` · ${accountFilter}` : ""} · valeur de marché
              </p>
            </div>
            {allocation.total > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {allocation.data.length} ligne{allocation.data.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {allocation.total > 0 ? (
            <div className="flex flex-col items-center gap-4 md:flex-row">
              <div className="w-full md:w-1/2">
                <ChartContainer
                  config={{ value: { label: "Valeur", color: "#6366f1" } }}
                  className="mx-auto aspect-square h-[220px]"
                >
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const datum = payload[0].payload as AllocationDatum;
                        return (
                          <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                            <div className="font-medium">{datum.name}</div>
                            <div className="text-muted-foreground">
                              {datum.percent.toFixed(1)} % · {formatMoney(datum.value, displayCurrency)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={allocation.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      onMouseEnter={(_, index) => setActiveSlice(index)}
                      onMouseLeave={() => setActiveSlice(null)}
                    >
                      {allocation.data.map((entry, index) => (
                        <Cell
                          key={entry.key}
                          fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                          opacity={activeSlice === null || activeSlice === index ? 1 : 0.3}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>

              <div className="w-full space-y-1 md:w-1/2">
                {allocation.data.map((entry, index) => (
                  <button
                    key={entry.key}
                    type="button"
                    onMouseEnter={() => setActiveSlice(index)}
                    onMouseLeave={() => setActiveSlice(null)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      activeSlice === index ? "bg-secondary/60" : "hover:bg-secondary/40"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{entry.name}</span>
                        {entry.symbol && (
                          <span className="block font-mono text-[10px] text-muted-foreground">{entry.symbol}</span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold">{entry.percent.toFixed(1)} %</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {formatMoney(entry.value, displayCurrency)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-white/30 bg-white/30 px-3 py-3 text-xs text-muted-foreground">
              Aucune valeur de marché disponible pour cette sélection. Actualisez les cours pour alimenter la répartition.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default PortfolioDashboard;
