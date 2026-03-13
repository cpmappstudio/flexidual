// import { useTranslations } from "next-intl";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";
import { FlexidualLogo } from "@/components/ui/flexidual-logo";

export default function PendingRolePage() {
//   const t = useTranslations();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-lg border p-8 text-center space-y-6">
        <div className="flex justify-center mb-6">
          <FlexidualLogo />
        </div>
        
        <div className="bg-orange-100 dark:bg-orange-950/50 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-orange-600 dark:text-orange-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Access Pending</h1>
          <p className="text-muted-foreground text-sm">
            Your account has been created, but you have not been assigned to a campus or school yet. 
            Please contact your administrator to grant you access.
          </p>
        </div>

        <div className="pt-4 border-t">
          <SignOutButton>
            <Button variant="outline" className="w-full">
              <LogOut className="mr-2 w-4 h-4" />
              Sign Out
            </Button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}