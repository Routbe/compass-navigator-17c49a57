import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReferralPanel } from "@/components/dashboard/ReferralPanel";

/** Header-actie voor ingelogde leden: uitnodigingslink + beloningsvoortgang in een modal. */
export function InviteButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" aria-label={t("ui.invite")}>
          <UserPlus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("ui.invite")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ui.inviteFriends")}</DialogTitle>
          <DialogDescription>
            {t("ui.inviteDescription")}
          </DialogDescription>
        </DialogHeader>
        <ReferralPanel />
      </DialogContent>
    </Dialog>
  );
}
