// Tipe data inti Born Citius — Admin Web
// Cermin dari ERD di prd.md (Bagian 7). Dipakai bersama mock data selama
// backend NestJS belum ada; field & nama sengaja disamakan dengan ERD supaya
// gampang dipetakan ke API/DTO nanti.

export type Role = "admin" | "spv" | "teknisi";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  clientName: string;
  defaultReviewerId: string;
  createdBy: string;
  createdAt: string;
  // Override Output Layout per Template khusus untuk folder/klien ini —
  // pola sama seperti reviewer override (default di Template, override di
  // Folder). Key = TaskTemplate.id, value = OutputLayout.id.
  layoutOverrides?: Record<string, string>;
}

export type TaskStatus =
  | "assigned"
  | "in_progress"
  | "submitted"
  | "rejected"
  | "approved";

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "textarea"
  | "photo"
  | "file"
  | "signed_document"
  | "gps"
  | "section"
  | "repeat_table";

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date/Time",
  dropdown: "Dropdown",
  radio: "Radio Button",
  checkbox: "Checkbox",
  textarea: "Textarea",
  photo: "Upload Foto",
  file: "Upload File",
  signed_document: "Upload Dokumen Tanda Tangan Fisik",
  gps: "GPS Auto-Capture",
  section: "Section/Header",
  repeat_table: "Tabel Baris Berulang",
};

export interface TemplateField {
  id: string;
  label: string;
  fieldType: FieldType;
  options?: string[];
  isRequired: boolean;
  section: string;
  orderIndex: number;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  version: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  fields: TemplateField[];
}

export type ReviewStatus = "pending" | "approved" | "rejected";

export type AttachmentType =
  | "photo_taken"
  | "photo_uploaded"
  | "file_uploaded"
  | "signed_document";

export interface Attachment {
  id: string;
  type: AttachmentType;
  fileUrl: string;
  watermark?: {
    timestamp: string;
    gps: string;
    teknisiName: string;
  };
  syncStatus: "pending" | "synced" | "failed";
  capturedAt: string;
}

export interface TaskInstanceField extends TemplateField {
  value: string | null;
  reviewStatus: ReviewStatus;
  rejectComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  lastEditedBy?: string;
  lastEditedAt?: string;
  attachments?: Attachment[];
}

export interface TaskInstance {
  id: string;
  folderId: string;
  templateId: string;
  templateVersionSnapshot: number;
  assignedTeknisiId: string;
  reviewerOverrideId?: string;
  status: TaskStatus;
  dueDate: string;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
  fields: TaskInstanceField[];
}

// --- Output Layout (PRD 9 — editor layout export PDF dinamis) ---
// Layout adalah entity terpisah dari TaskTemplate (bukan 1:1) supaya satu
// template bisa punya beberapa tampilan output berbeda untuk klien berbeda.
// Tiap Layout tetap merujuk ke satu Template sebagai sumber daftar field.

export type LayoutBlockType =
  | "text" // teks statis: judul/paragraf, dengan formatting
  | "image" // logo/gambar statis
  | "field" // satu field dari template
  | "field-grid" // beberapa field jadi grid label:value
  | "table" // tabel: statis, atau dari field repeat_table
  | "photo-page" // halaman foto: field foto + caption + header box
  | "attachment" // merge scan/PDF dari field signed_document — posisi bebas
  | "page-break"
  | "header"
  | "footer";

export const BLOCK_TYPE_LABEL: Record<LayoutBlockType, string> = {
  text: "Teks",
  image: "Gambar/Logo",
  field: "Field",
  "field-grid": "Grid Field",
  table: "Tabel",
  "photo-page": "Halaman Foto",
  attachment: "Lampiran Scan",
  "page-break": "Pemisah Halaman",
  header: "Header",
  footer: "Footer",
};

export type FieldDisplayStyle = "stacked" | "table-row" | "inline";

export interface BorderStyle {
  outer: boolean;
  inner: boolean;
  width: 1 | 2;
  color: string;
}

export const DEFAULT_BORDER: BorderStyle = {
  outer: true,
  inner: true,
  width: 1,
  color: "#000000",
};

export interface TextStyle {
  fontSize: "sm" | "base" | "lg" | "xl" | "2xl";
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  color?: string;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: "base",
  bold: false,
  italic: false,
  align: "left",
};

export interface TableColumn {
  id: string;
  header: string;
  width?: number; // proporsi lebar (flex-grow), kosong = rata
}

export interface LayoutBlock {
  id: string;
  type: LayoutBlockType;
  label: string;

  // Dipakai lintas blok teks/tabel/foto
  textStyle?: TextStyle;
  border?: BorderStyle;

  // type: "text"
  content?: string;

  // type: "image"
  imageUrl?: string; // data URL saat mock; URL object storage saat backend siap
  imageWidth?: number; // px pada preview

  // type: "field" — merujuk ke TemplateField.id dari sourceTemplateId layout ini
  sourceFieldId?: string;
  displayStyle?: FieldDisplayStyle;

  // type: "field-grid"
  fieldIds?: string[];
  gridColumns?: 1 | 2;

  // type: "table"
  tableMode?: "static" | "from-field";
  columns?: TableColumn[];
  rows?: string[][];
  emptyRows?: number; // baris kosong tambahan, mis. Form Inventory
  headerBgColor?: string;
  headerTextColor?: string;

  // type: "photo-page"
  caption?: string;
  captionPosition?: "above" | "below";
  pageHeader?: {
    show: boolean;
    leftText: string;
    rightText: string;
  };
  noteText?: string; // mis. "LAMPIRAN FOTO (WAJIB DENGAN GEOTAGGING)"
  notePosition?: "above" | "below";

  // type: "header"
  showLogo?: boolean;
  companyName?: string;
  reportTitle?: string;
  showReferenceNumber?: boolean;

  // type: "footer"
  showPageNumber?: boolean;
  footerNote?: string;
}

export interface OutputLayout {
  id: string;
  name: string;
  sourceTemplateId: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  blocks: LayoutBlock[];
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  submitted: "Submitted",
  rejected: "Rejected",
  approved: "Approved",
};
