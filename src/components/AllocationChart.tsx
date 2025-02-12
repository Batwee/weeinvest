
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
        // Fallback to default values if no investments are loaded
        const stocks = Math.min(90, Math.max(10, riskLevel * 10));
        const bonds = Math.min(80, Math.max(5, 100 - stocks - 5));
        const cash = 100 - stocks - bonds;

        return [
          { name: "Actions", value: stocks, color: "#9b87f5" },
          { name: "Obligations", value: bonds, color: "#7E69AB" },
          { name: "Liquidités", value: cash, color: "#D6BCFA" },
        ];
      }

      // Groupe les investissements par type et calcule le total
      const groupedInvestments = investments.reduce((acc, investment) => {
        if (!acc[investment.type]) {
          acc[investment.type] = 0;
        }
        acc[investment.type] += 25; // Distribution égale entre les options
        return acc;
      }, {} as Record<string, number>);

      // Convertit les groupes en format pour le graphique
      const colors: Record<string, string> = {
        crypto: "#9b87f5",
        stocks: "#7E69AB",
        bonds: "#D6BCFA",
        cash: "#B794F4"
      };

      const typeLabels: Record<string, string> = {
        crypto: "Crypto",
        stocks: "Actions",
        bonds: "Obligations",
        cash: "Liquidités"
      };

      return Object.entries(groupedInvestments).map(([type, value]) => ({
        name: typeLabels[type] || type,
        value,
        color: colors[type] || "#9b87f5"
      }));
    };

    setData(calculateAllocation());
  }, [riskLevel, investments]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const value = item.value;
      const amountValue = (amount * value) / 100;

      return (
        <div className="glassmorphism p-3 rounded-lg">
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{value}%</p>
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
};
