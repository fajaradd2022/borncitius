"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiGet, hasSession } from "./api";

interface State<T> {
  path: string | null;
  data?: T;
  error?: string;
}

/**
 * Ambil data API untuk sebuah halaman, sekaligus menjadi penjaga sesi:
 * tanpa token atau saat sesi ditolak server, pengguna diarahkan ke /masuk.
 *
 * `reload()` mengambil ulang tanpa mengosongkan data yang sedang tampil.
 */
export function useApiData<T>(path: string | null) {
  const router = useRouter();
  const [state, setState] = useState<State<T>>({ path: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    if (!hasSession()) {
      router.replace("/masuk");
      return;
    }

    let alive = true;
    apiGet<T>(path).then(
      (data) => {
        if (alive) setState({ path, data });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/masuk");
          return;
        }
        const message =
          err instanceof ApiError && err.status === 404
            ? "Data tidak ditemukan atau sudah tidak ditugaskan kepada Anda."
            : err instanceof Error
              ? err.message
              : "Terjadi kesalahan.";
        setState((prev) => ({ path, data: prev.path === path ? prev.data : undefined, error: message }));
      },
    );
    return () => {
      alive = false;
    };
  }, [path, version, router]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = state.path === path ? state : undefined;

  return { data: current?.data, error: current?.error, reload };
}
