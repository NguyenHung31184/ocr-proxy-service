import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  res.status(200).json({
    ok: true,
    service: 'hptts-ocr-proxy',
    has_backend: Boolean(process.env.OCR_BACKEND_URL),
    timestamp: new Date().toISOString(),
  });
}

