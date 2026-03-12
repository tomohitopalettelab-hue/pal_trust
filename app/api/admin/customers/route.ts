import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureSurveysTable } from '@/app/api/_lib/ensure-surveys-table';

type CustomerSummaryRow = {
  customer_id: string;
  total_reviews: number;
  avg_rating: string | number | null;
  last_response_at: string | null;
};

export async function GET() {
  try {
    await ensureSurveysTable();
    const { rows } = await sql<CustomerSummaryRow>`
      SELECT
        COALESCE(NULLIF(category, ''), 'default') AS customer_id,
        COUNT(*)::int AS total_reviews,
        ROUND(AVG(rating)::numeric, 2) AS avg_rating,
        MAX(created_at)::text AS last_response_at
      FROM surveys
      GROUP BY 1
      ORDER BY MAX(created_at) DESC;
    `;

    const normalized = rows.map((row) => ({
      customerId: row.customer_id,
      totalReviews: Number(row.total_reviews ?? 0),
      averageRating: row.avg_rating === null ? 0 : Number(row.avg_rating),
      lastResponseAt: row.last_response_at,
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('顧客別サマリー取得エラー:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
