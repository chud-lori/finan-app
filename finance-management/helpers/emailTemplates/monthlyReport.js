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
    <style>
      @media only screen and (max-width:420px) {
        .shell { padding:20px 12px !important; }
        .pad { padding-left:18px !important; padding-right:18px !important; }
        .hero { font-size:28px !important; line-height:36px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f1f3f4;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f3f4">
      <tr>
        <td align="center" class="shell" style="padding:32px 16px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px">
            <tr>
              <td class="pad" style="padding:32px 28px 8px">
                <p style="margin:0;color:#5f6368;font-size:13px;line-height:18px;letter-spacing:.6px;text-transform:uppercase;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${monthLabel}</p>
                <p style="margin:14px 0 0;color:#5f6368;font-size:15px;line-height:20px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${headlineLabel}</p>
                <p class="hero" style="margin:2px 0 0;color:#202124;font-size:34px;line-height:42px;font-weight:700;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${headline}</p>
                <p style="margin:8px 0 0;color:#5f6368;font-size:15px;line-height:22px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${caption}</p>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:20px 28px 4px">
                ${body}
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:28px">
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
    caption: 'Nothing to summarise this month.',
    body: `<p style="margin:0;color:${MUTED};font-size:15px;line-height:23px;font-family:${FONT}">
             A month of entries turns this page into where your money went, what is a habit, and what is worth trimming.
           </p>
           <p style="margin:14px 0 0;color:${MUTED};font-size:15px;line-height:23px;font-family:${FONT}">
             Start with the next thing you buy — one entry is enough to begin.
           </p>`,
    ctaLabel: 'Add a transaction',
    ctaUrl: `${appUrl}/add`,
    footnote: 'Monthly reports are on in your preferences. Turn them off any time in the app.',
  }),
});

module.exports = { monthlyReportEmail, nothingRecordedEmail };
