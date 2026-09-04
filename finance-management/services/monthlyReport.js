const moment = require('moment-timezone');
const Preference = require('../models/preference.model');
const EmailReport = require('../models/emailReport.model');
const Snapshot = require('../models/snapshot.model');
const NetWorthSnapshot = require('../models/netWorthSnapshot.model');
const MLInsight = require('../models/mlinsight.model');
const User = require('../models/user.model');
const { sendMonthlyReportEmail, sendNothingRecordedEmail } = require('../helpers/mailer');
const { getSavingsCategoryNames } = require('../helpers/savingsCategories');
const { materialityFloor, isMaterial } = require('../helpers/materiality');
const { pctChange, topMover } = require('./ml/recap');
const logger = require('../helpers/logger');
const { FE_URL } = require('../config/keys');

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_PER_SWEEP = 50;
const TOP_CATEGORIES = 5;

const previousYearMonth = (now, tz) => moment(now).tz(tz).subtract(1, 'month').format('YYYY-MM');

const monthLabelOf = (yearMonth) => moment(yearMonth, 'YYYY-MM').format('MMMM YYYY');

const titleCase = (name) => String(name || '')
  .split(' ')
  .filter(Boolean)
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const savingsOutflow = (snapshot, savingsNames) =>
  (snapshot.byCategory || [])
    .filter(c => savingsNames.has(String(c.category || '').toLowerCase()))
    .reduce((sum, c) => sum + (c.total || 0), 0);

const spendOf = (snapshot, savingsNames) =>
  Math.max(0, (snapshot?.expense || 0) - savingsOutflow(snapshot || {}, savingsNames));

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
  if (rate !== null) lines.push({ label: 'Savings rate', value: `${rate}%`, tone: rate >= 0 ? '#166b34' : '#b3261e' });
  return lines;
};

const buildMoneyCards = (snapshot, savingsNames, formatAmount) => {
  const income = snapshot.income || 0;
  const saved = savingsOutflow(snapshot, savingsNames);
  const spent = Math.max(0, (snapshot.expense || 0) - saved);
  return [
    { label: 'Money in', value: formatAmount(income), tone: 'positive' },
    { label: 'Money out', value: formatAmount(spent), tone: 'negative' },
  ];
};

const buildSummaryLines = (snapshot, savingsNames, formatAmount) => {
  const income = snapshot.income || 0;
  const saved = savingsOutflow(snapshot, savingsNames);
  const spent = Math.max(0, (snapshot.expense || 0) - saved);
  const rate = income > 0 ? Math.round(((income - spent) / income) * 100) : null;

  const lines = [];
  if (saved > 0) lines.push({ label: 'Moved to savings', value: formatAmount(saved), hint: 'Counted as kept, not spent' });
  if (rate !== null) lines.push({ label: 'Savings rate', value: `${rate}%`, tone: rate >= 0 ? '#166b34' : '#b3261e' });
  return lines;
};

const buildHeadline = (snapshot, savingsNames, formatAmount) => {
  const income = snapshot.income || 0;
  const saved = savingsOutflow(snapshot, savingsNames);
  const spent = Math.max(0, (snapshot.expense || 0) - saved);
  const kept = income - spent;

  if (income > 0 && kept >= 0) {
    return {
      headlineLabel: 'You kept',
      headline: formatAmount(kept),
      caption: `${formatAmount(income)} came in and ${formatAmount(spent)} went out.`,
    };
  }
  if (income > 0) {
    return {
      headlineLabel: 'You spent over by',
      headline: formatAmount(Math.abs(kept)),
      caption: `${formatAmount(spent)} went out against ${formatAmount(income)} in.`,
    };
  }
  return {
    headlineLabel: 'You spent',
    headline: formatAmount(spent),
    caption: 'No income was recorded this month.',
  };
};

const buildBadge = (snapshot, prior, savingsNames, formatAmount, priorLabel) => {
  if (!prior) return null;
  const spent = spendOf(snapshot, savingsNames);
  const priorSpent = spendOf(prior, savingsNames);
  if (!(priorSpent > 0)) return null;

  const diff = spent - priorSpent;
  if (!isMaterial(diff, materialityFloor(spent, priorSpent))) {
    return { text: `Spending held steady against ${priorLabel}`, tone: 'neutral' };
  }
  const pct = pctChange(spent, priorSpent);
  const suffix = pct == null ? '' : ` (${Math.abs(pct)}%)`;
  return diff < 0
    ? { text: `${formatAmount(Math.abs(diff))} less than ${priorLabel}${suffix}`, tone: 'positive' }
    : { text: `${formatAmount(diff)} more than ${priorLabel}${suffix}`, tone: 'negative' };
};

