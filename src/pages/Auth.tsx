import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(true);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) {
          if (error.message.includes('Password should be at least')) {
            throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
          }
          throw error;
        }

        if (data?.user?.identities?.length === 0) {
          // Try to sign in with the provided credentials
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (!signInError) {
            // If sign in successful, redirect to home
            navigate("/");
            return;
          }

          // If sign in failed, show the existing account message
          setIsSignUp(false);
          toast({
            title: "Compte existant",
            description: "Ce compte existe déjà, veuillez vous connecter.",
          });
          return;
        }

        setIsSignUp(false);
        toast({
          title: "Inscription réussie",
          description: "Veuillez vérifier votre boîte mail (y compris les spams) pour confirmer votre compte.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Email ou mot de passe incorrect.');
          } else if (error.message.includes('Email not confirmed')) {
            throw new Error('Veuillez confirmer votre email avant de vous connecter.');
          }
          throw error;
        }

        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "Erreur d'authentification",
        description: error.message || "Une erreur est survenue lors de l'authentification.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-2">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">WeeInvest</h1>
          <p className="text-muted-foreground">
            {isSignUp ? "Créez votre compte" : "Connectez-vous"}
          </p>
        </div>

        <div className="glassmorphism rounded-xl p-6 space-y-6">
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                "Chargement..."
              ) : isSignUp ? (
                "S'inscrire"
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
          </div>

          <div className="text-center text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp
                ? "Déjà un compte ? Connectez-vous"
                : "Pas de compte ? Inscrivez-vous"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;