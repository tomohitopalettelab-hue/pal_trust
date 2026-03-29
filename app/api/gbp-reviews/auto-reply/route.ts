import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

type AutoReplyRequestBody = {
  paletteId: string;
  enabled: boolean;
};

/**
 * POST /api/gbp-reviews/auto-reply
 * 自動返信のON/OFFを切り替える
 * customer_app_settings の JSONB data に autoReplyEnabled を保存
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AutoReplyRequestBody;
    const { paletteId: rawPaletteId, enabled } = body;

    if (!rawPaletteId) {
      return NextResponse.json(
        { success: false, error: 'paletteId が必要です。' },
        { status: 400 },
      );
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled は boolean で指定してください。' },
        { status: 400 },
      );
    }

    const paletteId = rawPaletteId.trim().toUpperCase();

    // customer_app_settings テーブルが存在することを確認
    await sql`
      CREATE TABLE IF NOT EXISTS customer_app_settings (
        customer_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // 既存設定を取得
    const { rows } = await sql`
      SELECT data FROM customer_app_settings WHERE customer_id = ${paletteId} LIMIT 1
    `;
    const existingData = (rows[0]?.data as Record<string, unknown>) || {};

    // autoReplyEnabled を更新
    const updatedData = {
      ...existingData,
      customerId: paletteId,
      autoReplyEnabled: enabled,
    };

    await sql`
      INSERT INTO customer_app_settings (customer_id, data, updated_at)
      VALUES (${paletteId}, ${JSON.stringify(updatedData)}, CURRENT_TIMESTAMP)
      ON CONFLICT (customer_id)
      DO UPDATE SET data = ${JSON.stringify(updatedData)}, updated_at = CURRENT_TIMESTAMP
    `;

    return NextResponse.json({
      success: true,
      autoReplyEnabled: enabled,
    });
  } catch (error: unknown) {
    console.error('--- gbp-reviews/auto-reply エラー ---', error);
    const message = error instanceof Error ? error.message : '自動返信設定の保存に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/gbp-reviews/auto-reply?paletteId=xxx
 * 自動返信の現在の設定状態を取得
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const paletteId = searchParams.get('paletteId')?.trim().toUpperCase();

    if (!paletteId) {
      return NextResponse.json(
        { success: false, error: 'paletteId が必要です。' },
        { status: 400 },
      );
    }

    await sql`
      CREATE TABLE IF NOT EXISTS customer_app_settings (
        customer_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    const { rows } = await sql`
      SELECT data FROM customer_app_settings WHERE customer_id = ${paletteId} LIMIT 1
    `;
    const data = (rows[0]?.data as Record<string, unknown>) || {};
    const autoReplyEnabled = data.autoReplyEnabled === true;

    return NextResponse.json({
      success: true,
      autoReplyEnabled,
    });
  } catch (error: unknown) {
    console.error('--- gbp-reviews/auto-reply GET エラー ---', error);
    const message = error instanceof Error ? error.message : '自動返信設定の取得に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
