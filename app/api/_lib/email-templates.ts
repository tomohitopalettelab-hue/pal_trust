// --- 3テイスト別 HTMLメールテンプレート ---

type TemplateVars = {
  companyName: string;
  surveyUrl: string;
  campaign?: string;
};

function wrapHtml(content: string, vars: TemplateVars): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${vars.companyName} アンケート</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4; padding: 20px 0;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
${content}
                    <tr>
                        <td style="padding: 30px; background-color: #f8f8f8; text-align: center; border-top: 1px solid #eeeeee;">
                            <p style="margin: 0 0 10px 0; font-size: 13px; color: #666666; font-weight: bold;">
                                ${vars.companyName}
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #999999; line-height: 1.5;">
                                ※本メールは送信専用アドレスよりお送りしております。<br>
                                &copy; 2026 ${vars.companyName}. All Rights Reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function surveyButton(url: string, color: string, label: string): string {
  return `                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <a href="${url}" target="_blank" style="background-color: ${color}; color: #ffffff; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px; display: inline-block;">
                                            ${label}
                                        </a>
                                    </td>
                                </tr>
                            </table>`;
}

function infoBox(text: string): string {
  return `                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fbfd; border-radius: 8px; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 20px; color: #555555; font-size: 14px; line-height: 1.6;">
                                        ${text}
                                    </td>
                                </tr>
                            </table>`;
}

// --- 1. 通常版：アンケートのお願い ---
export function surveyEmailHtml(vars: TemplateVars): string {
  const content = `
                    <tr>
                        <td align="center" style="background: linear-gradient(135deg, #4A90E2 0%, #357ABD 100%); padding: 50px 35px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold; line-height: 1.3;">
                                アンケートご協力のお願い
                            </h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">
                                サービス改善に向けたご意見をお聞かせください
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 35px;">
                            <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.8;">
                                いつもご利用いただき、誠にありがとうございます。<br><br>
                                現在、サービスのさらなる向上を目指しております。つきましては、日頃ご利用いただいている皆様の貴重なご意見をお聞かせいただけますでしょうか。
                            </p>
${infoBox('<strong>◆ アンケート概要</strong><br>・所要時間：約1分程度<br>・回答はすべて匿名で処理されます')}
${surveyButton(vars.surveyUrl, '#4A90E2', 'アンケートに回答する')}
                            <p style="margin: 30px 0 0 0; font-size: 12px; color: #999999; text-align: center;">
                                ※このリンクはお客様専用のURLです。
                            </p>
                        </td>
                    </tr>`;
  return wrapHtml(content, vars);
}

export function surveyEmailSubject(): string {
  return '【アンケート】サービス改善に向けたご協力のお願い';
}

// --- 2. 特典あり版：キャンペーン告知 ---
export function campaignEmailHtml(vars: TemplateVars): string {
  const campaignText = vars.campaign || '特典';
  const content = `
                    <tr>
                        <td align="center" style="background: linear-gradient(135deg, #FF6B6B 0%, #EE5A24 100%); padding: 50px 35px;">
                            <p style="margin: 0 0 10px 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                                🎁 アンケート回答者限定
                            </p>
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold; line-height: 1.3;">
                                ${campaignText}をプレゼント！
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 35px;">
                            <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.8;">
                                いつもお世話になっております。<br><br>
                                日頃の感謝を込めまして、アンケートにご回答いただいた方に<strong style="color: #EE5A24;">${campaignText}</strong>をご用意いたしました。<br>
                                ぜひ率直なご意見をお聞かせください。
                            </p>
${infoBox(`<strong>🎁 回答者特典</strong><br>${campaignText}<br><br><strong>◆ アンケート概要</strong><br>・所要時間：約1分程度`)}
${surveyButton(vars.surveyUrl, '#EE5A24', '特典をゲットする')}
                            <p style="margin: 30px 0 0 0; font-size: 12px; color: #999999; text-align: center;">
                                ※このリンクはお客様専用のURLです。
                            </p>
                        </td>
                    </tr>`;
  return wrapHtml(content, vars);
}

export function campaignEmailSubject(campaign?: string): string {
  return `【特典あり】アンケート回答で${campaign || '特典'}を差し上げます`;
}

// --- 3. アフターフォロー版 ---
export function aftercareEmailHtml(vars: TemplateVars): string {
  const content = `
                    <tr>
                        <td align="center" style="background: linear-gradient(135deg, #2ECC71 0%, #27AE60 100%); padding: 50px 35px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold; line-height: 1.3;">
                                ご利用状況はいかがでしょうか？
                            </h1>
                            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">
                                アフターフォローのご連絡です
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 35px;">
                            <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.8;">
                                先日はご利用いただき、誠にありがとうございました。<br><br>
                                その後、問題なくお使いいただけておりますでしょうか。何か不明点やご要望がございましたら、本メールへの返信にてお気軽にお寄せください。<br><br>
                                また、もしよろしければ今後のサポート品質向上のため、以下の簡易アンケートにもご協力いただけますと幸いです。
                            </p>
${infoBox('<strong>◆ アンケート概要</strong><br>・所要時間：約1分程度<br>・お困りごとがあればこちらからもお伝えいただけます')}
${surveyButton(vars.surveyUrl, '#27AE60', 'アンケートに回答する')}
                            <p style="margin: 30px 0 0 0; font-size: 12px; color: #999999; text-align: center;">
                                ※このリンクはお客様専用のURLです。
                            </p>
                        </td>
                    </tr>`;
  return wrapHtml(content, vars);
}

export function aftercareEmailSubject(companyName: string): string {
  return `${companyName}のご利用状況はいかがでしょうか？`;
}
