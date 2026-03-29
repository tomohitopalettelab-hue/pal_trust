import { NextResponse } from 'next/server';
import { palDbGet } from '../_lib/pal-db-client';

/**
 * GET /api/gbp-reviews?paletteId=xxx
 * GBP (Google Business Profile) のレビュー一覧を取得する
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

    // pal_trust + pal_opt サブスクリプション確認
    const servicesRes = await palDbGet(`/api/palette-services?paletteId=${paletteId}`);
    if (!servicesRes.ok) {
      return NextResponse.json(
        { success: false, error: 'サービス情報の取得に失敗しました。' },
        { status: 502 },
      );
    }
    const services = await servicesRes.json();
    const hasOptSubscription = Array.isArray(services)
      ? services.some((s: { service?: string }) => s.service === 'pal_opt')
      : false;

    if (!hasOptSubscription) {
      return NextResponse.json(
        { success: false, error: 'pal_opt のサブスクリプションが必要です。' },
        { status: 403 },
      );
    }

    // pal_opt_settings から GBP 認証情報を取得
    const settingsRes = await palDbGet(`/api/pal-opt-settings?paletteId=${paletteId}`);
    if (!settingsRes.ok) {
      return NextResponse.json(
        { success: false, error: 'GBP設定の取得に失敗しました。' },
        { status: 502 },
      );
    }
    const settings = await settingsRes.json();
    const gbpAccessToken = settings?.gbp_access_token || settings?.gbpAccessToken;
    const gbpLocationId = settings?.gbp_location_id || settings?.gbpLocationId;

    if (!gbpAccessToken || !gbpLocationId) {
      return NextResponse.json(
        { success: false, error: 'GBP API設定が不足しています。pal_opt でGBP連携を設定してください。' },
        { status: 400 },
      );
    }

    // GBP API からレビュー一覧を取得
    const gbpUrl = `https://mybusiness.googleapis.com/v4/${gbpLocationId}/reviews`;
    const gbpRes = await fetch(gbpUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gbpAccessToken}`,
      },
    });

    if (!gbpRes.ok) {
      const errBody = await gbpRes.json().catch(() => ({}));
      const errMsg = (errBody as { error?: { message?: string } })?.error?.message || 'GBP APIエラー';
      return NextResponse.json(
        { success: false, error: `レビューの取得に失敗しました: ${errMsg}` },
        { status: gbpRes.status },
      );
    }

    const data = await gbpRes.json();
    const reviews = (data as { reviews?: unknown[] }).reviews || [];

    return NextResponse.json({
      success: true,
      reviews,
      totalReviewCount: (data as { totalReviewCount?: number }).totalReviewCount || reviews.length,
      averageRating: (data as { averageRating?: number }).averageRating || null,
    });
  } catch (error: unknown) {
    console.error('--- gbp-reviews GET エラー ---', error);
    const message = error instanceof Error ? error.message : 'レビュー取得に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
