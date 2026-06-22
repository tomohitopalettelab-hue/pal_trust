import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';

const MAX_SIZE = 12 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
]);

const generateId = (): string => `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const customerId = formData.get('customerId') as string | null;

    if (!file || !customerId) {
      return NextResponse.json({ success: false, error: 'file and customerId are required' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: `ファイルサイズが${MAX_SIZE / 1024 / 1024}MBを超えています` }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ success: false, error: '画像ファイルのみアップロード可能です' }, { status: 400 });
    }

    // paletteIdを取得
    let paletteId = customerId;
    try {
      const { rows } = await sql`SELECT palette_id FROM accounts WHERE id = ${customerId}`;
      if (rows[0]) paletteId = String(rows[0].palette_id);
    } catch { /* use customerId as fallback */ }

    // ファイル名生成
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const safeExt = ext && ext.length <= 10 ? `.${ext}` : '';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    const blobPath = `media/${paletteId}/${fileName}`;

    // Vercel Blobにアップロード
    const blob = await put(blobPath, file, {
      access: 'public',
      addRandomSuffix: false,
    });

    // DB記録
    const id = generateId();

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY,
          palette_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          url TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    } catch { /* table may already exist */ }

    await sql`
      INSERT INTO media_assets (id, palette_id, file_name, original_name, mime_type, size_bytes, url)
      VALUES (${id}, ${paletteId}, ${fileName}, ${file.name}, ${file.type}, ${file.size}, ${blob.url})
    `;

    return NextResponse.json({
      success: true,
      data: {
        id,
        paletteId,
        fileName,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        url: blob.url,
      },
    });
  } catch (error) {
    console.error('[Media Upload]', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
