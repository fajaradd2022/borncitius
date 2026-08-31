"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/api/auth-actions";

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
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

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
