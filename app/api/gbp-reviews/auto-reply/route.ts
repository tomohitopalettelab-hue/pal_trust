import { NextResponse } from 'next/server';

// 旧pal_opt連携の廃止に伴い無効化(2026-07)。詳細は ../route.ts のコメント参照。
const gone = () =>
  NextResponse.json(
    { success: false, error: 'pal_opt連携は終了しました。' },
    { status: 410 },
  );

export async function POST() {
  return gone();
}

export async function GET() {
  return gone();
}
