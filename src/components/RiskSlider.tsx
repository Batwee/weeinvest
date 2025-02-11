
import { Slider } from "@/components/ui/slider";
import { useState, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

interface RiskSliderProps {
  onChange: (value: number) => void;
}

export const RiskSlider = ({ onChange }: RiskSliderProps) => {
  const [complexityValue, setComplexityValue] = useState([3]);
  const [riskValue, setRiskValue] = useState([3]);
  const [complexityIndicator, setComplexityIndicator] = useState<"up" | "down">("up");
  const [riskIndicator, setRiskIndicator] = useState<"up" | "down">("up");

  useEffect(() => {
    // On utilise la moyenne des deux valeurs pour maintenir la compatibilité
    const averageValue = Math.round((complexityValue[0] + riskValue[0]) / 2);
    onChange(averageValue);
    setComplexityIndicator(complexityValue[0] > 3 ? "up" : "down");
    setRiskIndicator(riskValue[0] > 3 ? "up" : "down");
  }, [complexityValue, riskValue, onChange]);

  return (
    <div className="w-full space-y-4 animate-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Slider de complexité */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">
              Complexité d'investissement
            </label>
            <div className="flex items-center gap-2">
              {complexityIndicator === "up" ? (
                <ArrowUp className="w-4 h-4 text-primary" />
              ) : (
                <ArrowDown className="w-4 h-4 text-primary" />
              )}
              <span className="text-sm font-medium">{complexityValue}/ 5</span>
            </div>
          </div>
          <Slider
            max={5}
            min={1}
            step={1}
            value={complexityValue}
            onValueChange={setComplexityValue}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Simple</span>
            <span>Complexe</span>
          </div>
        </div>

        {/* Slider de risque */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">
              Niveau de risque
            </label>
            <div className="flex items-center gap-2">
              {riskIndicator === "up" ? (
                <ArrowUp className="w-4 h-4 text-primary" />
              ) : (
                <ArrowDown className="w-4 h-4 text-primary" />
              )}
              <span className="text-sm font-medium">{riskValue}/ 5</span>
            </div>
          </div>
          <Slider
            max={5}
            min={1}
            step={1}
            value={riskValue}
            onValueChange={setRiskValue}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Prudent</span>
            <span>Agressif</span>
          </div>
        </div>
      </div>
    </div>
  );
};
