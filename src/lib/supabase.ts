
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rgodejjtasgluerbzfvr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnb2Rlamp0YXNnbHVlcmJ6ZnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMzAxODMsImV4cCI6MjA1NDgwNjE4M30.gQuDKpU06ZmuuODVHGzCkLI_N20L4dwAmNuz7PFuxAQ';

export const supabase = createClient(supabaseUrl, supabaseKey);

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
};

export type AssetDetail = {
  id_asset: number;
  id_invest: number;
  name: string;
  name_asset?: string;
  symbol: string;
  market_cap: number;
  RSI?: number | null;
  SMA?: string;
  conclusion?: string;
  RSI_SMA_updated_at?: string;
};

export type Affiliate = {
  id_affiliate: number;
  name_affiliate: string;
  description: string;
  link: string;
  id_invest: number;
  click_count?: number | null;
};
