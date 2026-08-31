import { NextResponse } from "next/server";
import { callLayoutAi, isAiConfigured } from "@/lib/ai/layout-ai";
import { getTemplateDetail, ApiError } from "@/lib/api/client";
import type { LayoutBlock } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatBody {
  templateId?: string;
  instruction?: string;
  currentBlocks?: LayoutBlock[];
  sessionId?: string | null;
}

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI belum dikonfigurasi. Set AI_ENABLED dan AI_N8N_WEBHOOK_URL di .env.local." },
      { status: 503 },
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }

  const instruction = body.instruction?.trim();
  if (!instruction) {
    return NextResponse.json({ error: "Instruksi tidak boleh kosong." }, { status: 400 });
  }
  if (instruction.length > 4000) {
    return NextResponse.json({ error: "Instruksi terlalu panjang (maks 4000 karakter)." }, { status: 400 });
  }

  let template;
  try {
    template = await getTemplateDetail(String(body.templateId ?? ""));
  } catch (err) {
    const status = err instanceof ApiError && err.status === 401 ? 401 : 404;
    return NextResponse.json(
      { error: status === 401 ? "Sesi berakhir, silakan login ulang." : "Template sumber tidak ditemukan." },
      { status },
    );
  }

  try {
    const result = await callLayoutAi({
      mode: "chat",
      instruction,
      currentBlocks: Array.isArray(body.currentBlocks) ? body.currentBlocks.slice(0, 200) : [],
      sessionId: body.sessionId ?? null,
      template,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menghubungi layanan AI.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
