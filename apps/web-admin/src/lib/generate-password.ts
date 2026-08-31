// Alfabet sengaja tanpa karakter ambigu (0/O, 1/l/I) supaya gampang dibaca
// admin saat menyampaikan password ke user secara lisan/tertulis.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Password acak CSPRNG (Web Crypto, bukan Math.random) — dipakai sebagai
 * nilai awal di dialog buat-user & reset-password, boleh diedit admin
 * sebelum disimpan.
 */
export function generateRandomPassword(length = 14): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join("");
}
