
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect } from "react";
import { useInvestments } from "@/hooks/useInvestments";

interface AllocationChartProps {
  riskLevel: number;
  amount: number;
}

export const AllocationChart = ({ riskLevel, amount }: AllocationChartProps) => {
  const [data, setData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const { investments, loading } = useInvestments(riskLevel);

  useEffect(() => {
    const calculateAllocation = () => {
      if (!investments.length) {
        return [];
      }

      // Filtrer les investissements en fonction du montant disponible
      const availableInvestments = investments.filter(
        investment => !investment.minimum_investment || investment.minimum_investment <= amount
      );

      // Si aucun investissement n'est disponible avec le montant actuel, 
      // proposer des alternatives avec des minimums plus bas
      if (availableInvestments.length === 0) {
        return [
          { 
            name: "Crypto-monnaies", 
            value: 30, 
            color: "#9b87f5" 
          },
          { 
            name: "ETF", 
            value: 40, 
            color: "#7E69AB" 
          },
          { 
            name: "Liquidités", 
            value: 30, 
            color: "#D6BCFA" 
          }
        ];
      }

      // Calcul des poids en fonction du niveau de risque
      const weights = investments.map(investment => {
        // Calculer le poids basé sur le niveau de risque
        const riskWeight = (6 - Math.abs(riskLevel - investment.risk_level)) / 5;
        // Assurer un poids minimum de 0.1 (10%) pour garantir la diversification
        return Math.max(0.1, riskWeight);
      });

      // Somme totale des poids pour la normalisation
      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);

      // Calculer les pourcentages avec un minimum garanti
      const initialPercentages = investments.map((investment, index) => {
        // Garantir un minimum de 5% pour chaque investissement
        const minPercentage = 5;
        const calculatedPercentage = (weights[index] / totalWeight) * (100 - (minPercentage * investments.length));
        return calculatedPercentage + minPercentage;
      });

      // Ajuster les pourcentages pour qu'ils totalisent exactement 100%
      const totalPercentage = initialPercentages.reduce((acc, percentage) => acc + percentage, 0);
      const adjustmentFactor = 100 / totalPercentage;

      // Calculer les allocations finales en tenant compte des montants minimums
      const finalData = investments.map((investment, index) => {
        const percentage = initialPercentages[index] * adjustmentFactor;
        const allocatedAmount = (amount * percentage) / 100;

        // Si le montant alloué est inférieur au minimum requis, réduire le pourcentage
        if (investment.minimum_investment && allocatedAmount < investment.minimum_investment) {
          return {
            name: investment.name_invest,
            value: Math.max(5, (investment.minimum_investment / amount) * 100),
            color: getColorForIndex(index)
          };
        }

        return {
          name: investment.name_invest,
          value: percentage,
          color: getColorForIndex(index)
        };
      });

      // Normaliser à nouveau les pourcentages pour s'assurer qu'ils totalisent 100%
      const finalTotal = finalData.reduce((acc, item) => acc + item.value, 0);
      return finalData.map(item => ({
        ...item,
        value: (item.value / finalTotal) * 100
      }));
    };

    const getColorForIndex = (index: number) => {
      const colors = ["#9b87f5", "#7E69AB", "#D6BCFA", "#B794F4", "#805AD5"];
      return colors[index % colors.length];
    };

    setData(calculateAllocation());
  }, [riskLevel, investments, amount]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const value = item.value;
      const amountValue = (amount * value) / 100;

      return (
        <div className="glassmorphism p-3 rounded-lg">
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{value.toFixed(1)}%</p>
          <p className="text-sm font-medium">
            {new Intl.NumberFormat("fr-FR", {
              style: "currency",
              currency: "EUR",
            }).format(amountValue)}
          </p>
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

  if (!amount) {
    return <div className="w-full h-[300px] flex items-center justify-center">
      <p className="text-muted-foreground">Rentrez vos fonds à investir</p>
    </div>;
  }

  if (data.length > 0) {
    return (
      <div className="w-full h-[300px] animate-in">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              animationBegin={0}
              animationDuration={1000}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return <div className="w-full h-[300px] flex items-center justify-center">
    <p className="text-muted-foreground">Aucune option d'investissement disponible</p>
  </div>;
};
