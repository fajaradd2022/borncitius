import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { callLayoutAi, isAiConfigured } from "@/lib/ai/layout-ai";
import { getTemplateDetail, ApiError } from "@/lib/api/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;

/** MIME dari klien tidak dipercaya — tipe berkas ditentukan dari magic bytes. */
const SIGNATURES: Array<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: ".pdf", test: (b) => b.subarray(0, 4).toString("latin1") === "%PDF" },
  { ext: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: ".png",
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI belum dikonfigurasi. Set AI_ENABLED dan AI_N8N_WEBHOOK_URL di .env.local." },
      { status: 503 },
    );
  }

  const uploadDir = process.env.AI_UPLOAD_DIR;
  if (!uploadDir) {
    return NextResponse.json({ error: "AI_UPLOAD_DIR belum dikonfigurasi." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Request harus berupa multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const templateId = String(form.get("templateId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Berkas wajib dikirim pada field "file".' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Ukuran berkas melebihi 20 MB." }, { status: 413 });
  }

  let template;
  try {
    template = await getTemplateDetail(templateId);
  } catch (err) {
    const status = err instanceof ApiError && err.status === 401 ? 401 : 404;
    return NextResponse.json(
      { error: status === 401 ? "Sesi berakhir, silakan login ulang." : "Template sumber tidak ditemukan." },
      { status },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const signature = SIGNATURES.find((s) => s.test(buffer));
  if (!signature) {
    return NextResponse.json(
      { error: "Tipe berkas tidak didukung. Hanya PDF, JPG, atau PNG." },
      { status: 400 },
    );
  }

  // Nama berkas selalu dibuat ulang; nama dari klien tidak pernah dipakai untuk path.
  const root = resolve(uploadDir);
  const absPath = join(root, `${randomUUID()}${signature.ext}`);
  if (!absPath.startsWith(root + sep)) {
    return NextResponse.json({ error: "Path berkas tidak valid." }, { status: 400 });
  }

  await mkdir(root, { recursive: true });
  await writeFile(absPath, buffer, { mode: 0o640 });

  try {
    const result = await callLayoutAi({ mode: "extract", filePath: absPath, template });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mengekstrak layout.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    // Berkas unggahan hanya perantara — dihapus apa pun hasilnya.
    await unlink(absPath).catch(() => undefined);
  }
}
