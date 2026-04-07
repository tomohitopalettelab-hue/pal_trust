import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ensureSurveySendsTable } from '@/app/api/_lib/ensure-survey-sends-table';

type SendRequest = {
  customerId: string;
  channel: 'sms' | 'line_broadcast' | 'line_push' | 'email';
  recipients: string[];
  message?: string;
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

// --- SMS via Twilio ---
async function sendSms(settings: Record<string, unknown>, to: string, message: string) {
  const Twilio = (await import('twilio')).default;
  const client = Twilio(
    String(settings.twilioAccountSid || ''),
    String(settings.twilioAuthToken || ''),
  );
  await client.messages.create({
    body: message,
    from: String(settings.twilioPhoneNumber || ''),
    to,
  });
}

// --- Email via Resend ---
async function sendEmail(to: string, surveyUrl: string, appName: string) {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Pal Trust <noreply@palette-lab.com>',
    to,
    subject: `${appName || 'Pal Trust'} アンケートのお願い`,
    html: `<p>いつもご利用ありがとうございます。</p><p>以下のリンクからアンケートにご回答いただけると幸いです。</p><p><a href="${surveyUrl}">${surveyUrl}</a></p><p>ご協力よろしくお願いいたします。</p>`,
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

    await ensureSurveySendsTable();
    const settings = await getCustomerSettings(customerId);
    const surveyUrl = buildSurveyUrl(customerId);
    const defaultMessage = body.message || `アンケートにご協力ください！\n${surveyUrl}`;
    const appName = String(settings.appName || 'Pal Trust');

    let sentCount = 0;
    const errors: string[] = [];

    if (channel === 'sms') {
      if (!settings.twilioAccountSid || !settings.twilioAuthToken || !settings.twilioPhoneNumber) {
        return NextResponse.json({ error: 'Twilio設定が未完了です' }, { status: 400 });
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
          await sendEmail(to, surveyUrl, appName);
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
