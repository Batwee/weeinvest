
import { Slider } from "@/components/ui/slider";
import { useState, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvestments } from "@/hooks/useInvestments";

interface RiskSliderProps {
  onChange: (riskValue: number) => void;
  amount: number;
  isCollapsed?: boolean;
}

export const RiskSlider = ({ onChange, amount, isCollapsed = false }: RiskSliderProps) => {
  const [sliderRiskValue, setSliderRiskValue] = useState([3]);
  const [riskIndicator, setRiskIndicator] = useState<"up" | "down">("up");
  const { investments } = useInvestments(sliderRiskValue[0]);

  const getRiskColor = (value: number) => {
    if (value === 1) return "text-green-700";
    if (value === 2) return "text-green-500";
    if (value === 3) return "text-yellow-600";
    if (value === 4) return "text-red-500";
    return "text-red-700";
  };

  const getSliderColor = (value: number) => {
    if (value === 1) return "bg-green-700";
    if (value === 2) return "bg-green-500";
    if (value === 3) return "bg-yellow-600";
    if (value === 4) return "bg-red-500";
    return "bg-red-700";
  };

  useEffect(() => {
    onChange(sliderRiskValue[0]);
    setRiskIndicator(sliderRiskValue[0] > 3 ? "up" : "down");
  }, [sliderRiskValue, onChange]);

  return (
    <div className="w-full space-y-4 animate-in">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Niveau de Risque
          </label>
          <div className="flex items-center gap-2">
            {sliderRiskValue[0] === 3 ? (
              <span className={cn("text-xl font-bold", getRiskColor(sliderRiskValue[0]))}>-</span>
            ) : riskIndicator === "up" ? (
              <ArrowUp className={cn("w-4 h-4", getRiskColor(sliderRiskValue[0]))} />
            ) : (
              <ArrowDown className={cn("w-4 h-4", getRiskColor(sliderRiskValue[0]))} />
            )}
            <span className="text-sm font-medium">{sliderRiskValue[0]}/ 5</span>
          </div>
        </div>
        <div className={cn("transition-all duration-300", {
          "hidden": isCollapsed
        })}>
          <Slider
            max={5}
            min={1}
            step={1}
            value={sliderRiskValue}
            onValueChange={setSliderRiskValue}
            className={cn("cursor-pointer [&>[role=slider]]:transition-colors [&>[role=slider]]:duration-200", {
              "[&>div>div]:bg-green-700 [&>div>div]:absolute [&>[role=slider]]:border-green-700 [&>[role=slider]]:bg-white [&_.absolute]:bg-green-700": sliderRiskValue[0] === 1,
              "[&>div>div]:bg-green-500 [&>div>div]:absolute [&>[role=slider]]:border-green-500 [&>[role=slider]]:bg-white [&_.absolute]:bg-green-500": sliderRiskValue[0] === 2,
              "[&>div>div]:bg-yellow-600 [&>div>div]:absolute [&>[role=slider]]:border-yellow-600 [&>[role=slider]]:bg-white [&_.absolute]:bg-yellow-600": sliderRiskValue[0] === 3,
              "[&>div>div]:bg-red-500 [&>div>div]:absolute [&>[role=slider]]:border-red-500 [&>[role=slider]]:bg-white [&_.absolute]:bg-red-500": sliderRiskValue[0] === 4,
              "[&>div>div]:bg-red-700 [&>div>div]:absolute [&>[role=slider]]:border-red-700 [&>[role=slider]]:bg-white [&_.absolute]:bg-red-700": sliderRiskValue[0] === 5
            })}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Prudent</span>
            <span>Agressif</span>
          </div>
        </div>
      </div>
    </div>
  );
};
