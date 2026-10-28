import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInvestments } from "@/hooks/useInvestments";
import { getApiKey } from "@/lib/supabase";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const isRequestedToday = (symbol: string) => {
  const cachedData = localStorage.getItem('alphavantage_data');
  if (!cachedData) return false;

  try {
    const data = JSON.parse(cachedData);
    const symbolData = data[symbol];
    if (!symbolData?.requestDate) return false;

    const requestDate = new Date(symbolData.requestDate).toDateString();
    const today = new Date().toDateString();
    return requestDate === today;
  } catch (error) {
    console.error('Error checking request date:', error);
    return false;
  }
};

interface AssetDetailsModalProps {
  investmentId: number | null;
  onClose: () => void;
}

export const AssetDetailsModal = ({ investmentId, onClose }: AssetDetailsModalProps) => {
  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const { investments } = useInvestments(selectedInvestment?.risk_level || 3);
  const [assetDetails, setAssetDetails] = useState<any[]>([]);
  const [loadingRSI, setLoadingRSI] = useState<{ [key: string]: boolean }>({});
  const [alphavantageData, setAlphavantageData] = useState<{ [key: string]: { rsi: string; lastRefreshDate: string; requestDate: string } }>({});

  useEffect(() => {
    if (investmentId !== null) {
      const ASSET_DETAILS_CACHE_KEY = 'weeinvest_asset_details';
      const INVESTMENTS_CACHE_KEY = 'weeinvest_investments';
      const ALPHAVANTAGE_CACHE_KEY = 'alphavantage_data';
      
      // First, get the selected investment's risk level
      const cachedInvestments = localStorage.getItem(INVESTMENTS_CACHE_KEY);
      if (cachedInvestments) {
        try {
          const parsedInvestments = JSON.parse(cachedInvestments);
          const investment = parsedInvestments.find((inv: any) => inv.id_invest === investmentId);
          setSelectedInvestment(investment);
        } catch (error) {
          console.error('Error parsing investments:', error);
        }
      }

      // Then, get the asset details and merge with cached RSI data
      const cachedAssetDetails = localStorage.getItem(ASSET_DETAILS_CACHE_KEY);
      const cachedRSIData = localStorage.getItem(ALPHAVANTAGE_CACHE_KEY);
      let parsedRSIData = {};

      if (cachedRSIData) {
        try {
          parsedRSIData = JSON.parse(cachedRSIData);
        } catch (error) {
          console.error('Error parsing RSI data:', error);
        }
      }

      if (cachedAssetDetails) {
        try {
          const parsedAssetDetails = JSON.parse(cachedAssetDetails);
          const filteredAssets = parsedAssetDetails.filter((asset: any) => {
            if (!asset) return false;
            const assetInvestId = asset.id_invest !== undefined ? Number(asset.id_invest) : null;
            const targetInvestId = Number(investmentId);
            return assetInvestId !== null && !isNaN(targetInvestId) && assetInvestId === targetInvestId;
          }).map(asset => ({
            ...asset,
            id_invest: Number(asset.id_invest),
            rsi: asset.alphavantage && parsedRSIData[asset.alphavantage]?.rsi
          }));
          setAssetDetails(filteredAssets);
          if (parsedRSIData) {
            setAlphavantageData(parsedRSIData);
          }
        } catch (error) {
          console.error('Error parsing asset details:', error);
          setAssetDetails([]);
        }
      }
    } else {
      setAssetDetails([]);
      setSelectedInvestment(null);
    }
  }, [investmentId]);

  const investment = investments.find(inv => inv.id_invest === investmentId);

  const fetchRSI = async (symbol: string, assetId: string | number) => {
    if (!symbol) return;
    
    setLoadingRSI(prev => ({ ...prev, [assetId]: true }));
    
    try {
      const apiKey = await getApiKey('alphavantage');
      if (!apiKey) {
        console.error('Aucune clé API Alpha Vantage trouvée pour cet utilisateur');
        return;
      }

      const requestUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=weekly&time_period=10&series_type=open&apikey=${apiKey}`;
      console.log('Fetching RSI for symbol:', symbol);
      console.log('Request URL:', requestUrl);
      
      const response = await fetch(requestUrl);
      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data['Technical Analysis: RSI']) {
        const latestDate = Object.keys(data['Technical Analysis: RSI'])[0];
        const latestRSI = data['Technical Analysis: RSI'][latestDate].RSI;
        const currentDate = new Date().toISOString();

        // Update alphavantage data in state and localStorage
        const newData = {
          ...alphavantageData,
          [symbol]: {
            rsi: Number(latestRSI).toFixed(2),
            lastRefreshDate: latestDate,
            requestDate: currentDate
          }
        };
        setAlphavantageData(newData);
        localStorage.setItem('alphavantage_data', JSON.stringify(newData));
        
        // Update asset details with RSI
        setAssetDetails(prev =>
          prev.map(asset =>
            asset.id === assetId || asset.alphavantage === symbol
              ? { ...asset, rsi: Number(latestRSI).toFixed(2) }
              : asset
          )
        );
      } else {
        console.log('No RSI data found in response');
      }
    } catch (error) {
      console.error('Error fetching RSI:', error);
    } finally {
      setLoadingRSI(prev => ({ ...prev, [assetId]: false }));
    }
  };

  if (!investment) return null;

  return (
    <Sheet open={!!investmentId} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-background">
        <SheetHeader className="space-y-6">
          <div className="space-y-2">
            <SheetTitle className="text-2xl font-semibold tracking-tight">{investment.name_invest}</SheetTitle>
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
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm">
                              {asset.name}
                              {asset.name_asset && ` ${asset.name_asset}`}
                              {asset.alphavantage && ` (${asset.alphavantage})`}
                            </h3>
                            <div className="flex items-center gap-3">
                              {asset.alphavantage && !isRequestedToday(asset.alphavantage) && (
                                <button
                                  onClick={() => fetchRSI(asset.alphavantage, asset.id || index)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
                                  disabled={loadingRSI[asset.id || index]}
                                >
                                  {loadingRSI[asset.id || index] ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    'Get RSI'
                                  )}
                                </button>
                              )}
                              {asset.rsi && (
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium">RSI:</span> {asset.rsi}
                                </p>
                              )}
                              {asset.market_cap && (
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium">Market Cap:</span>{" "}
                                  {(typeof asset.market_cap === 'string' ? parseFloat(asset.market_cap.replace(/[^0-9.-]/g, '')) : asset.market_cap)?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </p>
                              )}
                            </div>
                          </div>
                          {asset.description && (
                            <p className="text-sm text-muted-foreground mt-1">{asset.description}</p>
                          )}
                        </div>
                        {asset.value && (
                          <span className="text-sm font-medium text-green-600 ml-4">
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
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
};