const buildCategories = (snapshot, savingsNames, formatAmount) => {
  const spend = (snapshot.byCategory || [])
    .filter(c => !savingsNames.has(String(c.category || '').toLowerCase()))
    .map(c => ({ name: c.category, total: c.total || 0 }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);

  if (!spend.length) return { categories: [], categoryNote: null };

  const total = spend.reduce((sum, c) => sum + c.total, 0);
  const shown = spend.slice(0, TOP_CATEGORIES);
  const widest = shown[0].total;
  const share = (value) => (total > 0 ? Math.round((value / total) * 100) : null);

  const categories = shown.map(c => ({
    name: titleCase(c.name),
    value: formatAmount(c.total),
    share: share(c.total),
    barPct: Math.max(3, Math.round((c.total / widest) * 100)),
  }));

  const rest = spend.slice(TOP_CATEGORIES);
  if (rest.length) {
    const restTotal = rest.reduce((sum, c) => sum + c.total, 0);
    categories.push({
      name: `${rest.length} smaller categor${rest.length === 1 ? 'y' : 'ies'}`,
      value: formatAmount(restTotal),
      share: share(restTotal),
      barPct: Math.max(3, Math.round((restTotal / widest) * 100)),
      muted: true,
    });
  }

  const topShare = share(shown[0].total);
  const categoryNote = topShare != null && shown.length > 1
    ? `${titleCase(shown[0].name)} alone took ${topShare}% of everything that went out.`
    : null;

  return { categories, categoryNote };
};

const buildComparison = (snapshot, prior, savingsNames, formatAmount, priorLabel) => {
  if (!prior) return [];

  const spent = spendOf(snapshot, savingsNames);
  const priorSpent = spendOf(prior, savingsNames);
  const floor = materialityFloor(spent, priorSpent);
  const lines = [];

  const diff = spent - priorSpent;
  if (priorSpent > 0 && isMaterial(diff, floor)) {
    const pct = pctChange(spent, priorSpent);
    const suffix = pct == null ? '' : ` — ${Math.abs(pct)}%`;
    lines.push(diff < 0
      ? `You spent ${formatAmount(Math.abs(diff))} less than in ${priorLabel}${suffix}.`
      : `You spent ${formatAmount(diff)} more than in ${priorLabel}${suffix}.`);
  } else if (priorSpent > 0) {
    lines.push(`Your spending was level with ${priorLabel}.`);
  }

  const spendable = (s) => (s.byCategory || []).filter(c => !savingsNames.has(String(c.category || '').toLowerCase()));
  const mover = topMover(spendable(snapshot), spendable(prior), floor);
  if (mover) {
    lines.push(mover.count === 1
      ? `${titleCase(mover.category)} rose the most, up ${formatAmount(mover.change)} on a single purchase rather than a new habit.`
      : `${titleCase(mover.category)} rose the most, up ${formatAmount(mover.change)} from ${formatAmount(mover.from)} to ${formatAmount(mover.to)}.`);
  }

  const incomeDiff = (snapshot.income || 0) - (prior.income || 0);
  if ((prior.income || 0) > 0 && isMaterial(incomeDiff, materialityFloor(snapshot.income || 0, prior.income || 0))) {
    lines.push(incomeDiff > 0
      ? `Income was ${formatAmount(incomeDiff)} higher than ${priorLabel}.`
      : `Income was ${formatAmount(Math.abs(incomeDiff))} lower than ${priorLabel}.`);
  }

  return lines;
};

const buildGlance = ({ snapshot, netWorth, streak, anomalyCount, formatAmount }) => {
  const cells = [];
  const txCount = snapshot.txCount || 0;
  if (txCount > 0) {
    cells.push({ label: 'Transactions logged', value: String(txCount) });
  }

  if (netWorth?.current != null) {
    const delta = netWorth.prior == null ? null : netWorth.current - netWorth.prior;
    const hint = delta == null
      ? 'First reading on record'
      : isMaterial(delta, materialityFloor(netWorth.current, netWorth.prior))
        ? `${delta > 0 ? 'Up' : 'Down'} ${formatAmount(Math.abs(delta))} on the month`
        : 'Broadly flat on the month';
    cells.push({ label: 'Net worth', value: formatAmount(netWorth.current), hint });
  }

  if (streak?.longest > 0) {
    cells.push({
      label: 'Longest logging streak',
      value: `${streak.longest} day${streak.longest === 1 ? '' : 's'}`,
      hint: streak.current > 1 ? `${streak.current} days running right now` : null,
    });
  }

  if (anomalyCount != null && anomalyCount > 0) {
    cells.push({
      label: 'Flagged as unusual',
      value: `${anomalyCount} purchase${anomalyCount === 1 ? '' : 's'}`,
      hint: 'Measured against your own history',
    });
  }

  return cells;
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

const dueRecipients = async (now, { force = false, onlyUser = null } = {}) => {
  const filter = { monthlyEmailReport: true };
  if (onlyUser) filter.user = onlyUser;
  const enabled = await Preference.find(filter).select('user currency timezone numberFormat').lean();
  if (!enabled.length) return [];

  const due = [];
  for (const preference of enabled) {
    const yearMonth = previousYearMonth(now, preference.timezone || 'Asia/Jakarta');
    if (!force && await EmailReport.exists({ user: preference.user, yearMonth })) continue;

    const user = await User.findById(preference.user).select('email emailVerified').lean();
    if (!user || user.emailVerified === false || !user.email) continue;

    due.push({ preference, user, yearMonth });
    if (due.length >= MAX_PER_SWEEP) break;
  }
  return due;
};

const buildReportPayload = async (userId, yearMonth, preference, snapshot) => {
  const priorYm = moment(yearMonth, 'YYYY-MM').subtract(1, 'month').format('YYYY-MM');
  const [prior, nwCurrent, nwPrior, user, mlDoc, savingsNames] = await Promise.all([
    Snapshot.findOne({ user: userId, yearMonth: priorYm }).lean(),
    NetWorthSnapshot.findOne({ user: userId, yearMonth }).select('netWorth').lean(),
    NetWorthSnapshot.findOne({ user: userId, yearMonth: priorYm }).select('netWorth').lean(),
    User.findById(userId).select('streakDays longestStreak').lean(),
    MLInsight.findOne({ user: userId, yearMonth }).select('anomalyCount').lean(),
    getSavingsCategoryNames(userId),
  ]);

  const formatAmount = formatterFor(preference);
  const priorLabel = moment(priorYm, 'YYYY-MM').format('MMMM');
  const { categories, categoryNote } = buildCategories(snapshot, savingsNames, formatAmount);

  return {
    monthLabel: monthLabelOf(yearMonth),
    ...buildHeadline(snapshot, savingsNames, formatAmount),
    badge: buildBadge(snapshot, prior, savingsNames, formatAmount, priorLabel),
    cards: buildMoneyCards(snapshot, savingsNames, formatAmount),
    lines: buildSummaryLines(snapshot, savingsNames, formatAmount),
    categories,
    categoryNote,
    comparison: buildComparison(snapshot, prior, savingsNames, formatAmount, priorLabel),
    glance: buildGlance({
      snapshot,
      netWorth: { current: nwCurrent ? nwCurrent.netWorth : null, prior: nwPrior ? nwPrior.netWorth : null },
      streak: { current: user?.streakDays || 0, longest: user?.longestStreak || 0 },
      anomalyCount: mlDoc ? (mlDoc.anomalyCount ?? null) : null,
      formatAmount,
    }),
    appUrl: FE_URL,
  };
};

const buildBlankPayload = async (userId, yearMonth, preference) => {
  const previous = await Snapshot.find({ user: userId, yearMonth: { $lt: yearMonth } })
    .sort({ yearMonth: -1 })
    .limit(1)
    .lean();

  const last = previous.find(hasSomethingToSay) || null;
  let lastActive = null;
  if (last) {
    const savingsNames = await getSavingsCategoryNames(userId);
    const formatAmount = formatterFor(preference);
    lastActive = {
      monthLabel: monthLabelOf(last.yearMonth),
      cards: buildMoneyCards(last, savingsNames, formatAmount),
    };
  }

  return { monthLabel: monthLabelOf(yearMonth), appUrl: FE_URL, lastActive };
};

const sendDueReports = async (now = new Date(), options = {}) => {
  const { dryRun = false, force = false, onlyUser = null, overrideTo = null } = options;
  let sent = 0;
  for (const { preference, user, yearMonth } of await dueRecipients(now, { force, onlyUser })) {
    const snapshot = await Snapshot.findOne({ user: preference.user, yearMonth }).lean();

    try {
      const recipient = overrideTo || user.email;
      if (dryRun) {
        logger.info(`[dry run] would send ${hasSomethingToSay(snapshot) ? 'report' : 'blank-month note'} for ${yearMonth} to ${recipient}`);
      } else if (!hasSomethingToSay(snapshot)) {
        await sendNothingRecordedEmail(recipient, await buildBlankPayload(preference.user, yearMonth, preference));
      } else {
        await sendMonthlyReportEmail(recipient, await buildReportPayload(preference.user, yearMonth, preference, snapshot));
      }
      if (!dryRun && !overrideTo) await EmailReport.create({ user: preference.user, yearMonth });
      sent += 1;
    } catch (error) {
      logger.error(`Monthly report failed for ${preference.user}: ${error.message}`);
    }
  }
  return sent;
};

const FIRST_SWEEP_DELAY_MS = 60 * 1000;

const sweep = () => sendDueReports()
  .then(sent => { if (sent > 0) logger.info(`Monthly report sweep sent ${sent} report(s)`); })
  .catch(error => logger.error(`Monthly report sweep failed: ${error.message}`));

const startMonthlyReportSweeper = () => {
  logger.info(`Monthly report sweeper on — every ${SWEEP_INTERVAL_MS / 60000} min, first run in ${FIRST_SWEEP_DELAY_MS / 1000}s`);
  setTimeout(sweep, FIRST_SWEEP_DELAY_MS).unref();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
};

module.exports = {
  buildReportLines,
  buildSummaryLines,
  buildMoneyCards,
  buildHeadline,
  buildBadge,
  buildCategories,
  buildComparison,
  buildGlance,
  hasSomethingToSay,
  previousYearMonth,
  savingsOutflow,
  formatterFor,
  dueRecipients,
  buildReportPayload,
  buildBlankPayload,
  sendDueReports,
  startMonthlyReportSweeper,
  SWEEP_INTERVAL_MS,
  FIRST_SWEEP_DELAY_MS,
};
