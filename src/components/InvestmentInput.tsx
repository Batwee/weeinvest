
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Euro, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "react-router-dom";

interface InvestmentInputProps {
  onChange: (value: number) => void;
  onCollapseChange?: (isCollapsed: boolean) => void;
}

export const InvestmentInput = ({ onChange, onCollapseChange }: InvestmentInputProps) => {
  const location = useLocation();
  const [value, setValue] = useState(() => {
    const amount = location.state?.preserveState ? location.state.amount : 0;
    return amount ? amount.toLocaleString('fr-FR') : "";
  });
  const [isCollapsed, setIsCollapsed] = useState(false);

  const formatValue = (val: string) => {
    const number = val.replace(/[^0-9]/g, "");
    if (number === "") return "";
    return new Intl.NumberFormat("fr-FR").format(parseInt(number));
  };

  const handleCalculate = () => {
    const numericValue = parseInt(value.replace(/[^0-9]/g, "")) || 0;
    if (numericValue > 0) {
      onChange(numericValue);
      setIsCollapsed(true);
      onCollapseChange?.(true);
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    onCollapseChange?.(!isCollapsed);
  };

  const isValidAmount = value !== "" && parseInt(value.replace(/[^0-9]/g, "")) > 0;

  return (
    <div className="w-full space-y-2 animate-in">
      <div className="flex items-center justify-between cursor-pointer" onClick={toggleCollapse}>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Montant de l'Investissement
          </label>
          {isCollapsed && value && (
            <span className="text-sm text-muted-foreground">
              ({new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
              }).format(parseInt(value.replace(/[^0-9]/g, "")) || 0)})
            </span>
          )}
        </div>
        <div className="p-1 hover:bg-accent rounded-full transition-colors">
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>
      {!isCollapsed && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              value={value}
              onChange={(e) => setValue(formatValue(e.target.value))}
              className="pr-10 focus-visible:ring-gray-400 focus-visible:ring-offset-gray-400"
              placeholder="0"
              required
              pattern="[0-9]*"
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValidAmount) {
                  e.preventDefault();
                  handleCalculate();
                }
              }}
            />
            <Euro className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          <Button
            onClick={handleCalculate}
            className="shrink-0"
            variant="secondary"
            disabled={!isValidAmount}
          >
            Calculer
          </Button>
        </div>
      )}
    </div>
  );
};
