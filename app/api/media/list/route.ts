import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId');
  if (!customerId) {
    return NextResponse.json({ success: false, error: 'customerId is required' }, { status: 400 });
  }

  try {
    // paletteIdを取得
    let paletteId = customerId;
    try {
      const { rows } = await sql`SELECT palette_id FROM accounts WHERE id = ${customerId}`;
      if (rows[0]) paletteId = String(rows[0].palette_id);
    } catch { /* fallback */ }

    const { rows } = await sql`
      SELECT id, palette_id, file_name, original_name, mime_type, size_bytes, url, created_at
      FROM media_assets
      WHERE palette_id = ${paletteId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        paletteId: r.palette_id,
        fileName: r.file_name,
        originalName: r.original_name,
        mimeType: r.mime_type,
        sizeBytes: Number(r.size_bytes),
        url: r.url,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('[Media List]', error);
    return NextResponse.json({ success: true, data: [] });
  }
}
