import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Taux de change (WeeInvest)
// -----------------------------------------------------------------------------
// Contrainte : ne jamais additionner des devises différentes et ne jamais
// fabriquer un taux. Toutes les valeurs sont converties à partir d'un taux réel
// et daté, fourni par une source publique identifiée.
//
// Stratégie :
//  1. cache localStorage (12 h) : aucun appel réseau inutile ;
//  2. sinon, sources publiques essayées en cascade jusqu'à la première valide ;
//  3. en cas d'échec total, réutilisation du dernier taux connu s'il a moins de
//     7 jours (sa date est alors affichée), sinon conversion désactivée.
// =============================================================================

export const BASE_CURRENCY = "EUR";

const LATEST_TTL_MS = 12 * 60 * 60 * 1000;
const SERIES_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const CACHE_LATEST = "weeinvest-fx-latest";
const cacheSeriesKey = (start: string, end: string, currencies: string[]) =>
  `weeinvest-fx-series-${start}_${end}_${currencies.join("-")}`;

/** Taux exprimés en EUR pour 1 unité de devise (EUR vaut toujours 1). */
export type FxQuote = {
  rates: Record<string, number>;
  date: string;
  source: string;
  fetchedAt: number;
};

export type FxSeries = Map<string, Record<string, number>>;

export type FxStatus = {
  quote: FxQuote | null;
  series: FxSeries;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/** Code de devise exploitable ; retombe sur EUR si la valeur est incohérente. */
export const normalizeCurrency = (value?: string | null): string => {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : BASE_CURRENCY;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const shiftDate = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const readCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeCache = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota dépassé ou navigation privée : le cache est optionnel
  }
};

/** Les sources publient « 1 EUR = x DEV » ; on stocke l'inverse (EUR par devise). */
const invert = (perEur: unknown): number | null => {
  const value = Number(perEur);
  return Number.isFinite(value) && value > 0 ? 1 / value : null;
};

type FxSource = {
  name: string;
  url: (currencies: string[]) => string;
  parse: (json: any, currencies: string[]) => { rates: Record<string, number>; date?: string };
};

