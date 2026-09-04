const FONT = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const INK = '#1a2230';
const MUTED = '#5b6675';
const FAINT = '#8a94a3';
const RULE = '#e6eaef';
const BRAND = '#0d9488';
const BRAND_DEEP = '#0f766e';
const BRAND_WASH = '#f0fdfa';
const CANVAS = '#eef1f4';
const TRACK = '#e6eaef';

const RAMP = ['#0d9488', '#19a89b', '#35bfb2', '#6ed6cb', '#a9e7e0'];

const TONES = {
  positive: { bg: '#e7f6ec', ink: '#166b34' },
  negative: { bg: '#fdeceb', ink: '#b3261e' },
  neutral: { bg: '#eef1f4', ink: '#5b6675' },
  brand: { bg: '#d9f2ee', ink: BRAND_DEEP },
};

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const chip = (text, tone = 'neutral') => {
  const { bg, ink } = TONES[tone] || TONES.neutral;
  return `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${bg};color:${ink};font-size:13px;line-height:17px;font-weight:600;font-family:${FONT}">${escapeHtml(text)}</span>`;
};

const heading = (text) => `
  <p style="margin:0 0 12px;color:${FAINT};font-size:11px;line-height:15px;letter-spacing:1px;text-transform:uppercase;font-weight:700;font-family:${FONT}">${escapeHtml(text)}</p>`;

const paragraph = (html, margin = '0') =>
  `<p style="margin:${margin};color:${MUTED};font-size:15px;line-height:23px;font-family:${FONT}">${html}</p>`;

const moneyCard = ({ label, value, tone }) => {
  const accent = tone === 'negative' ? '#b3261e' : tone === 'positive' ? '#166b34' : INK;
  return `
  <td width="50%" valign="top" style="padding:0 6px;font-family:${FONT}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f9fa" style="border-radius:10px;border:1px solid ${RULE}">
      <tr>
        <td style="padding:14px 16px;font-family:${FONT}">
          <p style="margin:0;color:${FAINT};font-size:11px;line-height:15px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;font-family:${FONT}">${escapeHtml(label)}</p>
          <p style="margin:6px 0 0;color:${accent};font-size:19px;line-height:25px;font-weight:700;white-space:nowrap;font-family:${FONT}">${escapeHtml(value)}</p>
        </td>
      </tr>
    </table>
  </td>`;
};

const moneyCards = (cards) => cards.length
  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px">
       <tr class="stack">${cards.map(moneyCard).join('')}</tr>
     </table>`
  : '';

const statRow = ({ label, value, tone, hint }) => `
  <tr>
    <td style="padding:12px 0;border-top:1px solid ${RULE};color:${MUTED};font-size:15px;line-height:20px;font-family:${FONT}">
      ${escapeHtml(label)}
      ${hint ? `<span style="display:block;color:${FAINT};font-size:13px;line-height:18px">${escapeHtml(hint)}</span>` : ''}
    </td>
    <td align="right" valign="top" style="padding:12px 0;border-top:1px solid ${RULE};color:${tone || INK};font-size:15px;line-height:20px;font-weight:700;white-space:nowrap;font-family:${FONT}">${escapeHtml(value)}</td>
  </tr>`;

const categoryRow = ({ name, value, share, barPct, muted }, index) => {
  const color = muted ? '#c3ccd6' : RAMP[Math.min(index, RAMP.length - 1)];
  return `
  <tr>
    <td style="padding:0 0 14px;font-family:${FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:0 0 6px;color:${muted ? MUTED : INK};font-size:14px;line-height:19px;font-weight:600;font-family:${FONT}">${escapeHtml(name)}</td>
          <td align="right" style="padding:0 0 6px;color:${muted ? MUTED : INK};font-size:14px;line-height:19px;font-weight:700;white-space:nowrap;font-family:${FONT}">${escapeHtml(value)}${share == null ? '' : `<span style="color:${FAINT};font-weight:500"> · ${share}%</span>`}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${TRACK}" style="border-radius:4px">
        <tr>
          <td style="font-size:0;line-height:0">
            <table role="presentation" width="${barPct}%" cellpadding="0" cellspacing="0" border="0">
              <tr><td bgcolor="${color}" height="8" style="height:8px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
};

