import { useState, useEffect } from "react";
import { useInvestments } from "@/hooks/useInvestments";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "./ui/card";
import { ChevronRight } from "lucide-react";
import { Badge } from "./ui/badge";

interface AllocationSummaryProps {
  riskLevel: number;
  amount: number;
}

export const AllocationSummary = ({ riskLevel, amount }: AllocationSummaryProps) => {
  const { investments, loading } = useInvestments(riskLevel);
  const [summary, setSummary] = useState<Array<{ id: number; name: string; percentage: number; color: string; amount: number; apy: number }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!investments.length) return;

    // Replication of logic in AllocationChart.tsx
    const filteredByRisk = investments.filter(inv => Math.abs(inv.risk_level - riskLevel) <= 3);
    if (!filteredByRisk.length) return;

    const testAmount = amount || 1000;
    const filteredByAmount = filteredByRisk.filter(inv => !inv.minimum_investment || testAmount >= inv.minimum_investment);
    
    if (filteredByAmount.length === 0) {
      setSummary([{
        id: -1,
        name: 'Livrets',
        percentage: 100,
        color: '#4285F4',
        amount: amount || 1000,
        apy: 3 // Livret A standard
      }]);
      return;
    }

    // 3. Calcul des poids avec favoritisme pour l'épargne si risque faible
    const weights = filteredByAmount.map(inv => {
      const diff = Math.abs(inv.risk_level - riskLevel);
      let weight = Math.max(5 - diff, 0);
      
      // Booster l'épargne (risque <= 2) quand le niveau de risque cible est bas
      if (riskLevel <= 4 && inv.risk_level <= 2) {
        weight *= 2;
      }
      
      // Désavantager les projets risqués si le niveau cible est bas
      if (riskLevel <= 3 && inv.risk_level > riskLevel) {
        weight *= 0.5;
      }
      
      return weight;
    });
    const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
    
    let totalAllocatedAmount = 0;
    const initialAllocations = filteredByAmount.map((inv, index) => {
      const theoreticalPercentage = (weights[index] / totalWeight);
      const theoreticalAmount = theoreticalPercentage * testAmount;
      let finalAmount = theoreticalAmount;
      if (inv.maximum_investment && theoreticalAmount > inv.maximum_investment) {
        finalAmount = inv.maximum_investment;
      }
      totalAllocatedAmount += finalAmount;
      return { inv, amount: finalAmount };
    });

    const result = initialAllocations.map((item) => ({
      id: item.inv.id_invest,
      name: item.inv.name_invest,
      percentage: (item.amount / totalAllocatedAmount) * 100,
      color: item.inv.color_invest || "#9b87f5",
      amount: (item.amount / totalAllocatedAmount) * (amount || 1000),
      apy: item.inv.potential_return || 0
    })).sort((a, b) => b.percentage - a.percentage);

    setSummary(result);
  }, [riskLevel, investments, amount]);

  if (loading) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        Allocation :
        <span className="text-xs font-normal text-muted-foreground">(Cliquer pour voir le détail)</span>
      </h3>
      <div className="grid grid-cols-1 gap-3">
        {summary.map((item) => (
          <Card 
            key={item.id} 
            className="glassmorphism border-none hover:bg-white/20 transition-all cursor-pointer group"
            onClick={() => item.id !== -1 && navigate(`/asset/${item.id}`)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div 
                  className="w-3 h-3 rounded-full shadow-sm shrink-0" 
                  style={{ backgroundColor: item.color }} 
                />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold group-hover:text-primary transition-colors">{item.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-white/10 border-none" style={{ color: item.color }}>
                      {item.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                  <span className="text-xs font-bold text-green-500">
                    {item.apy}% APY
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-black text-sm">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0
                    }).format(item.amount)}
                  </p>
                </div>
                {item.id !== -1 && (
                  <div className="bg-primary/10 p-1.5 rounded-full group-hover:bg-primary/20 transition-colors shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
