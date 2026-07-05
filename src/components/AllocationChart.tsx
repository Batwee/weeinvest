
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect } from "react";
import { useInvestments } from "@/hooks/useInvestments";

interface AllocationChartProps {
  riskLevel: number;
  amount: number;
}

export const AllocationChart = ({ riskLevel, amount }: AllocationChartProps) => {
  const [data, setData] = useState<Array<{ name: string; value: number; color: string; potential_return: number }>>([]);
  const { investments, loading } = useInvestments(riskLevel);

  // Calculer l'APY global en fonction des pourcentages d'allocation
  const calculateGlobalAPY = () => {
    if (!data.length) return 0;
    
    return data.reduce((acc, item) => {
      const weightedReturn = (item.value / 100) * item.potential_return;
      return acc + weightedReturn;
    }, 0);
  };

  useEffect(() => {
    const calculateAllocation = () => {
      if (!investments.length) {
        return [];
      }

      // 1. Filtrage initial par niveau de risque
      const filteredByRisk = investments.filter(investment => {
        const riskDifference = Math.abs(investment.risk_level - riskLevel);
        return riskDifference <= 3;
      });

      if (!filteredByRisk.length) return [];

      // 2. Filtrage par montant minimum
      const filteredByAmount = filteredByRisk.filter(investment => {
        return !investment.minimum_investment || amount >= investment.minimum_investment;
      });

      // Si aucune option ne passe le filtre de montant, on met tout sur les livrets (fallback)
      if (filteredByAmount.length === 0) {
        return [{
          name: 'Livrets',
          value: 100,
          color: '#4285F4',
          potential_return: 3
        }];
      }

      // 3. Calcul des poids avec favoritisme pour l'épargne si risque faible
      const weights = filteredByAmount.map(investment => {
        const diff = Math.abs(investment.risk_level - riskLevel);
        let weight = Math.max(5 - diff, 0);
        
        // Booster l'épargne (risque <= 2) quand le niveau de risque cible est bas
        if (riskLevel <= 4 && investment.risk_level <= 2) {
          weight *= 2;
        }
        
        // Désavantager les projets risqués si le niveau cible est bas
        if (riskLevel <= 3 && investment.risk_level > riskLevel) {
          weight *= 0.5;
        }
        
        return weight;
      });

      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
      
      // 4. Calcul des montants théoriques et plafonnement
      const testAmount = amount || 1000; // Utiliser un montant fictif pour le calcul des % si amount est 0
      let totalAllocatedAmount = 0;
      const initialAllocations = filteredByAmount.map((investment, index) => {
        const theoreticalPercentage = (weights[index] / totalWeight);
        const theoreticalAmount = theoreticalPercentage * testAmount;
        
        let finalAmount = theoreticalAmount;
        if (investment.maximum_investment && theoreticalAmount > investment.maximum_investment) {
          finalAmount = investment.maximum_investment;
        }
        
        totalAllocatedAmount += finalAmount;
        return {
          investment,
          amount: finalAmount
        };
      });

      // 5. Normalisation finale pour le graphique
      if (totalAllocatedAmount === 0) return [];

      return initialAllocations.map((item, index) => ({
        name: item.investment.name_invest,
        value: (item.amount / totalAllocatedAmount) * 100,
        color: item.investment.color_invest || getColorForIndex(index),
        potential_return: item.investment.potential_return || 0
      }));
    };

    const getColorForIndex = (index: number) => {
      const colors = ["#9b87f5", "#7E69AB", "#D6BCFA", "#B794F4", "#805AD5", "#4285F4", "#34A853", "#FBBC05", "#EA4335"];
      return colors[index % colors.length];
    };

    setData(calculateAllocation());
  }, [riskLevel, investments, amount]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const value = item.value;
      const amountValue = (amount * value) / 100;
      const potentialReturn = item.payload.potential_return;
      const annualReturn = (amountValue * potentialReturn) / 100;

      return (
        <div className="glassmorphism p-3 rounded-lg space-y-1">
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{value.toFixed(1)}%</p>
          {amount > 0 && (
            <>
              <p className="text-sm font-medium">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                }).format(amountValue)}
              </p>
              <div className="border-t border-border/50 pt-1 mt-1">
                <p className="text-sm text-muted-foreground">APY: {potentialReturn}%</p>
                <p className="text-sm font-medium text-green-600">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  }).format(annualReturn)}/an
                </p>
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return <div className="w-full h-[300px] flex items-center justify-center">
      <p className="text-muted-foreground">Chargement...</p>
    </div>;
  }

  if (data.length > 0) {
    const globalAPY = calculateGlobalAPY();
    const globalAnnualReturn = (amount * globalAPY) / 100;

    return (
      <div className="w-full -mt-2">
        <div className="h-[300px] w-full animate-in -mx-2 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="80%"
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <p className="text-sm font-bold text-green-600">
              {globalAPY.toFixed(2)}% APY
            </p>
            {amount > 0 && (
              <p className="text-xs text-muted-foreground font-medium">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0
                }).format(globalAnnualReturn)}/an
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <div className="w-full h-[300px] flex items-center justify-center">
    <p className="text-muted-foreground">Aucune option d'investissement disponible</p>
  </div>;
};