const SOURCES: FxSource[] = [
  {
    name: "BCE (Frankfurter)",
    url: (currencies) =>
      `https://api.frankfurter.app/latest?from=${BASE_CURRENCY}&to=${currencies.join(",")}`,
    parse: (json, currencies) => {
      const rates: Record<string, number> = {};
      currencies.forEach((code) => {
        const rate = invert(json?.rates?.[code]);
        if (rate != null) rates[code] = rate;
      });
      return { rates, date: typeof json?.date === "string" ? json.date : undefined };
    },
  },
  {
    name: "currency-api (CDN)",
    url: () =>
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${BASE_CURRENCY.toLowerCase()}.json`,
    parse: (json, currencies) => {
      const table = json?.[BASE_CURRENCY.toLowerCase()] ?? {};
      const rates: Record<string, number> = {};
      currencies.forEach((code) => {
        const rate = invert(table[code.toLowerCase()]);
        if (rate != null) rates[code] = rate;
      });
      return { rates, date: typeof json?.date === "string" ? json.date : undefined };
    },
  },
  {
    name: "open.er-api.com",
    url: () => `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`,
    parse: (json, currencies) => {
      const rates: Record<string, number> = {};
      currencies.forEach((code) => {
        const rate = invert(json?.rates?.[code]);
        if (rate != null) rates[code] = rate;
      });
      const stamp =
        typeof json?.time_last_update_unix === "number"
          ? new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10)
          : undefined;
      return { rates, date: stamp };
    },
  },
];

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveLatest(currencies: string[], force = false): Promise<FxQuote | null> {
  if (currencies.length === 0) return null;

  const cached = readCache<FxQuote>(CACHE_LATEST);
  const cacheCoversAll = !!cached && currencies.every((c) => Number.isFinite(cached.rates?.[c]));
  if (!force && cacheCoversAll && Date.now() - cached!.fetchedAt < LATEST_TTL_MS) {
    return cached;
  }

  for (const source of SOURCES) {
    try {
      const json = await fetchJson(source.url(currencies));
      const parsed = source.parse(json, currencies);
      const rates = parsed.rates ?? {};
      // Une source qui ne résout aucune devise demandée est inexploitable.
      if (!currencies.some((c) => Number.isFinite(rates[c]))) continue;
      const quote: FxQuote = {
        rates,
        date: parsed.date || todayIso(),
        source: source.name,
        fetchedAt: Date.now(),
      };
      writeCache(CACHE_LATEST, quote);
      return quote;
    } catch (error) {
      console.warn(`Taux de change : source « ${source.name} » injoignable`, error);
    }
  }

  // Dernier taux connu, uniquement s'il reste suffisamment récent.
  if (cached && Date.now() - cached.fetchedAt < MAX_STALE_MS) return cached;
  return null;
}

async function resolveSeries(currencies: string[], dates: string[], force = false): Promise<FxSeries> {
  const days = Array.from(new Set(dates.filter(Boolean))).sort();
  if (currencies.length === 0 || days.length === 0) return new Map();

  const start = days[0];
  const end = days[days.length - 1];
  const key = cacheSeriesKey(start, end, currencies);

  if (!force) {
    const cached = readCache<{ fetchedAt: number; data: [string, Record<string, number>][] }>(key);
    if (cached && Date.now() - cached.fetchedAt < SERIES_TTL_MS) return new Map(cached.data);
  }

  const range = start === end ? start : `${start}..${end}`;
  const url = `https://api.frankfurter.app/${range}?from=${BASE_CURRENCY}&to=${currencies.join(",")}`;

  try {
    const json = await fetchJson(url);
    const series: FxSeries = new Map();

    const collect = (table: any) => {
      const entry: Record<string, number> = {};
      currencies.forEach((code) => {
        const rate = invert(table?.[code]);
        if (rate != null) entry[code] = rate;
      });
      return entry;
    };

    if (start === end) {
      // Requête sur une date unique : la réponse n'est pas indexée par date.
      const entry = collect(json?.rates);
      if (Object.keys(entry).length) series.set(json?.date || start, entry);
    } else {
      Object.entries(json?.rates ?? {}).forEach(([date, table]) => {
        const entry = collect(table);
        if (Object.keys(entry).length) series.set(date, entry);
      });
    }

    if (series.size > 0) {
      writeCache(key, { fetchedAt: Date.now(), data: Array.from(series.entries()) });
    }
    return series;
  } catch (error) {
    console.warn("Taux de change : historique daté indisponible", error);
    return new Map();
  }
}

export type ResolvedRate = { rate: number; date: string; exact: boolean };

/**
 * Taux de `currency` vers EUR à une date donnée.
 * - taux publié ce jour-là (exact) ;
 * - sinon dernier taux publié dans les 7 jours précédents (jour non ouvré) ;
 * - sinon dernier taux connu (approximatif, sa date est renvoyée).
 */
export function rateAt(status: FxStatus, currency: string, dateIso?: string | null): ResolvedRate | null {
  const code = normalizeCurrency(currency);
  if (code === BASE_CURRENCY) return { rate: 1, date: dateIso || todayIso(), exact: true };

  if (dateIso && status.series.size > 0) {
    const direct = status.series.get(dateIso)?.[code];
    if (Number.isFinite(direct)) return { rate: direct, date: dateIso, exact: true };

    for (let offset = 1; offset <= 7; offset += 1) {
      const day = shiftDate(dateIso, -offset);
      const rate = status.series.get(day)?.[code];
      if (Number.isFinite(rate)) return { rate, date: day, exact: false };
    }
  }

  const fallback = status.quote?.rates?.[code];
  if (Number.isFinite(fallback)) return { rate: fallback!, date: status.quote!.date, exact: false };
  return null;
}

/** Facteur de conversion (combien de `to` vaut 1 `from`) ; null si taux indisponible. */
export function fxFactor(
  status: FxStatus,
  from: string,
  to: string,
  dateIso?: string | null
): number | null {
  const source = normalizeCurrency(from);
  const target = normalizeCurrency(to);
  if (source === target) return 1;

  const rateFrom = rateAt(status, source, dateIso);
  const rateTo = rateAt(status, target, dateIso);
  if (!rateFrom || !rateTo) return null;
  return rateFrom.rate / rateTo.rate;
}

export function convertAmount(
  status: FxStatus,
  value: number,
  from: string,
  to: string,
  dateIso?: string | null
): number | null {
  const factor = fxFactor(status, from, to, dateIso);
  return factor == null ? null : value * factor;
}

/** Charge le dernier taux et l'historique daté nécessaires aux conversions. */
export function useFxRates(currencies: string[], dates: string[]): FxStatus {
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [series, setSeries] = useState<FxSeries>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const forceNextLoad = useRef(false);

  const currencyKey = currencies.join(",");
  const dateKey = dates.join(",");

  useEffect(() => {
    if (!currencyKey) {
      setQuote(null);
      setSeries(new Map());
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const list = currencyKey.split(",");
    const dayList = dateKey ? dateKey.split(",") : [];
    const force = forceNextLoad.current;
    forceNextLoad.current = false;

    const run = async () => {
      setLoading(true);
      const [nextQuote, nextSeries] = await Promise.all([
        resolveLatest(list, force),
        resolveSeries(list, dayList, force),
      ]);
      if (cancelled) return;
      setQuote(nextQuote);
      setSeries(nextSeries);
      setError(
        nextQuote
          ? null
          : "Aucune source de taux de change n'a pu être jointe. La conversion en euros est désactivée."
      );
      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [currencyKey, dateKey, reloadToken]);

  const reload = useCallback(() => {
    forceNextLoad.current = true;
    setReloadToken((token) => token + 1);
  }, []);

  return { quote, series, loading, error, reload };
}
