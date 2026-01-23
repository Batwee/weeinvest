
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect } from "react";
import { useInvestments } from "@/hooks/useInvestments";

interface AllocationChartProps {
  riskLevel: number;
  amount: number;
  onInvestmentsChange?: (investments: any[]) => void;
}

export const AllocationChart = ({ riskLevel, amount, onInvestmentsChange }: AllocationChartProps) => {
  const [data, setData] = useState<Array<{ name: string; value: number; color: string; potential_return: number }>>([]);
  const [eligibleInvestments, setEligibleInvestments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { investments, loading } = useInvestments(riskLevel);

  // Calculer l'APY global en fonction des pourcentages d'allocation
  const calculateGlobalAPY = () => {
    if (!data.length) return 0;
    
    const totalValue = data.reduce((acc, item) => acc + item.value, 0);
    if (totalValue === 0) return 0;

    const weightedReturns = data.reduce((acc, item) => {
      const weightedReturn = (item.value / totalValue) * item.potential_return;
      return acc + weightedReturn;
    }, 0);

    return Number.isFinite(weightedReturns) ? weightedReturns : 0;
  };

  useEffect(() => {
    const calculateAllocation = () => {
      if (!investments || !Array.isArray(investments) || investments.length === 0) {
        setEligibleInvestments([]);
        return [];
      }

      // Filter out investments that don't meet minimum requirements
      const filtered = investments.filter(investment => {
        if (!investment || typeof investment !== 'object') return false;
        const hasMinimumRequirement = typeof investment.minimum_investment === 'number';
        return hasMinimumRequirement ? amount >= investment.minimum_investment : true;
      });

      if (filtered.length === 0) {
        setEligibleInvestments([]);
        return [];
      }

      // Calculate weights first
      const weights = filtered.map(investment => {
        if (!investment || typeof investment.risk_level !== 'number') {
          return 0.5;
        }
        let weight = 5;
        const riskDifference = Math.abs(riskLevel - investment.risk_level);
        if (riskDifference === 0) {
          weight *= 2.5;
        } else if (riskDifference <= 2) {
          weight *= (2 - (riskDifference * 0.3));
        } else {
          weight *= (1.2 - (riskDifference * 0.15));
        }
        if (investment.weight_modifier) {
          weight *= Math.max(0.5, investment.weight_modifier);
        }
        return Math.max(0.5, weight);
      });

      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
      const initialPercentages = weights.map(weight => (weight / totalWeight) * 100);

      const minPercentage = 5;
      const maxPercentage = 40;

      // Adjust percentages to respect min/max constraints
      let adjustedPercentages = initialPercentages.map(percentage => {
        if (percentage < minPercentage) return minPercentage;
        if (percentage > maxPercentage) return maxPercentage;
        return percentage;
      });

      // Normalize percentages to sum to 100
      const totalPercentage = adjustedPercentages.reduce((acc, percentage) => acc + percentage, 0);
      adjustedPercentages = adjustedPercentages.map(percentage => (percentage / totalPercentage) * 100);

      // Now we can safely use adjustedPercentages
      const filteredWithValues = filtered.map((investment, index) => ({
        ...investment,
        id: investment.id,
        value: adjustedPercentages[index]
      }));
      setEligibleInvestments(filteredWithValues);
      if (onInvestmentsChange) {
        onInvestmentsChange(filteredWithValues);
      }

      return filtered.map((investment, index) => {
        return {
          name: investment.name_invest,
          value: adjustedPercentages[index],
          color: investment.color_invest || 'hsl(var(--primary))',
          potential_return: investment.potential_return
        };
      });
    };

    const newData = calculateAllocation();
    if (Array.isArray(newData)) {
      setData(newData);
    } else {
      setData([]);
    }
  }, [investments, riskLevel, amount, onInvestmentsChange]);

  if (loading) {
    return <div className="flex items-center justify-center h-[300px] animate-pulse">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500 animate-in fade-in">{error}</div>;
  }

  if (!amount) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm animate-in fade-in slide-in-from-bottom-4">
        Saisissez un montant pour voir votre allocation
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm animate-in fade-in slide-in-from-bottom-4">
        Aucun investissement éligible trouvé pour le montant et le niveau de risque actuels
      </div>
    );
  }

  const globalAPY = calculateGlobalAPY();

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Allocation d'Actifs</span>
        <span className="text-sm font-medium text-green-600">
          APY Global : {globalAPY.toFixed(2)}%
          <span className="text-xs ml-1">
            ({(amount * (globalAPY / 100)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}/an)
          </span>
        </span>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              paddingAngle={2}
              dataKey="value"
              fill="hsl(var(--primary))"
              stroke="hsl(var(--border))"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string, item: any) => {
                const allocatedAmount = (value / 100) * amount;
                return [
                  <>
                    <span style={{ color: 'hsl(var(--foreground))' }}>
                      {name}
                      <br /><br />
                      {`${value.toFixed(1)}% (${allocatedAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })})`}
                      <br />
                    </span>
                    <span style={{ color: 'rgb(22 163 74)', fontWeight: 'bold' }}>{`APY: ${item.payload.potential_return}%`}</span>
                  </>,
                  undefined
                ];
              }}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '14px',
                whiteSpace: 'pre-line',
                color: 'hsl(var(--foreground))'
              }}
              labelStyle={{
                color: 'hsl(var(--foreground))'
              }}
              itemStyle={{
                color: 'hsl(var(--foreground))'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
