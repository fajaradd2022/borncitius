import { FormBuilderClient } from "@/components/form-builder/form-builder-client";

export default function NewTemplatePage() {
  return (
    <FormBuilderClient
      templateName="Template Baru"
      templateVersion={1}
      initialFields={[]}
      initialIsActive={true}
    />
  );
}
