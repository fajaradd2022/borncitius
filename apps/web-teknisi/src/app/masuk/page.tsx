import Image from "next/image";
import { LoginForm } from "./login-form";

export default function MasukPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/logo.png" alt="Logo BC Teknisi" width={64} height={64} priority className="size-16" />
        <div>
          <h1 className="text-xl font-bold">Born Citius Teknisi</h1>
          <p className="text-sm text-zinc-500">Masuk untuk melihat tugas Anda</p>
        </div>
      </div>
      <LoginForm />
    </main>
  );
}
