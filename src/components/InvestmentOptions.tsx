
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface InvestmentOptionsProps {
  riskLevel: number;
  amount: number;
  eligibleInvestments: any[];
  onAssetDetailsClick?: (investmentId: number) => void;
}

export const InvestmentOptions = ({ riskLevel, amount, eligibleInvestments = [], onAssetDetailsClick }: InvestmentOptionsProps) => {
  const [expandedStates, setExpandedStates] = useState<boolean[]>(
    new Array(eligibleInvestments?.length || 0).fill(false)
  );

  return (
    <div className="glassmorphism rounded-xl p-6 space-y-4 animate-in">
      <div className="flex items-center gap-2">
        <Info className="w-5 h-5 text-primary" />
        <h3 className="font-medium">Options d'Investissement Disponibles</h3>
      </div>
      
      {eligibleInvestments.length > 0 ? (
        <div key="investment-list" className="mt-4 space-y-3">
          {[...eligibleInvestments]
            .sort((a, b) => b.value - a.value)
            .map((investment, index) => (
              <div
                key={`investment-${investment.id || index}`}
                className="p-3 bg-card rounded-lg border border-border relative cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  const newExpandedStates = [...expandedStates];
                  newExpandedStates[index] = !newExpandedStates[index];
                  setExpandedStates(newExpandedStates);
                }}
              >
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" 
                  style={{ backgroundColor: investment.color_invest || 'hsl(var(--primary))' }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">
                        {investment.name_invest} : {(investment.value || 0).toFixed(1)}%
                        <span className="text-sm text-muted-foreground ml-1">
                          ({((amount * (investment.value || 0)) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })})
                        </span>
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-green-600">APY: {investment.potential_return}%</span>
                        {expandedStates[index] ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    {expandedStates[index] && (
                      <div className="mt-2 space-y-2 animate-in fade-in-50">
                        <p className="text-sm text-muted-foreground">{investment.description}</p>
                        {investment.exemples && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Exemples :</span>
                            <p className="mt-1 ml-2">{investment.exemples}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (investment && typeof investment.id_invest === 'number') {
                                onAssetDetailsClick?.(investment.id_invest);
                              }
                            }}
                            className="px-3 py-1 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
                          >
                            Plus de Détails
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mt-4">
          Aucune option d'investissement disponible selon vos critères
        </p>
      )}
    </div>
  );
};
