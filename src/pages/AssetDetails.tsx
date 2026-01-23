import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useInvestments } from "@/hooks/useInvestments";
import { useState, useEffect } from "react";

export const AssetDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { investments } = useInvestments(0);
  const [assetDetails, setAssetDetails] = useState<any[]>([]);

  useEffect(() => {
    const ASSET_DETAILS_CACHE_KEY = 'weeinvest_asset_details';
    const cachedAssetDetails = localStorage.getItem(ASSET_DETAILS_CACHE_KEY);
    if (cachedAssetDetails) {
      const parsedAssetDetails = JSON.parse(cachedAssetDetails);
      const filteredAssets = parsedAssetDetails.filter((asset: any) => asset.id_invest === Number(id));
      setAssetDetails(filteredAssets);
    }
  }, [id]);

  const investment = investments.find(inv => inv.id_invest === Number(id));

  const handleNavigateBack = () => {
    navigate('/', {
      state: {
        ...location.state,
        preserveState: true,
        riskLevel: location.state?.riskLevel || 3,
        amount: location.state?.amount || 0,
        eligibleInvestments: location.state?.eligibleInvestments || [],
        isCollapsed: location.state?.isCollapsed || false
      }
    });
  };

  if (!investment) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-2">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={handleNavigateBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour
          </button>
          <div className="text-center">
            <p className="text-muted-foreground">Investissement non trouvé</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-2">
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={handleNavigateBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour
        </button>

        <div className="glassmorphism rounded-xl p-6 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{investment.name_invest}</h1>
            <div 
              className="w-20 h-1 rounded-full" 
              style={{ backgroundColor: investment.color_invest || 'hsl(var(--primary))' }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h2 className="text-lg font-medium">Détails de l'Investissement</h2>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Niveau de Risque:</span> {investment.risk_level}/5
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">APY:</span>{" "}
                  <span className="text-green-600">{investment.potential_return}%</span>
                </p>
                {investment.minimum_investment && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Investissement Minimum:</span>{" "}
                    {investment.minimum_investment.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-medium">Description</h2>
              <p className="text-sm text-muted-foreground">{investment.description}</p>
            </div>

            {investment.exemples && (
              <div className="space-y-2 md:col-span-2">
                <h2 className="text-lg font-medium">Exemples</h2>
                <p className="text-sm text-muted-foreground">{investment.exemples}</p>
              </div>
            )}

            {assetDetails.length > 0 && (
              <div className="space-y-2 md:col-span-2">
                <h2 className="text-lg font-medium">Actifs Disponibles</h2>
                <div className="space-y-3">
                  {assetDetails.map((asset, index) => (
                    <div
                      key={`asset-${asset.id || index}`}
                      className="p-4 bg-card rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-sm">{asset.name}</h3>
                          {asset.description && (
                            <p className="text-sm text-muted-foreground mt-1">{asset.description}</p>
                          )}
                        </div>
                        {asset.value && (
                          <span className="text-sm font-medium text-green-600">
                            {asset.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetDetails;