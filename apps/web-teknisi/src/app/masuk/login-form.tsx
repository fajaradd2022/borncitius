"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { hasSession, login } from "@/lib/api";

interface LoginState {
  error?: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white active:opacity-90 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-5 animate-spin" />}
      {pending ? "Memproses…" : "Masuk"}
    </button>
  );
}

export function LoginForm() {
  const router = useRouter();

  useEffect(() => {
    if (hasSession()) router.replace("/");
  }, [router]);

  const [state, formAction] = useActionState<LoginState, FormData>(async (_prev, formData) => {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) return { error: "Email dan password wajib diisi." };
    try {
      await login(email, password);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Login gagal. Coba lagi." };
    }
    router.replace("/");
    return {};
  }, {});

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {state.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email" type="email" autoComplete="email" required
          placeholder="nama@borncitius.id"
          className="h-14 rounded-xl border border-border px-4 outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password" type="password" autoComplete="current-password" required
          placeholder="••••••••"
          className="h-14 rounded-xl border border-border px-4 outline-none focus:border-primary"
        />
      </label>
      <SubmitButton />
    </form>
  );
}
