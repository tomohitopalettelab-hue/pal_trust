import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { del } from '@vercel/blob';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rows } = await sql`SELECT url FROM media_assets WHERE id = ${id}`;
    if (rows[0]) {
      const url = String(rows[0].url);
      if (url.startsWith('https://') && url.includes('.blob.')) {
        try { await del(url); } catch { /* blob may not exist */ }
      }
    }
    await sql`DELETE FROM media_assets WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Media Delete]', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
