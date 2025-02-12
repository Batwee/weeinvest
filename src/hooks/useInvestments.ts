
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvestmentType } from '@/lib/supabase';

export const useInvestments = (riskLevel: number) => {
  const [investments, setInvestments] = useState<InvestmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvestments = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('investment_options')  // Changement du nom de la table
          .select('*')
          .eq('risk_level', riskLevel);

        if (error) throw error;

        setInvestments(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestments();
  }, [riskLevel]);

  return { investments, loading, error };
};
