"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutBuilderClient } from "@/components/layout-builder/layout-builder-client";

import type { LayoutBlock, TaskTemplate, TemplateField } from "@/lib/types";

const ATTACHMENT_TYPES = ["photo", "file", "signed_document"];

function defaultBlocksFor(fields: TemplateField[]): LayoutBlock[] {
  const eligible = fields.filter(
    (f) => f.fieldType !== "section" && !ATTACHMENT_TYPES.includes(f.fieldType)
  );
  const signed = fields.find((f) => f.fieldType === "signed_document");
  return [
    {
      id: "hdr",
      type: "header",
      label: "Header Laporan",
      showLogo: true,
      companyName: "Born Citius",
      reportTitle: "Laporan Job Card",
      showReferenceNumber: true,
    },
    ...eligible.map((f, i) => ({
      id: `fld-${i}`,
      type: "field" as const,
      label: f.label,
      sourceFieldId: f.id,
      displayStyle: "stacked" as const,
    })),
    ...(signed
      ? [
          {
            id: "att",
            type: "attachment" as const,
            label: "Lampiran Dokumen Tertandatangani",
            sourceFieldId: signed.id,
          },
        ]
      : []),
    { id: "foot", type: "footer", label: "Footer", showPageNumber: true, footerNote: "" },
  ];
}

export function NewLayoutClient({
  templates,
}: {
  templates: Array<TaskTemplate & { fields: TemplateField[] }>;
}) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    return (
      <>
        <Topbar
          title="Buat Output Layout"
          description="Pilih template sumber — field-nya akan tersedia untuk disusun di layout ini"
        />
        <div className="flex flex-1 items-start justify-center p-4 md:p-6">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Template Sumber</Label>
                <Select onValueChange={setTemplateId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Satu layout merujuk ke satu template — field-field non-lampiran
                di template itu akan tersedia untuk disusun jadi tampilan output.
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <LayoutBuilderClient
      layoutName={`Layout Baru — ${template.name}`}
      sourceTemplate={template}
      initialBlocks={defaultBlocksFor(template.fields)}
    />
  );
}
