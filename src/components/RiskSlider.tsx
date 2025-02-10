
import { Slider } from "@/components/ui/slider";
import { useState, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

interface RiskSliderProps {
  onChange: (value: number) => void;
}

export const RiskSlider = ({ onChange }: RiskSliderProps) => {
  const [value, setValue] = useState([5]);
  const [indicator, setIndicator] = useState<"up" | "down">("up");

  useEffect(() => {
    onChange(value[0]);
    setIndicator(value[0] > 5 ? "up" : "down");
  }, [value, onChange]);

  return (
    <div className="w-full space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">
          Niveau de risque
        </label>
        <div className="flex items-center gap-2">
          {indicator === "up" ? (
            <ArrowUp className="w-4 h-4 text-primary" />
          ) : (
            <ArrowDown className="w-4 h-4 text-primary" />
          )}
          <span className="text-sm font-medium">{value}/ 10</span>
        </div>
      </div>
      <Slider
        max={10}
        step={1}
        value={value}
        onValueChange={setValue}
        className="cursor-pointer"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Prudent</span>
        <span>Agressif</span>
      </div>
    </div>
  );
};
