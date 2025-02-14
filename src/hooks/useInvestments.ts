
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvestmentOptions } from '@/lib/supabase';

export const useInvestments = (riskLevel: number) => {
  const [investments, setInvestments] = useState<InvestmentOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvestments = async () => {
      try {
        setLoading(true);
        console.log('Fetching investments for risk level:', riskLevel);
        
        const { data, error } = await supabase
          .from('investment_options')
          .select('*')
          .eq('risk_level', riskLevel);

        console.log('Supabase response data:', data);
        console.log('Supabase response error:', error);

        if (error) throw error;

        setInvestments(data || []);
      } catch (err) {
        console.error('Error details:', err);
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestments();
  }, [riskLevel]);

  return { investments, loading, error };
};
