
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

      // Filtrer les investissements en fonction du montant minimum requis
      const availableInvestments = investments.filter(investment => 
        !investment.minimum_investment || amount >= investment.minimum_investment
      );

      // Si aucun investissement n'est disponible avec le montant actuel
      if (availableInvestments.length === 0) {
        return [
          { 
            name: "ETF", 
            value: 60, 
            color: "#7E69AB" 
          },
          { 
            name: "Liquidités", 
            value: 40, 
            color: "#D6BCFA" 
          }
        ];
      }

      // Calcul des poids en fonction du niveau de risque pour les investissements disponibles
      const weights = availableInvestments.map(investment => {
        // Calculer le poids basé sur le niveau de risque
        const riskWeight = (6 - Math.abs(riskLevel - investment.risk_level)) / 5;
        return Math.max(0.1, riskWeight);
      });

      // Somme totale des poids pour la normalisation
      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);

      // Calculer les pourcentages avec un minimum garanti
      const initialPercentages = availableInvestments.map((investment, index) => {
        const minPercentage = 5;
        const calculatedPercentage = (weights[index] / totalWeight) * (100 - (minPercentage * availableInvestments.length));
        return calculatedPercentage + minPercentage;
      });

      // Ajuster les pourcentages pour qu'ils totalisent exactement 100%
      const totalPercentage = initialPercentages.reduce((acc, percentage) => acc + percentage, 0);
      const adjustmentFactor = 100 / totalPercentage;

      return availableInvestments.map((investment, index) => ({
        name: investment.name_invest,
        value: initialPercentages[index] * adjustmentFactor,
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
