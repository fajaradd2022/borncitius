import jpeg from 'jpeg-js';

/**
 * Membaca tag EXIF Orientation (0x0112) langsung dari byte JPEG, tanpa
 * decode gambar penuh — cukup scan marker APP1/Exif di header berkas.
 * Mengembalikan 1 (normal) bila tidak ada EXIF atau gagal parse.
 *
 * Nilai standar EXIF Orientation:
 *   1 = normal, 2 = flip horizontal, 3 = rotate 180,
 *   4 = flip vertical, 5 = transpose, 6 = rotate 90 CW,
 *   7 = transverse, 8 = rotate 90 CCW (270 CW).
 */
export function readJpegOrientation(buf: Buffer): number {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1; // bukan SOI JPEG
    let offset = 2;
    while (offset < buf.length - 4) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      // APP1 = 0xE1, tempat EXIF biasa disimpan.
      if (marker === 0xe1) {
        const segLen = buf.readUInt16BE(offset + 2);
        const segStart = offset + 4;
        // Header "Exif\0\0"
        if (buf.toString('ascii', segStart, segStart + 4) === 'Exif') {
          const tiffStart = segStart + 6;
          const little = buf.toString('ascii', tiffStart, tiffStart + 2) === 'II';
          const readU16 = (o: number) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
          const readU32 = (o: number) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
          const ifd0Offset = tiffStart + readU32(tiffStart + 4);
          const numEntries = readU16(ifd0Offset);
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifd0Offset + 2 + i * 12;
            const tag = readU16(entryOffset);
            if (tag === 0x0112) {
              return readU16(entryOffset + 8);
            }
          }
        }
        offset = segStart + segLen - 2;
      } else if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
      } else if (marker === 0xda) {
        break; // Start of Scan — EXIF selalu sebelum ini
      } else {
        const segLen = buf.readUInt16BE(offset + 2);
        offset += 2 + segLen;
      }
    }
  } catch {
    // Parsing gagal — anggap normal, jangan blokir render PDF.
  }
  return 1;
}

/**
 * Menormalkan orientasi JPEG: bila EXIF Orientation != 1, decode, putar/flip
 * piksel sesuai tag, lalu re-encode tanpa EXIF (sudah ter-bake ke piksel).
 * Untuk file bukan JPEG atau orientation 1/gagal decode, buffer asli
 * dikembalikan apa adanya.
 */
export function normalizeJpegOrientation(buf: Buffer): Buffer {
  const orientation = readJpegOrientation(buf);
  if (orientation === 1) return buf;

  try {
    const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
    const { width: w, height: h, data } = decoded;
    const swapDims = orientation >= 5; // 5,6,7,8 → rotasi 90°, dimensi tertukar
    const outW = swapDims ? h : w;
    const outH = swapDims ? w : h;
    const out = Buffer.alloc(outW * outH * 4);

    // Hitung posisi piksel sumber untuk tiap piksel tujuan, sesuai transformasi
    // EXIF Orientation standar (lihat tabel exiftool).
    const srcIndex = (dx: number, dy: number): [number, number] => {
      switch (orientation) {
        case 2: return [w - 1 - dx, dy]; // flip horizontal
        case 3: return [w - 1 - dx, h - 1 - dy]; // rotate 180
        case 4: return [dx, h - 1 - dy]; // flip vertical
        case 5: return [dy, dx]; // transpose
        case 6: return [dy, h - 1 - dx]; // rotate 90 CW
        case 7: return [w - 1 - dy, h - 1 - dx]; // transverse
        case 8: return [w - 1 - dy, dx]; // rotate 90 CCW
        default: return [dx, dy];
      }
    };

    for (let dy = 0; dy < outH; dy++) {
      for (let dx = 0; dx < outW; dx++) {
        const [sx, sy] = srcIndex(dx, dy);
        const sOff = (sy * w + sx) * 4;
        const dOff = (dy * outW + dx) * 4;
        out[dOff] = data[sOff];
        out[dOff + 1] = data[sOff + 1];
        out[dOff + 2] = data[sOff + 2];
        out[dOff + 3] = data[sOff + 3];
      }
    }

    const encoded = jpeg.encode({ data: out, width: outW, height: outH }, 88);
    return Buffer.from(encoded.data);
  } catch {
    // Decode/encode gagal (format tak terduga) — pakai buffer asli, lebih
    // baik gambar sedikit salah orientasi daripada PDF gagal digenerate.
    return buf;
  }
}
