
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RiskSlider } from "@/components/RiskSlider";
import { InvestmentInput } from "@/components/InvestmentInput";
import { AllocationChart } from "@/components/AllocationChart";
import { InvestmentOptions } from "@/components/InvestmentOptions";
import { AssetDetailsModal } from "@/components/AssetDetailsModal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [riskLevel, setRiskLevel] = useState(() => {
    return location.state?.preserveState ? location.state.riskLevel : 3;
  });
  const [amount, setAmount] = useState(() => {
    return location.state?.preserveState ? location.state.amount : 0;
  });
  const [eligibleInvestments, setEligibleInvestments] = useState<any[]>(() => {
    return location.state?.preserveState ? location.state.eligibleInvestments : [];
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return location.state?.preserveState ? location.state.isCollapsed : false;
  });
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<number | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        localStorage.removeItem('weeinvest_investments');
        localStorage.removeItem('weeinvest_asset_details');
        localStorage.removeItem('alphavantage_data');
        navigate('/auth', { replace: true });
      }
    };

    checkSession();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem('weeinvest_investments');
      localStorage.removeItem('weeinvest_asset_details');
      localStorage.removeItem('alphavantage_data');
      
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Error during logout:', error);
      // If error occurs, still redirect to auth page
      navigate('/auth', { replace: true });
    }
  };

  const ImportantInfo = () => (
    <div className="glassmorphism rounded-xl p-4 md:p-6 text-sm text-muted-foreground space-y-2">
      <h3 className="font-medium text-foreground mb-3">Informations Importantes</h3>
      <p>
        Les données présentées sur cette plateforme (APY et niveaux de risque) sont purement illustratives et générées pour des besoins de démonstration.
      </p>
      <p>
        ⚠️ <span className="font-medium">Avertissement sur les Risques :</span> Tout investissement comporte des risques, y compris la possibilité de perte partielle ou totale du capital investi.
      </p>
      <p>
        Les répartitions d'actifs et les niveaux de risque suggérés sont uniquement indicatifs et ne constituent en aucun cas des conseils en investissement. Ces données sont générées à des fins de test et ne reflètent pas la réalité du marché.
      </p>
    </div>
  );

  const handleAssetDetailsClick = (investmentId: number) => {
    setSelectedInvestmentId(investmentId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-2">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            WeeInvest
          </h1>
          <p className="text-muted-foreground">
            Découvrez votre allocation d'actifs optimale
          </p>
        </div>

        <div className="glassmorphism rounded-lg p-3 md:p-4 shadow-sm space-y-4">
          <InvestmentInput onChange={setAmount} onCollapseChange={setIsCollapsed} />
          <div className={`transition-all duration-500 ease-in-out transform ${amount > 0 ? 'scale-95 opacity-90' : 'scale-100 opacity-100'}`}>
            <RiskSlider onChange={setRiskLevel} amount={amount} isCollapsed={isCollapsed} />
          </div>
        </div>

        {!amount && <ImportantInfo />}

        <div className={`glassmorphism rounded-lg p-3 md:p-4 shadow-sm transition-all duration-500 ease-in-out ${amount > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <AllocationChart 
            riskLevel={riskLevel} 
            amount={amount} 
            onInvestmentsChange={setEligibleInvestments}
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <InvestmentOptions 
            riskLevel={riskLevel} 
            amount={amount} 
            eligibleInvestments={eligibleInvestments}
            onAssetDetailsClick={handleAssetDetailsClick}
          />
        </div>

        {amount > 0 && <ImportantInfo />}

        <AssetDetailsModal 
          investmentId={selectedInvestmentId}
          onClose={() => setSelectedInvestmentId(null)}
        />

        <div className="flex justify-center mt-8">
          <Button 
            variant="secondary" 
            className="glassmorphism" 
            onClick={handleLogout}
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
