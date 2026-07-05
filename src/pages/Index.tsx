
import { useState, useEffect } from "react";
import { RiskSlider } from "@/components/RiskSlider";
import { InvestmentInput } from "@/components/InvestmentInput";
import { AllocationChart } from "@/components/AllocationChart";
import { AllocationSummary } from "@/components/AllocationSummary";
import { useInvestments } from "@/hooks/useInvestments";
import { 
  Gauge, 
  TrendingUp, 
  AlertTriangle, 
  LogOut, 
  User, 
  BarChart3, 
  TrendingUp as TrendUp, 
  ChevronDown, 
  ChevronUp,
  Settings2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";

const Index = () => {
  const [riskLevel, setRiskLevel] = useState(3);
  const [amount, setAmount] = useState(10000);
  const [isParamsExpanded, setIsParamsExpanded] = useState(false);
  const { investments } = useInvestments(riskLevel);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    if (riskLevel === 5) {
      toast({
        title: "Risque Maximal",
        description: "Attention : stratégie à haut risque activée.",
        variant: "destructive",
        duration: 2000,
      });
    }
  }, [riskLevel, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-3">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
          <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-primary via-purple-500 to-indigo-600 bg-clip-text text-transparent">
            WeeInvest
          </h1>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white/40 backdrop-blur-md rounded-full shadow-sm text-[10px] border border-white/20">
              <User className="w-2.5 h-2.5 text-primary" />
              <span className="font-semibold truncate max-w-[120px]">{user?.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full bg-white/40 hover:bg-white/60 shadow-sm border border-white/20 h-7 w-7">
              <LogOut className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className={`glassmorphism rounded-2xl shadow-xl border border-white/20 overflow-hidden ${isParamsExpanded ? 'pb-6' : 'pb-1'}`}>
              <button 
                onClick={() => setIsParamsExpanded(!isParamsExpanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-white/20 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform">
                    <Settings2 className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-base font-bold">Paramètres</h3>
                </div>
                <div className="flex items-center gap-4">
                  {!isParamsExpanded && (
                    <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground bg-white/20 px-3 py-1 rounded-full border border-white/10">
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-orange-500" />
                        <span>R{riskLevel}</span>
                      </div>
                      <div className="w-px h-3 bg-white/20" />
                      <span>
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0
                        }).format(amount)}
                      </span>
                    </div>
                  )}
                  {isParamsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>
              
              <div className={`px-6 space-y-6 transition-all duration-300 ease-in-out ${isParamsExpanded ? 'opacity-100 max-h-[500px] border-t border-white/10 pt-6' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                <RiskSlider onChange={setRiskLevel} />
                <InvestmentInput onChange={setAmount} value={amount} />
              </div>
            </div>
            
            <div className="glassmorphism rounded-2xl p-2 shadow-xl border border-white/20">
              <AllocationChart riskLevel={riskLevel} amount={amount} />
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="glassmorphism rounded-2xl p-4 shadow-xl border border-white/20 min-h-[400px]">
              <AllocationSummary riskLevel={riskLevel} amount={amount} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
