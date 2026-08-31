import { Zap } from "lucide-react";
import { LoginForm } from "./login-form";

export default function MasukPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-white">
          <Zap className="size-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Born Citius Teknisi</h1>
          <p className="text-sm text-zinc-500">Masuk untuk melihat tugas Anda</p>
        </div>
      </div>
      <LoginForm />
    </main>
  );
}
