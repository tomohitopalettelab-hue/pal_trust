import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureSurveySendsTable } from '@/app/api/_lib/ensure-survey-sends-table';

const SMS_MONTHLY_LIMIT = 100;
const EMAIL_MONTHLY_LIMIT = 3000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    await ensureSurveySendsTable();

    const { rows } = await sql`
      SELECT channel, COUNT(*)::int AS count
      FROM survey_sends
      WHERE customer_id = ${customerId}
        AND sent_at >= date_trunc('month', NOW())
      GROUP BY channel;
    `;

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.channel] = Number(row.count);
    }

    return NextResponse.json({
      sms: { used: counts['sms'] || 0, limit: SMS_MONTHLY_LIMIT },
      email: { used: counts['email'] || 0, limit: EMAIL_MONTHLY_LIMIT },
    });
  } catch (error) {
    console.error('send-quota error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
