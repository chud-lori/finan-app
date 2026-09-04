const moment = require('moment-timezone');
const Preference = require('../models/preference.model');
const EmailReport = require('../models/emailReport.model');
const Snapshot = require('../models/snapshot.model');
const User = require('../models/user.model');
const { sendMonthlyReportEmail } = require('../helpers/mailer');
const { getSavingsCategoryNames } = require('../helpers/savingsCategories');
const logger = require('../helpers/logger');

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_PER_SWEEP = 50;

const previousYearMonth = (now, tz) => moment(now).tz(tz).subtract(1, 'month').format('YYYY-MM');

const savingsOutflow = (snapshot, savingsNames) =>
  (snapshot.byCategory || [])
    .filter(c => savingsNames.has(String(c.category || '').toLowerCase()))
    .reduce((sum, c) => sum + (c.total || 0), 0);

const buildReportLines = (snapshot, savingsNames, formatAmount) => {
  const income = snapshot.income || 0;
  const saved = savingsOutflow(snapshot, savingsNames);
  const spent = Math.max(0, (snapshot.expense || 0) - saved);
  const rate = income > 0 ? Math.round(((income - spent) / income) * 100) : null;

  const lines = [
    { label: 'Money in', value: formatAmount(income) },
    { label: 'Money out', value: formatAmount(spent) },
  ];
  if (saved > 0) lines.push({ label: 'Moved to savings', value: formatAmount(saved) });
  if (rate !== null) lines.push({ label: 'Savings rate', value: `${rate}%` });
  return lines;
};

const hasSomethingToSay = (snapshot) =>
  !!snapshot && ((snapshot.income || 0) > 0 || (snapshot.expense || 0) > 0);

const formatterFor = (preference) => {
  const separator = preference?.numberFormat === 'comma' ? ',' : '.';
  const currency = preference?.currency || 'IDR';
  return (amount) => {
    const digits = Math.round(Math.abs(amount || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return `${currency} ${digits}`;
  };
};

const dueRecipients = async (now) => {
  const enabled = await Preference.find({ monthlyEmailReport: true }).select('user currency timezone numberFormat').lean();
  if (!enabled.length) return [];

  const due = [];
  for (const preference of enabled) {
    const yearMonth = previousYearMonth(now, preference.timezone || 'Asia/Jakarta');
    const alreadySent = await EmailReport.exists({ user: preference.user, yearMonth });
    if (alreadySent) continue;

    const user = await User.findById(preference.user).select('email emailVerified').lean();
    if (!user || user.emailVerified === false || !user.email) continue;

    due.push({ preference, user, yearMonth });
    if (due.length >= MAX_PER_SWEEP) break;
  }
  return due;
};

const sendDueReports = async (now = new Date()) => {
  let sent = 0;
  for (const { preference, user, yearMonth } of await dueRecipients(now)) {
    const snapshot = await Snapshot.findOne({ user: preference.user, yearMonth }).lean();
    if (!hasSomethingToSay(snapshot)) continue;

    try {
      const savingsNames = await getSavingsCategoryNames(preference.user);
      const monthLabel = moment(yearMonth, 'YYYY-MM').format('MMMM YYYY');
      await sendMonthlyReportEmail(user.email, {
        monthLabel,
        narrative: `Here is how ${monthLabel} closed out.`,
        lines: buildReportLines(snapshot, savingsNames, formatterFor(preference)),
        appUrl: process.env.APP_URL || 'https://finance.lori.my.id',
      });
      await EmailReport.create({ user: preference.user, yearMonth });
      sent += 1;
    } catch (error) {
      logger.error(`Monthly report failed for ${preference.user}: ${error.message}`);
    }
  }
  return sent;
};

const startMonthlyReportSweeper = () => {
  const timer = setInterval(() => {
    sendDueReports().catch(error => logger.error(`Monthly report sweep failed: ${error.message}`));
  }, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
};

module.exports = {
  buildReportLines,
  hasSomethingToSay,
  previousYearMonth,
  savingsOutflow,
  formatterFor,
  dueRecipients,
  sendDueReports,
  startMonthlyReportSweeper,
  SWEEP_INTERVAL_MS,
};
