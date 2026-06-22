import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import {
  surveyEmailHtml, surveyEmailSubject,
  campaignEmailHtml, campaignEmailSubject,
  aftercareEmailHtml, aftercareEmailSubject,
} from '@/app/api/_lib/email-templates';

type TemplateType = 'survey' | 'campaign' | 'aftercare';
type Channel = 'sms' | 'email' | 'line_broadcast' | 'line_push';

const TEMPLATES: Record<TemplateType, {
  label: string;
  line: string;
  sms: string;
  email: { subject: string; body: string };
}> = {
  survey: {
    label: '通常版：アンケートのお願い',
    line: `【お願い】アンケートご協力のお願い

こんにちは！
サービス向上のため、率直なご意見をいただけませんか？

1分ほどで終わる簡単な内容です。
こちらからご回答いただけますと幸いです👇
[URL]`,
    sms: `【[会社名]】よりアンケートのお願い。皆様の声を形にするため1分ほどお時間ください。回答はこちら：[URL]`,
    email: {
      subject: '【アンケート】サービス改善に向けたご協力のお願い',
      body: `いつもご利用いただき、ありがとうございます。
[会社名]です。

現在、より使いやすく満足度の高いサービスを目指し、アンケートを実施しております。
30秒〜1分ほどで終わる短いものですので、ぜひお力添えをお願いいたします。

[URL]`,
    },
  },
  campaign: {
    label: '特典あり版：キャンペーン告知',
    line: `🎁 [特典]をプレゼント！

いつもありがとうございます！
今、アンケートにお答えいただいた方に[特典]を差し上げています✨

ぜひこの機会にゲットしてください！

👇回答はこちら
[URL]`,
    sms: `【[会社名]】[特典]をプレゼント！アンケート実施中。回答（1分）はこちらから：[URL]`,
    email: {
      subject: '【特典あり】アンケート回答で[特典]を差し上げます',
      body: `いつもお世話になっております。
[会社名]です。

日頃の感謝を込めまして、アンケート回答者様に[特典]をご用意いたしました。
ぜひ率直なご意見をお聞かせください。

■アンケートURL
[URL]`,
    },
  },
  aftercare: {
    label: 'アフターフォロー版：フォローのついでに依頼',
    line: `その後いかがでしょうか？

先日はありがとうございました！
もし何かお困りごとがあれば、いつでもお気軽にメッセージくださいね。

最後に一つだけ、今回の私たちについて満足度を教えていただけると嬉しいです👇
[URL]
※10秒で終わります！`,
    sms: `【[会社名]】先日はありがとうございました。その後お困りごとはないでしょうか？改善のため短いアンケートにご協力ください：[URL]`,
    email: {
      subject: '[会社名]のご利用状況はいかがでしょうか？',
      body: `先日は[会社名]をご利用いただき、誠にありがとうございました。
その後、問題なくお使いいただけておりますでしょうか。

何か不明点やご要望がございましたら、本メールへの返信にてお気軽にお寄せください。

また、もしよろしければ今後のサポート品質向上のため、以下の簡易アンケート（1分）にもご協力いただけますと幸いです。

[URL]`,
    },
  },
};

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`[${key}]`, value);
  }
  return result;
}

export async function POST(req: Request) {
  try {
    const { customerId, templateType, channel, campaign, headerImageUrl } = await req.json() as {
      customerId: string;
      templateType: TemplateType;
      channel: Channel;
      campaign?: string;
      headerImageUrl?: string;
    };

    const template = TEMPLATES[templateType];
    if (!template) {
      return NextResponse.json({ error: '不明なテンプレートタイプです' }, { status: 400 });
    }

    // 顧客設定を取得（大文字小文字両方で検索）
    const { rows } = await sql`
      SELECT data FROM customer_app_settings
      WHERE customer_id = ${customerId} OR customer_id = ${customerId.toLowerCase()} OR customer_id = ${customerId.toUpperCase()}
      LIMIT 1;
    `;
    const settings = rows[0]?.data?.settings || {};
    const appName = String(settings.sendDisplayName || settings.appName || '');

    const surveyUrl = `https://trust.palette-lab.com/survey?customerId=${encodeURIComponent(customerId)}`;

    const vars: Record<string, string> = {
      '会社名': appName,
      'URL': surveyUrl,
      '特典': campaign || '特典',
      '特典名': campaign || '特典',
      '特典内容': campaign || '特典',
    };

    const isEmail = channel === 'email';
    const isLine = channel === 'line_broadcast' || channel === 'line_push';

    if (isEmail) {
      const templateVars = { companyName: appName, surveyUrl, campaign: campaign || '', headerImageUrl: headerImageUrl || '' };
      let emailHtml = '';
      let emailSubject = '';
      if (templateType === 'survey') {
        emailHtml = surveyEmailHtml(templateVars);
        emailSubject = surveyEmailSubject();
      } else if (templateType === 'campaign') {
        emailHtml = campaignEmailHtml(templateVars);
        emailSubject = campaignEmailSubject(campaign);
      } else {
        emailHtml = aftercareEmailHtml(templateVars);
        emailSubject = aftercareEmailSubject(appName);
      }
      return NextResponse.json({
        subject: emailSubject,
        body: replacePlaceholders(template.email.body, vars),
        html: emailHtml,
      });
    }

    if (isLine) {
      return NextResponse.json({
        message: replacePlaceholders(template.line, vars),
      });
    }

    // SMS
    return NextResponse.json({
      message: replacePlaceholders(template.sms, vars),
    });
  } catch (error) {
    console.error('generate-send-message error:', error);
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
