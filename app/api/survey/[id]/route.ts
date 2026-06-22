import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const { searchParams } = new URL(_req.url);
    const customerId = searchParams.get('customerId') || '';
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    // 安全のためcustomerIdとIDの両方で削除（他顧客の回答を消せないように）
    await sql`DELETE FROM surveys WHERE id = ${id} AND category = ${customerId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('survey delete error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
