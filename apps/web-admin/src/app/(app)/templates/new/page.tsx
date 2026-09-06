import { FormBuilderClient } from "@/components/form-builder/form-builder-client";
import { requireAdmin } from "@/lib/require-admin";

export default async function NewTemplatePage() {
  await requireAdmin();
  return (
    <FormBuilderClient
      templateName="Template Baru"
      templateVersion={1}
      initialFields={[]}
      initialIsActive={true}
    />
  );
}
