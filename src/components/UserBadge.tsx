import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type UserBadgeProps = {
  compact?: boolean;
};

export const UserBadge = ({ compact = true }: UserBadgeProps) => {
  const { user } = useAuth();

  const metadata = user?.user_metadata ?? {};
  // Comptes Google : full_name / name + avatar_url (photo de profil)
  // Comptes email : repli sur l'adresse email
  const avatarUrl = metadata.avatar_url || metadata.picture;
  const displayName = metadata.full_name || metadata.name || user?.email;

  return (
    <div
      className={cn(
        "flex items-center gap-2 bg-white/40 backdrop-blur-md rounded-full shadow-sm border border-white/20",
        compact ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-xs"
      )}
    >
      {avatarUrl ? (
        <Avatar className={compact ? "h-4 w-4" : "h-5 w-5"}>
          <AvatarImage src={avatarUrl} alt={displayName ?? "Avatar"} />
          <AvatarFallback>
            <User className={compact ? "w-2.5 h-2.5 text-primary" : "w-3 h-3 text-primary"} />
          </AvatarFallback>
        </Avatar>
      ) : (
        <User className={compact ? "w-2.5 h-2.5 text-primary" : "w-3 h-3 text-primary"} />
      )}
      <span className={cn("font-semibold truncate", compact ? "max-w-[120px]" : "max-w-[150px]")}>
        {displayName}
      </span>
    </div>
  );
};
