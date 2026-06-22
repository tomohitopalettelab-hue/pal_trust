import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

/**
 * 事例活用可（customer_app_settings.data.settings.caseUsable = true）の顧客を、
 * 匿名情報＋デモURL＋KPI（総回答数・平均満足度・口コミ投稿率）で返す。
 * Palette Lab がライブ取得して事例一覧に表示する。会社名は返さない（匿名）。
 * ?cid=<customerId> で単一返却（詳細用）。認証なし（他の API と同様）。
 */

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_app_settings (
      customer_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS survey_funnel_events (
      session_id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      review_clicked_at TIMESTAMPTZ
    )`;
}

type CaseItem = {
  id: string;
  companyName: string;
  industry: string;
  demoUrl: string;
  totalResponses: number;
  avgScore: number | null;
  started: number;
  reviewClicks: number;
  reviewPostRate: number;
};

async function buildItem(customerId: string, industry: string, companyName: string): Promise<CaseItem> {
  const [totalRes, avgRes, startedRes, clickedRes] = await Promise.all([
    sql`SELECT COUNT(*)::int AS c FROM surveys WHERE category = ${customerId}`,
    sql`SELECT AVG(rating) AS a FROM surveys WHERE category = ${customerId} AND rating IS NOT NULL`,
    sql`SELECT COUNT(*)::int AS c FROM survey_funnel_events WHERE customer_id = ${customerId}`,
    sql`SELECT COUNT(*)::int AS c FROM survey_funnel_events WHERE customer_id = ${customerId} AND review_clicked_at IS NOT NULL`,
  ]);
  const totalResponses = Number(totalRes.rows[0]?.c || 0);
  const avgRaw = avgRes.rows[0]?.a;
  const avgScore = avgRaw != null ? Number(Number(avgRaw).toFixed(1)) : null;
  const started = Number(startedRes.rows[0]?.c || 0);
  const reviewClicks = Number(clickedRes.rows[0]?.c || 0);
  const reviewPostRate = started > 0 ? Math.round((reviewClicks / started) * 100) : 0;
  return {
    id: customerId,
    companyName: companyName || customerId,
    industry,
    demoUrl: `/survey?customerId=${encodeURIComponent(customerId)}&demo=1`,
    totalResponses,
    avgScore,
    started,
    reviewClicks,
    reviewPostRate,
  };
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const cid = req.nextUrl.searchParams.get("cid");

    if (cid) {
      // 単一: caseUsable 判定込みで返す
      const { rows } = await sql`
        SELECT cs.customer_id, cs.data->'settings'->>'industry' AS industry,
               cs.data->'settings'->>'caseUsable' AS case_usable,
               ca.customer_name
        FROM customer_app_settings cs
        LEFT JOIN customer_accounts ca ON ca.customer_id = cs.customer_id
        WHERE cs.customer_id = ${cid} LIMIT 1`;
      const r = rows[0];
      if (!r || String(r.case_usable) !== "true") {
        return NextResponse.json({ error: "not_case_usable" }, { status: 404 });
      }
      const item = await buildItem(String(r.customer_id), String(r.industry || ""), String(r.customer_name || ""));
      return NextResponse.json({ item });
    }

    // 一覧: 事例活用可の顧客
    const { rows } = await sql`
      SELECT cs.customer_id, cs.data->'settings'->>'industry' AS industry, ca.customer_name
      FROM customer_app_settings cs
      LEFT JOIN customer_accounts ca ON ca.customer_id = cs.customer_id
      WHERE cs.data->'settings'->>'caseUsable' = 'true'`;
    const items = await Promise.all(
      rows.map((r) => buildItem(String(r.customer_id), String(r.industry || ""), String(r.customer_name || ""))),
    );
    // 総回答数の多い順
    items.sort((a, b) => b.totalResponses - a.totalResponses);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("case-studies api error:", e);
    return NextResponse.json({ error: "failed", items: [] }, { status: 500 });
  }
}
