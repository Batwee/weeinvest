
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { DollarSign } from "lucide-react";

interface InvestmentInputProps {
  onChange: (value: number) => void;
}

export const InvestmentInput = ({ onChange }: InvestmentInputProps) => {
  const [value, setValue] = useState("");

  const formatValue = (val: string) => {
    const number = val.replace(/[^0-9]/g, "");
    if (number === "") return "";
    return new Intl.NumberFormat("fr-FR").format(parseInt(number));
  };

  useEffect(() => {
    const numericValue = parseInt(value.replace(/[^0-9]/g, "")) || 0;
    onChange(numericValue);
  }, [value, onChange]);

  return (
    <div className="w-full space-y-2 animate-in">
      <label className="text-sm font-medium text-muted-foreground">
        Montant à investir
      </label>
      <div className="relative">
        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(formatValue(e.target.value))}
          className="pl-10 input-focus-ring"
          placeholder="0"
        />
      </div>
    </div>
  );
};
