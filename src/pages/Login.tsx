
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

const Login = () => {
  const { signIn, isLoading } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/20">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">WeeInvest</h2>
          <p className="text-muted-foreground mt-2">
            Connectez-vous pour accéder à vos investissements
          </p>
        </div>

        <Button
          className="w-full"
          onClick={signIn}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Se connecter
        </Button>
      </div>
    </div>
  );
};

export default Login;
