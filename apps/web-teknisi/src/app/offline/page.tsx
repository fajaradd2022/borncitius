import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline — Born Citius Teknisi" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <CloudOff className="size-14 text-zinc-300" />
      <h1 className="text-xl font-bold">Tidak ada koneksi</h1>
      <p className="max-w-xs text-sm text-zinc-500">
        Halaman ini belum tersimpan di perangkat. Isian dan foto yang sudah Anda
        buat tetap aman dan akan terkirim otomatis begitu sinyal kembali.
      </p>
      <p className="text-xs text-zinc-400">
        Buka kembali halaman ini saat sudah ada sinyal.
      </p>
    </main>
  );
}
