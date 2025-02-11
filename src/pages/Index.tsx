
import { useState, useEffect } from "react";
import { RiskSlider } from "@/components/RiskSlider";
import { InvestmentInput } from "@/components/InvestmentInput";
import { AllocationChart } from "@/components/AllocationChart";
import { AssetDetails } from "@/components/AssetDetails";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [riskLevel, setRiskLevel] = useState(5);
  const [amount, setAmount] = useState(0);
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) console.log('Error logging in:', error.message);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.log('Error logging out:', error.message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-6 px-3">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            WeeInvest
          </h1>
          <p className="text-muted-foreground">
            Découvrez votre allocation d'actifs optimale
          </p>
          <div className="mt-4">
            {!session ? (
              <button
                onClick={handleLogin}
                className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Se connecter avec Google
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="bg-destructive text-white px-4 py-2 rounded-lg hover:bg-destructive/90 transition-colors"
              >
                Se déconnecter
              </button>
            )}
          </div>
        </div>

        {session && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
