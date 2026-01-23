
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rgodejjtasgluerbzfvr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnb2Rlamp0YXNnbHVlcmJ6ZnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMzAxODMsImV4cCI6MjA1NDgwNjE4M30.gQuDKpU06ZmuuODVHGzCkLI_N20L4dwAmNuz7PFuxAQ';

export const supabase = createClient(supabaseUrl, supabaseKey);

export type InvestmentOptions = {
  id: number;
  id_invest: number;
  name_invest: string;
  description: string;
  risk_level: number;
  type: string;
  minimum_investment?: number;
  potential_return: number;
  weight_modifier?: number;
  color_invest?: string;
  exemples?: string;
};