const glanceCell = ({ label, value, hint }) => `
  <td width="50%" valign="top" style="padding:0 6px 12px;font-family:${FONT}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${RULE};border-radius:10px">
      <tr>
        <td style="padding:13px 15px;font-family:${FONT}">
          <p style="margin:0;color:${FAINT};font-size:11px;line-height:15px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;font-family:${FONT}">${escapeHtml(label)}</p>
          <p style="margin:5px 0 0;color:${INK};font-size:18px;line-height:24px;font-weight:700;font-family:${FONT}">${escapeHtml(value)}</p>
          ${hint ? `<p style="margin:2px 0 0;color:${FAINT};font-size:12px;line-height:17px;font-family:${FONT}">${escapeHtml(hint)}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>`;

const glanceGrid = (cells) => {
  if (!cells.length) return '';
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr class="stack">${cells.slice(i, i + 2).map(glanceCell).join('')}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px">${rows.join('')}</table>`;
};

const bullet = (title, text) => `
  <tr>
    <td width="26" valign="top" style="padding:0 0 14px;font-family:${FONT}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${TONES.brand.bg}" style="border-radius:999px">
        <tr><td width="18" height="18" align="center" style="width:18px;height:18px;color:${BRAND_DEEP};font-size:11px;line-height:18px;font-weight:700;font-family:${FONT}">&#10003;</td></tr>
      </table>
    </td>
    <td valign="top" style="padding:0 0 14px;color:${MUTED};font-size:15px;line-height:22px;font-family:${FONT}">
      <strong style="color:${INK};font-weight:700">${escapeHtml(title)}</strong> ${escapeHtml(text)}
    </td>
  </tr>`;

const section = (inner) => `<tr><td class="pad" style="padding:24px 30px 0">${inner}</td></tr>`;

const divider = `<tr><td class="pad" style="padding:24px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${RULE}" style="height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`;

