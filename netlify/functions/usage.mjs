import { getStore } from '@netlify/blobs';
import fs from 'fs/promises';

const TMP_FALLBACK_FILE = '/tmp/acaksoal_ip_usage.json';

const ACTION_LABELS = {
  visit: 'Membuka Aplikasi',
  parse_exam: 'Ekstrak Soal PDF/Word',
  load_sample: 'Memuat Contoh Naskah',
  reshuffle: 'Mengacak Ulang Paket',
  export_pdf: 'Unduh Dokumen PDF',
  export_docx: 'Unduh Dokumen Word',
  export_zip: 'Unduh Arsip ZIP',
};

function normalizeIp(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'Tidak diketahui';
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  if (trimmed === '::1') return '127.0.0.1';
  return trimmed;
}

function getClientIp(req, context) {
  const nfIp = req.headers.get('x-nf-client-connection-ip');
  if (nfIp) return normalizeIp(nfIp);
  if (context && context.ip) return normalizeIp(context.ip);
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return normalizeIp(first);
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return normalizeIp(realIp);
  return 'Tidak diketahui';
}

function parseDeviceSummary(uaHeader) {
  const ua = uaHeader || '';
  if (!ua) return 'Perangkat tidak diketahui';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} · ${os}` : browser;
}

async function readUsageStore() {
  try {
    const store = getStore({ name: 'acaksoal-usage', consistency: 'strong' });
    const data = await store.get('ip_usage', { type: 'json' });
    if (data && typeof data === 'object') {
      return { data, mode: 'blobs' };
    }
    return { data: {}, mode: 'blobs' };
  } catch {
    try {
      const raw = await fs.readFile(TMP_FALLBACK_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return { data: parsed && typeof parsed === 'object' ? parsed : {}, mode: 'tmp' };
    } catch {
      return { data: {}, mode: 'tmp' };
    }
  }
}

async function writeUsageStore(data, mode) {
  if (mode === 'blobs') {
    try {
      const store = getStore({ name: 'acaksoal-usage', consistency: 'strong' });
      await store.setJSON('ip_usage', data);
      return;
    } catch {
      // Fall through to tmp fallback
    }
  }
  await fs.writeFile(TMP_FALLBACK_FILE, JSON.stringify(data), 'utf-8');
}

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  try {
    const currentIp = getClientIp(req, context);

    if (req.method === 'GET') {
      const { data: store } = await readUsageStore();
      const users = Object.values(store).sort(
        (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      );
      const summary = users.reduce(
        (acc, u) => {
          acc.uniqueIps += 1;
          acc.totalUses += u.totalUses;
          acc.totalParses += u.parses;
          acc.totalExports += u.exports;
          return acc;
        },
        { uniqueIps: 0, totalUses: 0, totalParses: 0, totalExports: 0 }
      );

      return new Response(
        JSON.stringify({
          currentIp,
          summary,
          users,
        }),
        { status: 200, headers }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;
      if (!action || !ACTION_LABELS[action]) {
        return new Response(JSON.stringify({ error: 'Jenis aktivitas tidak valid.' }), {
          status: 400,
          headers,
        });
      }

      const detail = typeof body?.detail === 'string' ? body.detail.slice(0, 80) : undefined;
      const actionText = detail ? `${ACTION_LABELS[action]} (${detail})` : ACTION_LABELS[action];
      const deviceSummary = parseDeviceSummary(req.headers.get('user-agent'));
      const now = new Date().toISOString();

      const { data: store, mode } = await readUsageStore();
      const existing = store[currentIp];

      if (existing) {
        existing.totalUses += 1;
        if (action === 'visit') existing.visits += 1;
        if (action === 'parse_exam' || action === 'load_sample') existing.parses += 1;
        if (action === 'export_pdf' || action === 'export_docx' || action === 'export_zip') {
          existing.exports += 1;
        }
        existing.lastAction = actionText;
        existing.deviceSummary = deviceSummary;
        existing.lastSeen = now;
      } else {
        store[currentIp] = {
          ip: currentIp,
          totalUses: 1,
          visits: action === 'visit' ? 1 : 0,
          parses: action === 'parse_exam' || action === 'load_sample' ? 1 : 0,
          exports:
            action === 'export_pdf' || action === 'export_docx' || action === 'export_zip' ? 1 : 0,
          lastAction: actionText,
          deviceSummary,
          firstSeen: now,
          lastSeen: now,
        };
      }

      await writeUsageStore(store, mode);

      return new Response(JSON.stringify({ ok: true, record: store[currentIp] }), {
        status: 200,
        headers,
      });
    }

    return new Response(JSON.stringify({ error: 'Method tidak didukung.' }), {
      status: 405,
      headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Gagal memproses data penggunaan IP.' }),
      { status: 500, headers }
    );
  }
};
