
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rgodejjtasgluerbzfvr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnb2Rlamp0YXNnbHVlcmJ6ZnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMzAxODMsImV4cCI6MjA1NDgwNjE4M30.gQuDKpU06ZmuuODVHGzCkLI_N20L4dwAmNuz7PFuxAQ';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const getApiKey = async (apiName: string): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error("Aucun utilisateur authentifié pour récupérer la clé API");
    return null;
  }

  const { data, error } = await supabase
    .from("api")
    .select("api_key")
    .eq("api_name", apiName)
    .eq("id_user", user.id)
    .maybeSingle();

  if (error) {
    console.error("Échec de la récupération de la clé API:", error);
    return null;
  }

  return data?.api_key ?? null;
};

export type InvestmentOptions = {
  id_invest: number;
  name_invest: string;
  description: string;
  risk_level: number;
  type?: string;
  minimum_investment?: number;
  maximum_investment?: number;
  color_invest?: string;
  potential_return?: number;
  fear_and_greed?: number;
  fng_updated_at?: string;
  altcoin_index?: number;
  altcoin_index_updated_at?: string;
  lien_fng?: string;
  json_path?: string;
  fng_name?: string;
};

export type AssetDetail = {
  id_asset: number;
  id_invest: number;
  name?: string;
  name_asset?: string;
  symbol: string;
  market_cap: number;
  RSI?: number | null;
  SMA?: string;
  conclusion?: string;
  RSI_SMA_updated_at?: string;
  alerte?: boolean;
  alert_state?: string | null;
  market_index?: boolean | null;
  percentage?: number | null;
  id_user?: string | null;
  // false = entreprise référencée par une position mais absente de la watchlist
  is_followed?: boolean;
  // Dernier cours connu (cache communautaire)
  price?: number | null;
  price_updated_at?: string | null;
};

export type AccountType = "PEA" | "CTO";

export type StockPosition = {
  id_position: number;
  id_user: string;
  id_asset: number;
  account_type: AccountType;
  quantity: number;
  avg_price: number;
  currency: string;
  exchange?: string | null;
  created_at?: string;
  updated_at?: string;
  // Entreprise du référentiel, jointe à la lecture
  asset_details?: AssetDetail | null;
};

export type Affiliate = {
  id_affiliate: number;
  name_affiliate: string;
  description: string;
  link: string;
  id_invest: number;
  click_count?: number | null;
};

export type PortfolioSnapshot = {
  id_snapshot: number;
  id_user: string;
  snapshot_date: string;
  currency: string;
  account_type: AccountType;
  market_value: number;
  cost_basis: number;
  created_at?: string;
};

export type UserAssetPreference = {
  id_user: string;
  id_invest: number;
  show_base_assets: boolean;
  updated_at?: string;
};
