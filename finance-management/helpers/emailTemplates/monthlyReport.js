const FONT = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const INK = '#202124';
const MUTED = '#5f6368';
const RULE = '#e8eaed';
const BRAND = '#0d9488';

const statRow = ({ label, value, tone }) => `
  <tr>
    <td style="padding:11px 0;border-top:1px solid #e8eaed;color:#5f6368;font-size:15px;line-height:20px">${label}</td>
    <td align="right" style="padding:11px 0;border-top:1px solid #e8eaed;color:${tone || '#202124'};font-size:15px;line-height:20px;font-weight:600;white-space:nowrap">${value}</td>
  </tr>`;

const shell = ({ preheader, monthLabel, headlineLabel, headline, caption, body, ctaLabel, ctaUrl, footnote }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${monthLabel}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f3f4;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f3f4">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px">
            <tr>
              <td style="padding:32px 28px 8px">
                <p style="margin:0;color:#5f6368;font-size:13px;line-height:18px;letter-spacing:.6px;text-transform:uppercase;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${monthLabel}</p>
                <p style="margin:14px 0 0;color:#5f6368;font-size:15px;line-height:20px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${headlineLabel}</p>
                <p style="margin:2px 0 0;color:#202124;font-size:40px;line-height:48px;font-weight:700;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${headline}</p>
                <p style="margin:8px 0 0;color:#5f6368;font-size:15px;line-height:22px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${caption}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#0d9488" style="border-radius:10px">
                      <a href="${ctaUrl}"
                         style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
            <tr>
              <td style="padding:18px 28px 0;color:#80868b;font-size:12px;line-height:18px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
                ${footnote}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const monthlyReportEmail = ({ monthLabel, headlineLabel, headline, caption, lines, appUrl }) => ({
  subject: `${monthLabel}: ${headlineLabel.toLowerCase()} ${headline}`,
  html: shell({
    preheader: `${headlineLabel} ${headline} in ${monthLabel}.`,
    monthLabel, headlineLabel, headline, caption,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}">${lines.map(statRow).join('')}</table>`,
    ctaLabel: 'See the detail',
    ctaUrl: `${appUrl}/insights`,
    footnote: 'Monthly reports are on in your preferences. Turn them off any time in the app.',
  }),
});

const nothingRecordedEmail = ({ monthLabel, appUrl }) => ({
  subject: `${monthLabel} is a blank page`,
  html: shell({
    preheader: `Nothing was recorded in ${monthLabel} — a month of entries is what makes the rest useful.`,
    monthLabel,
    headlineLabel: 'You recorded',
    headline: 'nothing',
    caption: 'A blank month is the one month the app cannot tell you anything about.',
    body: `<p style="margin:0;color:${MUTED};font-size:15px;line-height:23px;font-family:${FONT}">
             Everything here is built from what you write down — where the money went, what is worth trimming, what is a habit and what was a one-off.
             None of it works on an empty month.
           </p>
           <p style="margin:16px 0 0;color:${MUTED};font-size:15px;line-height:23px;font-family:${FONT}">
             It does not take much. Log the next thing you buy, and by this time next month there is a real picture here instead of this.
           </p>`,
    ctaLabel: 'Add a transaction',
    ctaUrl: `${appUrl}/add`,
    footnote: 'Monthly reports are on in your preferences. Turn them off any time in the app.',
  }),
});

module.exports = { monthlyReportEmail, nothingRecordedEmail };
