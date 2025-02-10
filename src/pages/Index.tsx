
import { useState } from "react";
import { RiskSlider } from "@/components/RiskSlider";
import { InvestmentInput } from "@/components/InvestmentInput";
import { AllocationChart } from "@/components/AllocationChart";
import { AssetDetails } from "@/components/AssetDetails";

const Index = () => {
  const [riskLevel, setRiskLevel] = useState(5);
  const [amount, setAmount] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Simulateur d'Investissement
          </h1>
          <p className="text-muted-foreground">
            Découvrez votre allocation d'actifs optimale
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="glassmorphism rounded-xl p-6">
              <RiskSlider onChange={setRiskLevel} />
            </div>
            <div className="glassmorphism rounded-xl p-6">
              <InvestmentInput onChange={setAmount} />
            </div>
          </div>

          <div className="glassmorphism rounded-xl p-6">
            <AllocationChart riskLevel={riskLevel} amount={amount} />
          </div>
        </div>

        <AssetDetails riskLevel={riskLevel} />
      </div>
    </div>
  );
};

export default Index;
