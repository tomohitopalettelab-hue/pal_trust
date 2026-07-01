import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureSurveySendsTable } from '@/app/api/_lib/ensure-survey-sends-table';
import { isCustomerSuspended } from '@/app/api/_lib/palette-crm-client';

type SendRequest = {
  customerId: string;
  channel: 'sms' | 'line_broadcast' | 'line_push' | 'email';
  recipients: string[];
  message?: string;
  subject?: string;
  html?: string;
};

const SMS_MONTHLY_LIMIT = 100;
const EMAIL_MONTHLY_LIMIT = 3000;

async function getCustomerSettings(customerId: string) {
  const { rows } = await sql`
    SELECT data FROM customer_app_settings WHERE customer_id = ${customerId} LIMIT 1;
  `;
  return rows[0]?.data?.settings || {};
}

async function getMonthlyCount(customerId: string, channel: string): Promise<number> {
  const { rows } = await sql`
    SELECT COUNT(*)::int AS count FROM survey_sends
    WHERE customer_id = ${customerId} AND channel = ${channel}
    AND sent_at >= date_trunc('month', NOW());
  `;
  return Number(rows[0]?.count || 0);
}

async function recordSend(customerId: string, channel: string, recipient: string) {
  await sql`
    INSERT INTO survey_sends (customer_id, channel, recipient) VALUES (${customerId}, ${channel}, ${recipient});
  `;
}

function buildSurveyUrl(customerId: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://trust.palette-lab.com';
  return `${base}/survey?customerId=${encodeURIComponent(customerId)}`;
}

// --- SMS via Vonage ---
function normalizeJpPhone(raw: string): string {
  // 数字だけ残す
  let num = raw.replace(/[^0-9+]/g, '');
  // 先頭の+81はそのまま（+除去して81始まりに）
  if (num.startsWith('+81')) num = '81' + num.slice(3);
  // 先頭の0を81に変換（070→8170, 080→8180, 090→8190）
  if (num.startsWith('0')) num = '81' + num.slice(1);
  return num;
}

async function sendSms(settings: Record<string, unknown>, to: string, message: string) {
  const apiKey = String(settings.vonageApiKey || '');
  const apiSecret = String(settings.vonageApiSecret || '');
  const senderName = String(settings.sendDisplayName || settings.appName || 'PAL-TRUST');
  const toNum = normalizeJpPhone(to);

  // REST APIを直接呼び出し（Unicode対応）
  const res = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      api_secret: apiSecret,
      from: senderName,
      to: toNum,
      text: message,
      type: 'unicode',
    }),
  });
  const data = await res.json();
  const msg = data.messages?.[0];
  if (msg?.status !== '0') {
    throw new Error(msg?.['error-text'] || 'SMS送信に失敗しました');
  }
}

// --- Email via Gmail API ---
async function sendGmail(customerId: string, to: string, subject: string, bodyText: string, htmlTemplate?: string) {
  const { getAuthenticatedClient } = await import('@/app/api/_lib/google-auth');
  const client = await getAuthenticatedClient(customerId);
  if (!client) throw new Error('Gmail連携が必要です。設定画面からGoogleアカウントを連携してください。');

  const { google } = await import('googleapis');
  const gmail = google.gmail({ version: 'v1', auth: client });

  // HTMLテンプレートがあればそれを使用、なければプレーンテキストをHTML変換
  const htmlBody = htmlTemplate || bodyText.split('\n').map((line) => `<p>${line || '&nbsp;'}</p>`).join('');
  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].join('\r\n');

  const encodedMessage = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

// --- LINE Broadcast ---
async function sendLineBroadcast(token: string, message: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ type: 'text', text: message }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'LINE broadcast failed');
  }
}

// --- LINE Push ---
async function sendLinePush(token: string, userId: string, message: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'LINE push failed');
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendRequest;
    const { customerId, channel, recipients } = body;

    if (!customerId || !channel || !recipients?.length) {
      return NextResponse.json({ error: 'customerId, channel, recipients は必須です' }, { status: 400 });
    }
    if (await isCustomerSuspended(customerId)) return NextResponse.json({ error: 'このアカウントは停止中です' }, { status: 403 });

    await ensureSurveySendsTable();
    const settings = await getCustomerSettings(customerId);
    const surveyUrl = buildSurveyUrl(customerId);
    const defaultMessage = body.message || `アンケートにご協力ください！\n${surveyUrl}`;
    const emailSubject = body.subject || 'アンケートのお願い';
    const emailHtml = body.html || '';

    let sentCount = 0;
    const errors: string[] = [];

    if (channel === 'sms') {
      if (!settings.vonageApiKey || !settings.vonageApiSecret) {
        return NextResponse.json({ error: 'Vonage SMS設定が未完了です。設定画面からAPI KeyとAPI Secretを登録してください。' }, { status: 400 });
      }
      const used = await getMonthlyCount(customerId, 'sms');
      if (used + recipients.length > SMS_MONTHLY_LIMIT) {
        return NextResponse.json({ error: `SMS月間上限（${SMS_MONTHLY_LIMIT}通）を超えます。残り${SMS_MONTHLY_LIMIT - used}通` }, { status: 400 });
      }
      for (const to of recipients) {
        try {
          await sendSms(settings, to, defaultMessage);
          await recordSend(customerId, 'sms', to);
          sentCount++;
        } catch (err) {
          errors.push(`SMS送信失敗(${to}): ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    } else if (channel === 'email') {
      const used = await getMonthlyCount(customerId, 'email');
      if (used + recipients.length > EMAIL_MONTHLY_LIMIT) {
        return NextResponse.json({ error: `メール月間上限（${EMAIL_MONTHLY_LIMIT}通）を超えます。残り${EMAIL_MONTHLY_LIMIT - used}通` }, { status: 400 });
      }
      for (const to of recipients) {
        try {
          await sendGmail(customerId, to, emailSubject, defaultMessage, emailHtml || undefined);
          await recordSend(customerId, 'email', to);
          sentCount++;
        } catch (err) {
          errors.push(`メール送信失敗(${to}): ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    } else if (channel === 'line_broadcast') {
      const token = String(settings.lineChannelAccessToken || '');
      if (!token) {
        return NextResponse.json({ error: 'LINE Channel Access Tokenが未設定です' }, { status: 400 });
      }
      try {
        await sendLineBroadcast(token, defaultMessage);
        await recordSend(customerId, 'line', 'broadcast');
        sentCount = 1;
      } catch (err) {
        errors.push(`LINE一斉送信失敗: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    } else if (channel === 'line_push') {
      const token = String(settings.lineChannelAccessToken || '');
      if (!token) {
        return NextResponse.json({ error: 'LINE Channel Access Tokenが未設定です' }, { status: 400 });
      }
      for (const userId of recipients) {
        try {
          await sendLinePush(token, userId, defaultMessage);
          await recordSend(customerId, 'line', userId);
          sentCount++;
        } catch (err) {
          errors.push(`LINE送信失敗(${userId}): ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    } else {
      return NextResponse.json({ error: `不明なチャネル: ${channel}` }, { status: 400 });
    }

    if (sentCount === 0 && errors.length) {
      return NextResponse.json({ error: errors[0], errors }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sentCount,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    console.error('send-survey error:', error);
    return NextResponse.json({ error: '送信に失敗しました' }, { status: 500 });
  }
}
