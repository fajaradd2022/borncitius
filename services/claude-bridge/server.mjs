/**
 * Claude Bridge — jembatan HTTP ke Claude CLI.
 *
 * Kenapa ada: credential Claude (langganan claude.ai) tersimpan di ~/.claude
 * milik user host, sementara n8n dan API berjalan di dalam container. Bridge
 * ini berjalan di host sebagai user pemilik credential, sehingga credential
 * tidak perlu disalin ke container mana pun.
 *
 * Keamanan:
 * - Wajib header X-Bridge-Token yang dicocokkan konstan-waktu.
 * - Claude dijalankan dengan tool berbahaya dimatikan (hanya Read yang aktif).
 * - Akses berkas dibatasi ke ALLOWED_DIR; path divalidasi setelah resolve
 *   sehingga "../" tidak bisa keluar dari direktori itu.
 * - Argumen dikirim sebagai array ke spawn (tidak lewat shell); prompt lewat stdin.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { stat } from 'node:fs/promises';

const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const HOST = process.env.BRIDGE_HOST ?? '0.0.0.0';
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const ALLOWED_DIR = resolve(process.env.BRIDGE_ALLOWED_DIR ?? '/tmp/born-citius-ai');
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5';
const TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT_MS ?? 300_000);
const MAX_BODY = 1_000_000;

const DISALLOWED_TOOLS = 'Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,TodoWrite';

if (!TOKEN) {
  console.error('BRIDGE_TOKEN wajib diisi. Bridge dihentikan.');
  process.exit(1);
}

function tokenValid(received) {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((res, rej) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        rej(new Error('Payload terlalu besar.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

async function validateFilePath(filePath) {
  const abs = resolve(filePath);
  if (abs !== ALLOWED_DIR && !abs.startsWith(ALLOWED_DIR + sep)) {
    throw new Error(`filePath harus berada di dalam ${ALLOWED_DIR}`);
  }
  const info = await stat(abs).catch(() => null);
  if (!info?.isFile()) throw new Error('filePath tidak ditemukan.');
  return abs;
}

/**
 * Prompt dikirim lewat stdin, bukan sebagai argumen: flag --add-dir bersifat
 * variadic sehingga akan menelan prompt bila ditaruh setelahnya, dan stdin
 * juga menghindari batas panjang argumen untuk prompt yang besar.
 */
function runClaude(args, prompt) {
  return new Promise((res, rej) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: ALLOWED_DIR });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rej(new Error(`Claude melebihi batas waktu ${TIMEOUT_MS} ms.`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 32 * 1024 * 1024) {
        child.kill('SIGKILL');
        rej(new Error('Output Claude terlalu besar.'));
      }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); rej(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return rej(new Error(stderr.slice(0, 2000) || `claude keluar dengan kode ${code}`));
      res(stdout);
    });

    child.stdin.end(prompt);
  });
}

/**
 * CLI kadang menuliskan lebih dari satu objek JSON (mis. baris peringatan
 * sebelum hasil). Ambil objek terakhir yang mengandung penanda hasil, bukan
 * asal JSON.parse seluruh keluaran.
 */
function parseClaudeOutput(stdout) {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    // lanjut ke pemindaian per baris
  }

  const candidates = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const obj = JSON.parse(t);
      if ('result' in obj || 'is_error' in obj) candidates.push(obj);
    } catch {
      // baris bukan JSON utuh — abaikan
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Keluaran Claude tidak bisa diparse: ${text.slice(0, 300)}`);
  }
  return candidates[candidates.length - 1];
}

const server = createServer(async (req, res) => {
  const send = (code, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  };

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, { status: 'ok', model: DEFAULT_MODEL, allowedDir: ALLOWED_DIR });
  }

  if (req.method !== 'POST' || req.url !== '/run') {
    return send(404, { error: 'Endpoint tidak dikenal. Gunakan POST /run.' });
  }

  if (!tokenValid(req.headers['x-bridge-token'])) {
    return send(401, { error: 'Token bridge tidak valid.' });
  }

  try {
    const raw = await readBody(req);
    const { prompt, filePath, model, sessionId } = JSON.parse(raw || '{}');

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return send(400, { error: 'Field "prompt" wajib diisi.' });
    }

    let finalPrompt = prompt;
    const args = [
      '-p',
      '--output-format', 'json',
      '--model', typeof model === 'string' && model ? model : DEFAULT_MODEL,
      '--disallowed-tools', DISALLOWED_TOOLS,
      '--add-dir', ALLOWED_DIR,
    ];

    if (filePath) {
      const abs = await validateFilePath(filePath);
      finalPrompt = `${prompt}\n\nBerkas yang harus dibaca: ${abs}`;
    }
    if (typeof sessionId === 'string' && /^[\w-]{8,64}$/.test(sessionId)) {
      args.push('--resume', sessionId);
    }

    const started = Date.now();
    const stdout = await runClaude(args, finalPrompt);
    const parsed = parseClaudeOutput(stdout);

    if (parsed.is_error) {
      return send(502, { error: 'Claude mengembalikan error.', detail: parsed.result ?? null });
    }

    return send(200, {
      ok: true,
      result: parsed.result ?? '',
      sessionId: parsed.session_id ?? null,
      costUsd: parsed.total_cost_usd ?? null,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return send(500, { error: String(err instanceof Error ? err.message : err).slice(0, 1000) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Claude Bridge siap di http://${HOST}:${PORT} (allowedDir=${ALLOWED_DIR})`);
});
