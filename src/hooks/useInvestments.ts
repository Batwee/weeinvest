
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvestmentOptions } from '@/lib/supabase';

export const useInvestments = (riskLevel: number) => {
  const [investments, setInvestments] = useState<InvestmentOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allInvestments, setAllInvestments] = useState<InvestmentOptions[]>([]);

  // Fetch investments only on mount
  useEffect(() => {
    const INVESTMENTS_CACHE_KEY = 'weeinvest_investments';
    const ASSET_DETAILS_CACHE_KEY = 'weeinvest_asset_details';

    const getCachedData = (key: string) => {
      const cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    };

    const setCachedData = (key: string, data: any) => {
      localStorage.setItem(key, JSON.stringify(data));
    };

    const fetchAndUpdateCache = async (tableName: string, cacheKey: string, orderBy?: string) => {
      try {
        const query = supabase.from(tableName).select('*');
        if (orderBy) {
          query.order(orderBy);
        }
        
        const { data: freshData, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        
        if (freshData) {
          setCachedData(cacheKey, freshData);
          return freshData;
        }

        return [];
      } catch (err) {
        console.error(`Error fetching ${tableName}:`, err);
        return getCachedData(cacheKey) || [];
      }
    };

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Always fetch fresh data for both tables
        const [freshInvestments, freshAssetDetails] = await Promise.all([
          fetchAndUpdateCache('investment_options', INVESTMENTS_CACHE_KEY, 'risk_level'),
          fetchAndUpdateCache('asset_details', ASSET_DETAILS_CACHE_KEY)
        ]);

        setAllInvestments(freshInvestments);

        // Filter and set investments based on risk level
        if (freshInvestments) {
          const filteredData = freshInvestments.filter(investment => {
            const riskDifference = Math.abs(riskLevel - investment.risk_level);
            return riskDifference <= 3;
          });
          setInvestments(filteredData);
        }
      } catch (err) {
        console.error('Error details:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Remove riskLevel dependency to fetch only on mount

  // Filter and calculate weights based on risk level changes using cached data
  useEffect(() => {
    if (allInvestments.length > 0) {
      const filteredData = allInvestments.filter(investment => {
        const riskDifference = Math.abs(riskLevel - investment.risk_level);
        return riskDifference <= 3;
      });

      filteredData.forEach(investment => {
        const riskDifference = Math.abs(riskLevel - investment.risk_level);
        investment.weight_modifier = Math.max(0.4, 1 - (riskDifference * 0.2));
      });

      setInvestments(filteredData);
    }
  }, [riskLevel, allInvestments]);

  return { investments, loading, error };
};
