
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect } from "react";

interface AllocationChartProps {
  riskLevel: number;
  amount: number;
}

export const AllocationChart = ({ riskLevel, amount }: AllocationChartProps) => {
  const [data, setData] = useState<Array<{ name: string; value: number; color: string }>>([]);

  useEffect(() => {
    const calculateAllocation = () => {
      const stocks = Math.min(90, Math.max(10, riskLevel * 10));
      const bonds = Math.min(80, Math.max(5, 100 - stocks - 5));
      const cash = 100 - stocks - bonds;

      return [
        { name: "Actions", value: stocks, color: "#9b87f5" },
        { name: "Obligations", value: bonds, color: "#7E69AB" },
        { name: "Liquidités", value: cash, color: "#D6BCFA" },
      ];
    };

    setData(calculateAllocation());
  }, [riskLevel]);

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
