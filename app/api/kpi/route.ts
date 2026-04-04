import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSurveysTable } from '../_lib/ensure-surveys-table';

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get('cid');
  if (!cid) return NextResponse.json({ error: 'cid is required' }, { status: 400 });

  try {
    await ensureSurveysTable();

    // category カラムに paletteId が格納されている
    const totalResult = await sql`SELECT COUNT(*) as count FROM surveys WHERE category = ${cid}`;
    const totalResponses = Number(totalResult.rows[0]?.count || 0);

    const avgResult = await sql`SELECT AVG(rating) as avg FROM surveys WHERE category = ${cid} AND rating IS NOT NULL`;
    const avgScore = avgResult.rows[0]?.avg ? Number(Number(avgResult.rows[0].avg).toFixed(1)) : null;

    const recentResult = await sql`
      SELECT rating, category, comment, created_at
      FROM surveys
      WHERE category = ${cid}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const latestFeedback = recentResult.rows[0] || null;

    const lowScoreResult = await sql`
      SELECT COUNT(*) as count FROM surveys WHERE category = ${cid} AND rating IS NOT NULL AND rating <= 2
    `;
    const lowScoreCount = Number(lowScoreResult.rows[0]?.count || 0);

    const lastActivity = latestFeedback?.created_at ? String(latestFeedback.created_at) : null;

    let health: 'green' | 'yellow' | 'red' = 'green';
    if (avgScore !== null && avgScore < 3.0) health = 'red';
    else if (avgScore !== null && avgScore < 3.5) health = 'yellow';

    return NextResponse.json({
      service: 'pal_trust',
      serviceName: 'Pal Trust',
      paletteId: cid,
      kpi: {
        totalResponses,
        avgScore: avgScore !== null ? avgScore : '-',
        lowScoreCount,
        latestRating: latestFeedback?.rating ?? '-',
      },
      health,
      lastActivity,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