const shell = ({ preheader, monthLabel, headlineLabel, headline, caption, badge, sections, ctaLabel, ctaUrl, secondary, footnote }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(monthLabel)}</title>
    <style>
      @media only screen and (max-width:440px) {
        .shell { padding:16px 8px !important; }
        .pad { padding-left:18px !important; padding-right:18px !important; }
        .hero { font-size:30px !important; line-height:38px !important; }
        .stack td { display:block !important; width:100% !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${CANVAS};-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS}">
      <tr>
        <td align="center" class="shell" style="padding:28px 16px 36px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
            <tr>
              <td bgcolor="${BRAND_DEEP}" style="padding:16px 30px;font-family:${FONT}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="color:#ffffff;font-size:14px;line-height:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:${FONT}">Finan</td>
                    <td align="right" style="color:#a7ded6;font-size:12px;line-height:20px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;font-family:${FONT}">Monthly report</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:26px 30px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND_WASH}" style="border-radius:12px;border:1px solid #cfeae5">
                  <tr>
                    <td style="padding:22px 22px 24px;font-family:${FONT}">
                      <p style="margin:0;color:${BRAND_DEEP};font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;font-weight:700;font-family:${FONT}">${escapeHtml(monthLabel)}</p>
                      <p style="margin:14px 0 0;color:${MUTED};font-size:15px;line-height:20px;font-family:${FONT}">${escapeHtml(headlineLabel)}</p>
                      <p class="hero" style="margin:2px 0 0;color:${INK};font-size:36px;line-height:44px;font-weight:800;letter-spacing:-.5px;font-family:${FONT}">${escapeHtml(headline)}</p>
                      ${badge ? `<p style="margin:12px 0 0;font-family:${FONT}">${chip(badge.text, badge.tone)}</p>` : ''}
                      <p style="margin:12px 0 0;color:${MUTED};font-size:15px;line-height:22px;font-family:${FONT}">${escapeHtml(caption)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${sections.filter(Boolean).map(section).join(divider)}
            <tr>
              <td class="pad" style="padding:28px 30px 32px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${BRAND}" style="border-radius:10px">
                      <a href="${ctaUrl}" style="display:block;padding:15px 26px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;text-align:center;font-family:${FONT}">${escapeHtml(ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
                ${secondary ? `<p style="margin:14px 0 0;color:${FAINT};font-size:13px;line-height:19px;text-align:center;font-family:${FONT}">${secondary}</p>` : ''}
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
            <tr>
              <td style="padding:18px 30px 0;color:${FAINT};font-size:12px;line-height:18px;text-align:center;font-family:${FONT}">
                ${footnote}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const monthlyReportEmail = ({
  monthLabel, subjectMonth, headlineLabel, headline, caption, badge = null,
  cards = [], lines = [], categories = [], categoryNote = null,
  comparison = [], glance = [], appUrl,
}) => ({
  subject: `${headlineLabel} ${headline} in ${subjectMonth || monthLabel}`,
  html: shell({
    preheader: `${headlineLabel} ${headline} in ${monthLabel}.`,
    monthLabel, headlineLabel, headline, caption, badge,
    sections: [
      cards.length || lines.length
        ? moneyCards(cards)
          + (lines.length
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${cards.length ? '14px' : '0'}">${lines.map(statRow).join('')}</table>`
              : '')
        : null,
      categories.length
        ? heading('Where it went')
          + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${categories.map(categoryRow).join('')}</table>`
          + (categoryNote ? paragraph(escapeHtml(categoryNote), '2px 0 0') : '')
        : null,
      comparison.length
        ? heading('Versus the month before')
          + comparison.map((text, i) => paragraph(escapeHtml(text), i === 0 ? '0' : '10px 0 0')).join('')
        : null,
      glance.length ? heading('The month at a glance') + glanceGrid(glance) : null,
    ],
    ctaLabel: 'See the full breakdown',
    ctaUrl: `${appUrl}/insights`,
    footnote: 'You get this because monthly reports are on in your preferences. Turn them off any time in the app.',
  }),
});

const nothingRecordedEmail = ({ monthLabel, subjectMonth, appUrl, lastActive = null }) => ({
  subject: `Nothing recorded in ${subjectMonth || monthLabel}`,
  html: shell({
    preheader: `Nothing was recorded in ${monthLabel} — one month of entries is what makes the rest of it work.`,
    monthLabel,
    headlineLabel: 'You recorded',
    headline: 'nothing',
    badge: lastActive ? { text: `Last tracked ${lastActive.monthLabel}`, tone: 'neutral' } : null,
    caption: lastActive
      ? 'The gap breaks every trend that needs consecutive months.'
      : 'There was nothing to summarise this month.',
    sections: [
      lastActive
        ? heading(`What ${lastActive.monthLabel} looked like`)
          + moneyCards(lastActive.cards)
          + paragraph(`That existed because the month had entries in it. ${escapeHtml(monthLabel)} has none, so there is nothing to put beside it.`, '16px 0 0')
        : null,
      heading('What one month of entries turns on')
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
             ${bullet('Where it actually goes.', 'Every category ranked by money, not by how often you noticed it.')}
             ${bullet('The charges you forgot.', 'Repeating payments get spotted on their own, with the next due date and what they cost you across a year.')}
             ${bullet('A number that is unusual for you.', 'Not a fixed threshold — your own history in that category sets the bar.')}
             ${bullet('Savings rate and net worth over time.', 'Both need consecutive months, so a skipped month is a hole in the line.')}
           </table>`,
      heading('The cheapest way to start')
        + paragraph('Log the next thing you buy. One entry, ten seconds, and the month stops being blank.')
        + paragraph('Most of the work is in the first week — after that the categories are already there and it is a couple of taps.', '10px 0 0'),
    ],
    ctaLabel: 'Add a transaction',
    ctaUrl: `${appUrl}/add`,
    secondary: 'Two or three minutes across a whole month is the entire cost.',
    footnote: 'You get this because monthly reports are on in your preferences. Turn them off any time in the app.',
  }),
});

module.exports = { monthlyReportEmail, nothingRecordedEmail };
