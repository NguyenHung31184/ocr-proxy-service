/**
 * OCR Proxy (Vercel Serverless):
 * - Nhận request HTTPS từ frontend
 * - Forward sang OCR backend (thường HTTP trên VPS) để tránh Mixed Content
 *
 * Env (Vercel):
 * - OCR_BACKEND_URL = http://<host>:6123/ocr
 * - CORS_ALLOW_ORIGINS = https://a.com,https://b.com (optional; empty => *)
 *   Nếu có allowlist mà quên thêm localhost, dev (Vite) vẫn được phép qua kiểm tra LOCAL_DEV_ORIGIN bên dưới.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const OCR_BACKEND = process.env.OCR_BACKEND_URL || '';

/** Cho phép CORS từ máy dev (Vite/CRA) khi production đã bật CORS_ALLOW_ORIGINS hẹp. */
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveAllowOrigin(origin: string, allowlist: string[]): string {
  if (allowlist.length === 0) {
    return '*';
  }
  if (origin && allowlist.includes(origin)) {
    return origin;
  }
  if (origin && LOCAL_DEV_ORIGIN.test(origin)) {
    return origin;
  }
  return '';
}

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allowlist = parseCsv(process.env.CORS_ALLOW_ORIGINS || '');
  const origin = String(req.headers.origin || '').trim();
  const allowOrigin = resolveAllowOrigin(origin, allowlist);

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    if (allowOrigin !== '*') {
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function parseError(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? err.cause.message : '';
    return [err.message, cause].filter(Boolean).join(' | ');
  }
  return 'OCR proxy lỗi';
}

function isNetworkFailureMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('fetch failed') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('enotfound') ||
    m.includes('eai_again') ||
    m.includes('socket') ||
    m.includes('network')
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  if (!OCR_BACKEND) {
    res.status(500).json({
      success: false,
      error: 'Thiếu OCR_BACKEND_URL trên server. Vui lòng cấu hình biến môi trường trên Vercel.',
    });
    return;
  }

  try {
    let body: unknown = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body) as unknown;
    }
    if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ success: false, error: 'Thân yêu cầu phải là JSON object (vd: { image_url }).' });
      return;
    }

    const apiKey = req.headers['x-api-key'];
    const upstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      upstreamHeaders['x-api-key'] = apiKey;
    }

    const upstreamRes = await fetch(OCR_BACKEND, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000),
    });

    const text = await upstreamRes.text();
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      res.status(502).json({
        success: false,
        error: 'OCR backend không trả JSON hợp lệ.',
        preview: text.slice(0, 200),
      });
      return;
    }

    res.status(upstreamRes.status).json(data);
  } catch (err) {
    const message = parseError(err);
    const hint = isNetworkFailureMessage(message)
      ? ' Gợi ý: kiểm tra firewall VPS (cho phép port OCR từ internet), hoặc triển khai OCR backend qua HTTPS public + CORS và trỏ frontend thẳng tới backend.'
      : '';
    res.status(500).json({ success: false, error: `${message}.${hint}` });
  }
}

