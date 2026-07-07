import { NextResponse } from 'next/server';

/**
 * 旧pal_opt(SNS自動投稿)連携は2026-07のpal_opt完全リセット(AIOサービス化)に伴い廃止。
 * このルートが410を返すことで admin画面の hasPalOpt が false になり、
 * 口コミ自動返信/SNS投稿のUIセクションは自動的に非表示になる。
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'pal_opt連携は終了しました。' },
    { status: 410 },
  );
}
