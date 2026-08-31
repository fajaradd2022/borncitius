import { Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-5" />
          </div>
          <CardTitle className="text-xl">Masuk ke Born Citius</CardTitle>
          <CardDescription>Dashboard Admin &amp; SPV</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Lupa password? Hubungi Admin sistem.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
