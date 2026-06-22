import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

type Prize = { id: string; name: string; probability: number };
type LotterySettings = {
  enabled?: boolean;
  animation?: string;
  timing?: string;
  prizes?: Prize[];
  loseMessage?: string;
};

/**
 * アンケート回答後の抽選を「サーバー側」で確定する。
 * 確率（各景品の probability %）はクライアントにも見えるが、当選判定をサーバーで
 * 行うことで devtools 等での改ざん（強制当選）を防ぐ。景品は店頭でスタッフが渡す前提。
 * 認証なし（他の survey 系 API と同様、customerId スコープのみ）。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const customerId = String(body?.customerId || '').trim();
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const { rows } = await sql`
      SELECT data
      FROM customer_app_settings
      WHERE LOWER(customer_id) = LOWER(${customerId})
      ORDER BY (customer_id = ${customerId}) DESC, updated_at DESC
      LIMIT 1;
    `;

    const lottery: LotterySettings = rows[0]?.data?.settings?.lottery || {};
    const prizes: Prize[] = Array.isArray(lottery.prizes) ? lottery.prizes : [];

    // 各景品を累積確率で判定（0〜100）。どれにも当たらなければ「はずれ」
    const roll = Math.random() * 100;
    let acc = 0;
    let won: Prize | null = null;
    for (const p of prizes) {
      const prob = Math.max(0, Number(p.probability) || 0);
      acc += prob;
      if (roll < acc) {
        won = p;
        break;
      }
    }

    return NextResponse.json({
      won: Boolean(won),
      prizeId: won?.id || null,
      prizeName: won?.name || null,
    });
  } catch {
    return NextResponse.json({ error: '抽選に失敗しました' }, { status: 500 });
  }
}
