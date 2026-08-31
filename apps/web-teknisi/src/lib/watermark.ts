/**
 * Membakar watermark ke foto hasil kamera (PRD 5.5).
 *
 * Watermark ditulis langsung ke piksel gambar, bukan disimpan sebagai metadata
 * terpisah, supaya bukti tetap melekat walau berkasnya dipindah atau disalin.
 * Foto yang dipilih dari galeri TIDAK diberi watermark — asumsinya sudah punya
 * timestamp dari aplikasi pihak ketiga.
 */

export interface WatermarkInfo {
  timestamp: string;
  gps: string;
  taskName: string;
}

const MAX_DIMENSION = 1600;

/**
 * Pojok kanan bawah, tanpa alas kotak — teks dibakar langsung di atas foto.
 * Legibilitas dijaga lewat garis tepi gelap di belakang tiap huruf (stroke
 * sebelum fill), bukan alas semi-transparan seperti versi sebelumnya.
 */
function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  height: number,
): void {
  const fontSize = Math.max(14, Math.round(width * 0.028));
  const padding = Math.round(fontSize * 0.6);
  const lineHeight = Math.round(fontSize * 1.35);

  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.15));
  ctx.fillStyle = "#ffffff";

  const x = width - padding;
  // Digambar dari baris terakhir ke atas supaya urutan baca (atas ke bawah)
  // tetap sama seperti array `lines`, dengan baris terakhir di posisi
  // paling bawah (pojok kanan bawah).
  let y = height - padding;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.strokeText(lines[i], x, y);
    ctx.fillText(lines[i], x, y);
    y -= lineHeight;
  }
}

/** Mengecilkan foto sekaligus membakar watermark; hasilnya JPEG. */
export async function burnWatermark(file: File, info: WatermarkInfo): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung canvas 2D.");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  drawLines(ctx, [info.timestamp, info.gps, info.taskName], width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal mengolah gambar."))),
      "image/jpeg",
      0.85,
    );
  });
}

/** Kompresi tanpa watermark, untuk foto dari galeri. */
export async function compressOnly(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung canvas 2D.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal mengolah gambar."))),
      "image/jpeg",
      0.85,
    );
  });
}

/** Mengambil koordinat GPS; gagal bukan kondisi fatal — watermark tetap dibuat. */
export function getPosition(): Promise<string> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("GPS tidak tersedia");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => resolve("GPS tidak aktif"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

export function formatTimestamp(date = new Date()): string {
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
