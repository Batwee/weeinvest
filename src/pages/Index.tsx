
import { useState } from "react";
import { RiskSlider } from "@/components/RiskSlider";
import { InvestmentInput } from "@/components/InvestmentInput";
import { AllocationChart } from "@/components/AllocationChart";
import { AssetDetails } from "@/components/AssetDetails";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

const Index = () => {
  const [riskLevel, setRiskLevel] = useState(5);
  const [amount, setAmount] = useState(0);
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-6 px-3">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              WeeInvest
            </h1>
            <p className="text-muted-foreground">
              Découvrez votre allocation d'actifs optimale
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        <div className="glassmorphism rounded-xl p-4 md:p-6">
          <AllocationChart riskLevel={riskLevel} amount={amount} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="glassmorphism rounded-xl p-4 md:p-6">
              <RiskSlider onChange={setRiskLevel} />
            </div>
            <div className="glassmorphism rounded-xl p-4 md:p-6">
              <InvestmentInput onChange={setAmount} />
            </div>
          </div>

          <AssetDetails riskLevel={riskLevel} />
        </div>
      </div>
    </div>
  );
};

export default Index;
