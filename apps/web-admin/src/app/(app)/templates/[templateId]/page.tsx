import { notFound } from "next/navigation";
import { FormBuilderClient } from "@/components/form-builder/form-builder-client";
import { apiGet, ApiError } from "@/lib/api/client";
import { requireAdmin } from "@/lib/require-admin";
import type { TemplateField } from "@/lib/types";

interface ApiTemplate {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  fields: TemplateField[];
}

export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requireAdmin();
  const { templateId } = await params;

  // Pengambilan data dan render dipisah: JSX di dalam try/catch tidak akan
  // menangkap error rendering, dan bisa menyembunyikan bug tak terduga.
  let template: ApiTemplate;
  try {
    template = await apiGet<ApiTemplate>(`/templates/${templateId}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 500)) notFound();
    throw err;
  }

  return (
    <FormBuilderClient
      templateId={template.id}
      templateName={template.name}
      templateVersion={template.version}
      initialFields={template.fields}
      initialIsActive={template.isActive}
    />
  );
}
