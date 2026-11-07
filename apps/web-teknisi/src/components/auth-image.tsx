"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { authedObjectUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * <img> untuk lampiran di API. Tag <img> tidak bisa mengirim header
 * Authorization, jadi berkas diambil lewat fetch ber-token lalu ditampilkan
 * sebagai object URL. URL blob:/data: (preview lokal) dipakai apa adanya.
 */
export function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const direct = src.startsWith("blob:") || src.startsWith("data:");
  const [loaded, setLoaded] = useState<{ src: string; url?: string; failed?: boolean } | null>(null);

  useEffect(() => {
    if (direct) return;
    let alive = true;
    authedObjectUrl(src).then(
      (url) => alive && setLoaded({ src, url }),
      () => alive && setLoaded({ src, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [src, direct]);

  const current = loaded?.src === src ? loaded : null;
  const url = direct ? src : current?.url;

  if (!url) {
    return (
      <span role="img" aria-label={alt} className={cn("flex items-center justify-center bg-muted", className, !current && "animate-pulse")}>
        {current?.failed && <ImageOff className="size-5 text-zinc-400" />}
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- object URL, bukan aset yang bisa dioptimasi next/image
  return <img src={url} alt={alt} className={className} />;
}
