
import { Slider } from "@/components/ui/slider";
import { useState, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

interface RiskSliderProps {
  onChange: (value: number) => void;
}

export const RiskSlider = ({ onChange }: RiskSliderProps) => {
  const [riskValue, setRiskValue] = useState([3]);
  const [riskIndicator, setRiskIndicator] = useState<"up" | "down">("up");

  useEffect(() => {
    onChange(riskValue[0]);
    setRiskIndicator(riskValue[0] > 3 ? "up" : "down");
  }, [riskValue, onChange]);

  return (
    <div className="w-full space-y-4 animate-in">
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
  );
};
