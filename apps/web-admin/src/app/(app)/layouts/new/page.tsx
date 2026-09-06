import { NewLayoutClient } from "@/components/layout-builder/new-layout-client";
import { apiGet } from "@/lib/api/client";
import { requireAdmin } from "@/lib/require-admin";
import type { TaskTemplate, TemplateField } from "@/lib/types";

export default async function NewLayoutPage() {
  await requireAdmin();
  const list = await apiGet<Array<{ id: string; isActive: boolean }>>("/templates");

  // Builder butuh daftar field, sedangkan endpoint daftar sengaja ringan —
  // detail diambil hanya untuk template yang aktif.
  const templates = await Promise.all(
    list
      .filter((t) => t.isActive)
      .map((t) => apiGet<TaskTemplate & { fields: TemplateField[] }>(`/templates/${t.id}`)),
  );

  return <NewLayoutClient templates={templates} />;
}
