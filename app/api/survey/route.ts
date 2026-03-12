import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureSurveysTable } from '@/app/api/_lib/ensure-surveys-table';

export async function POST(request: Request) {
  try {
    await ensureSurveysTable();

    const { rating, category, comment, customerId, all_answers } = await request.json();
    const resolvedCustomerId = (customerId || category || 'default').toString();
    const safeAnswers = all_answers && typeof all_answers === 'object' ? all_answers : {};

    // データベースに挿入
    await sql`
      INSERT INTO surveys (rating, category, comment, all_answers)
      VALUES (${rating}, ${resolvedCustomerId}, ${comment}, ${JSON.stringify(safeAnswers)}::jsonb);
    `;

    return NextResponse.json({ message: '保存完了！' }, { status: 200 });
  } catch (error) {
    console.error('DB保存エラー:', error);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}