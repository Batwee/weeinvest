
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { DollarSign } from "lucide-react";

interface InvestmentInputProps {
  onChange: (value: number) => void;
  value?: number;
}

export const InvestmentInput = ({ onChange, value: initialValue }: InvestmentInputProps) => {
  const formatValue = (val: string | number) => {
    const numberStr = typeof val === "string" ? val.replace(/[^0-9]/g, "") : val.toString();
    if (numberStr === "" || isNaN(parseInt(numberStr))) return "";
    return new Intl.NumberFormat("fr-FR").format(parseInt(numberStr));
  };

  const [value, setValue] = useState(initialValue ? formatValue(initialValue) : "");

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
