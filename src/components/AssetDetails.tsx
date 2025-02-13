
import { Info } from "lucide-react";
import { useInvestments } from "@/hooks/useInvestments";

interface AssetDetailsProps {
  riskLevel: number;
}

export const AssetDetails = ({ riskLevel }: AssetDetailsProps) => {
  const { investments, loading, error } = useInvestments(riskLevel);

  return (
    <div className="glassmorphism rounded-xl p-6 space-y-4 animate-in">
      <div className="flex items-center gap-2">
        <Info className="w-5 h-5 text-primary" />
        <h3 className="font-medium">Options d'investissement disponibles</h3>
      </div>
      
      {error && (
        <p className="text-sm text-destructive">
          Erreur de chargement des investissements
        </p>
      )}
      
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : (
        <div className="mt-4 space-y-3">
          {investments.map((investment) => (
            <div
              key={investment.id}
              className="p-3 bg-card rounded-lg border border-border"
            >
              <h4 className="font-medium">{investment.name_invest}</h4>
              <p className="text-sm text-muted-foreground">
                {investment.description}
              </p>
              <p className="text-sm mt-1 text-muted-foreground">
                Type: {investment.type}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
