
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

      // Calcul des poids pour TOUS les investissements
      const weights = investments.map(investment => {
        // Base weight calculation
        let weight = 1;

        // 1. Ajustement strict du poids basé sur le minimum_investment
        if (investment.minimum_investment && amount < investment.minimum_investment) {
          weight *= 0.2; // Réduction drastique du poids si le minimum n'est pas atteint
        }

        // 2. Ajustement basé sur le risk_level (0 à 1)
        const riskDifference = Math.abs(riskLevel - investment.risk_level);
        const riskWeight = (5 - riskDifference) / 5;
        weight *= Math.max(0.3, riskWeight); // minimum 30% pour garder une certaine visibilité

        // 3. Ajustement basé sur la complexité (complexity du slider)
        // Note: Nous utilisons le risk_level comme proxy pour la complexité
        // Plus la différence est grande, plus le poids est réduit
        const complexityDifference = Math.abs(riskLevel - investment.risk_level);
        const complexityWeight = (5 - complexityDifference) / 5;
        weight *= Math.max(0.3, complexityWeight);

        return Math.max(0.15, weight); // Garantir un minimum de 15% du poids original
      });

      // Normalisation des poids
      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
      
      // Calcul des pourcentages initiaux
      const initialPercentages = weights.map(weight => (weight / totalWeight) * 100);

      // Ajustement pour garantir un minimum de visibilité
      const minPercentage = 5; // 5% minimum pour chaque investissement
      const remainingPercentage = 100 - (minPercentage * investments.length);
      
      // Distribution du pourcentage restant proportionnellement
      const adjustedPercentages = initialPercentages.map(percentage => {
        return minPercentage + (percentage / 100) * remainingPercentage;
      });

      // Normalisation finale pour atteindre exactement 100%
      const totalPercentage = adjustedPercentages.reduce((acc, p) => acc + p, 0);
      const normalizedPercentages = adjustedPercentages.map(p => (p / totalPercentage) * 100);

      // Création des données finales avec TOUS les investissements
      return investments.map((investment, index) => ({
        name: investment.name_invest,
        value: normalizedPercentages[index],
        color: getColorForIndex(index)
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
