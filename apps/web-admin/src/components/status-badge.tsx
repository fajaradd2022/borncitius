import { cn } from "@/lib/utils";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/types";

const STATUS_STYLE: Record<TaskStatus, string> = {
  assigned: "bg-[oklch(0.7_0.15_250_/_0.15)] text-[oklch(0.4_0.15_250)]",
  in_progress: "bg-[oklch(0.75_0.18_70_/_0.18)] text-[oklch(0.42_0.14_70)]",
  submitted: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
  approved: "bg-[oklch(0.7_0.15_160_/_0.18)] text-[oklch(0.35_0.12_160)]",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLE[status]
      )}
    >
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}
