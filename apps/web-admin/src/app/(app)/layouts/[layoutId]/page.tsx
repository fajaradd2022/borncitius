import { notFound } from "next/navigation";
import { LayoutBuilderClient } from "@/components/layout-builder/layout-builder-client";
import { apiGet, ApiError } from "@/lib/api/client";
import { toBuilderBlocks, type ApiLayout } from "@/lib/api/layout-mapper";
import type { TaskTemplate, TemplateField } from "@/lib/types";

export default async function LayoutEditPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const { layoutId } = await params;

  let layout: ApiLayout;
  let template: TaskTemplate & { fields: TemplateField[] };
  try {
    layout = await apiGet<ApiLayout>(`/layouts/${layoutId}`);
    template = await apiGet<TaskTemplate & { fields: TemplateField[] }>(
      `/templates/${layout.sourceTemplate.id}`,
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 500)) notFound();
    throw err;
  }

  return (
    <LayoutBuilderClient
      layoutId={layout.id}
      layoutName={layout.name}
      sourceTemplate={template}
      initialBlocks={toBuilderBlocks(layout.blocks)}
      initialIsDefault={layout.isDefault}
    />
  );
}
