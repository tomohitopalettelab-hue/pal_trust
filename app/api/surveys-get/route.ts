import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureSurveysTable } from '@/app/api/_lib/ensure-surveys-table';

export async function GET(request: Request) {
  try {
    await ensureSurveysTable();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    const { rows } = customerId
      ? await sql`SELECT * FROM surveys WHERE category = ${customerId} ORDER BY created_at DESC;`
      : await sql`SELECT * FROM surveys ORDER BY created_at DESC;`;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('DB取得エラー:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}