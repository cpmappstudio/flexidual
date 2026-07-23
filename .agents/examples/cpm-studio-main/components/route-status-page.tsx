import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RouteStatusPageProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function RouteStatusPage({
  title,
  description,
  children,
}: RouteStatusPageProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6 md:p-10">
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader className="text-center">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? (
          <CardFooter className="justify-center gap-3 pt-0">{children}</CardFooter>
        ) : (
          <CardContent />
        )}
      </Card>
    </main>
  );
}
