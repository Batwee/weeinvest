
import { Info } from "lucide-react";

interface AssetDetailsProps {
  riskLevel: number;
}

export const AssetDetails = ({ riskLevel }: AssetDetailsProps) => {
  const getDetails = () => {
    if (riskLevel <= 3) {
      return {
        title: "Profil Prudent",
        description:
          "Cette allocation privilégie la sécurité avec une forte proportion d'obligations et de liquidités. Idéal pour les investisseurs cherchant à préserver leur capital.",
      };
    } else if (riskLevel <= 7) {
      return {
        title: "Profil Équilibré",
        description:
          "Un mix équilibré entre croissance et sécurité. Cette allocation convient aux investisseurs acceptant une volatilité modérée pour un potentiel de rendement accru.",
      };
    } else {
      return {
        title: "Profil Dynamique",
        description:
          "Orientation vers la croissance avec une part importante d'actions. Cette allocation convient aux investisseurs acceptant une forte volatilité pour un potentiel de rendement élevé.",
      };
    }
  };

  const details = getDetails();

  return (
    <div className="glassmorphism rounded-xl p-6 space-y-4 animate-in">
      <div className="flex items-center gap-2">
        <Info className="w-5 h-5 text-primary" />
        <h3 className="font-medium">{details.title}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {details.description}
      </p>
    </div>
  );
};
