import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export const AuthCallback = () => {
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    const handleEmailVerification = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) throw error;

        if (user?.aud === 'authenticated') {
          setVerificationStatus('success');
          // Redirect to home page after a short delay
          setTimeout(() => navigate('/'), 2000);
        } else {
          setVerificationStatus('error');
        }
      } catch (error) {
        console.error('Error during email verification:', error);
        setVerificationStatus('error');
      }
    };

    handleEmailVerification();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-4 px-2">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">WeeInvest</h1>
          <div className="glassmorphism rounded-xl p-6 space-y-4">
            {verificationStatus === 'verifying' && (
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Vérification de votre email en cours...</p>
              </div>
            )}

            {verificationStatus === 'success' && (
              <div className="text-center">
                <div className="text-green-500 mb-4">
                  <svg
                    className="h-12 w-12 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-medium mb-2">Email vérifié avec succès !</h2>
                <p className="text-muted-foreground">Vous allez être redirigé vers la page d'accueil...</p>
              </div>
            )}

            {verificationStatus === 'error' && (
              <div className="text-center">
                <div className="text-red-500 mb-4">
                  <svg
                    className="h-12 w-12 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-medium mb-2">Erreur de vérification</h2>
                <p className="text-muted-foreground mb-4">
                  La vérification de votre email a échoué. Veuillez réessayer ou contacter le support.
                </p>
                <button
                  onClick={() => navigate('/auth')}
                  className="text-primary hover:underline"
                >
                  Retour à la page de connexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;