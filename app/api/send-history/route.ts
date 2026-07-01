import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSurveySendsTable } from '@/app/api/_lib/ensure-survey-sends-table';
import { isCustomerSuspended } from '@/app/api/_lib/palette-crm-client';

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId');
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }
  if (await isCustomerSuspended(customerId)) return NextResponse.json({ error: 'このアカウントは停止中です' }, { status: 403 });

  const channel = req.nextUrl.searchParams.get('channel') || '';

  try {
    await ensureSurveySendsTable();

    let rows;
    if (channel && channel !== 'all') {
      const channelFilter = channel === 'line' ? 'line' : channel;
      ({ rows } = await sql`
        SELECT id, customer_id, channel, recipient, sent_at
        FROM survey_sends
        WHERE customer_id = ${customerId}
          AND channel = ${channelFilter}
        ORDER BY sent_at DESC
        LIMIT 200
      `);
    } else {
      ({ rows } = await sql`
        SELECT id, customer_id, channel, recipient, sent_at
        FROM survey_sends
        WHERE customer_id = ${customerId}
        ORDER BY sent_at DESC
        LIMIT 200
      `);
    }

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        recipient: r.recipient,
        sentAt: r.sent_at,
      })),
    });
  } catch (error) {
    console.error('[Send History]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch history' }, { status: 500 });
  }
}
