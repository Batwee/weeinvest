
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

      // Calcul des poids en fonction du niveau de risque pour tous les investissements
      const weights = investments.map(investment => {
        // Calculer le poids basé sur le niveau de risque (1 à 5)
        const riskWeight = (6 - Math.abs(riskLevel - investment.risk_level)) / 5;
        
        // Ajuster le poids en fonction du montant minimum d'investissement
        let weightMultiplier = 1;
        if (investment.minimum_investment) {
          if (amount < investment.minimum_investment) {
            // Réduire fortement le poids si le montant minimum n'est pas atteint
            // Plus la différence est grande, plus la réduction est importante
            const ratio = amount / investment.minimum_investment;
            weightMultiplier = Math.max(0.1, ratio * 0.5); // minimum 10% du poids original
          } else {
            // Augmenter légèrement le poids si le montant minimum est dépassé
            weightMultiplier = 1.2;
          }
        }

        // Assurer un poids minimum de 0.05 (5%) pour garantir la diversification
        return Math.max(0.05, riskWeight * weightMultiplier);
      });

      // Somme totale des poids pour la normalisation
      const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);

      // Calculer les pourcentages avec un minimum garanti
      const initialPercentages = investments.map((_, index) => {
        // Garantir un minimum de 2% pour chaque investissement
        const minPercentage = 2;
        const calculatedPercentage = (weights[index] / totalWeight) * (100 - (minPercentage * investments.length));
        return calculatedPercentage + minPercentage;
      });

      // Ajuster les pourcentages pour qu'ils totalisent exactement 100%
      const totalPercentage = initialPercentages.reduce((acc, percentage) => acc + percentage, 0);
      const adjustmentFactor = 100 / totalPercentage;

      // Créer les données finales avec TOUS les investissements
      return investments.map((investment, index) => ({
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
