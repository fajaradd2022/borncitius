import { AlertCircle, Loader2 } from "lucide-react";

export function PageLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-20" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-zinc-300" />
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <AlertCircle className="size-12 text-zinc-300" />
      <p className="max-w-xs text-sm text-zinc-500">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-11 rounded-xl border border-border px-5 text-sm font-semibold active:bg-muted"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}
