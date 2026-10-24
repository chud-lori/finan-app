const moment = require('moment-timezone');
const Snapshot = require('../../models/snapshot.model');
const NetWorth = require('../../models/netWorth.model');
const Goal = require('../../models/goal.model');
const Transaction = require('../../models/transaction.model');
const Preference = require('../../models/preference.model');
const { getSavingsCategoryNames } = require('../../helpers/savingsCategories');

const MAX_MONTHS = 24;
const MAX_TRANSACTIONS = 100;

// An export page is a whole analysis window, not a screenful. The cap is what a
// model can actually hold, and `next_cursor` carries the rest.
const EXPORT_PAGE = 1000;
const EXPORT_MAX_PAGE = 2000;

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_MONTH_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const preferenceFor = async (userId) =>
  (await Preference.findOne({ user: userId }).select('currency timezone').lean()) || {};

const round = (n) => Math.round(n || 0);

const monthsBack = (count, tz) => {
  const months = [];
  const cursor = moment.tz(tz).startOf('month');
  for (let i = 0; i < count; i += 1) months.push(cursor.clone().subtract(i, 'month').format('YYYY-MM'));
  return months;
};

const spendOf = (snapshot, savingsNames) => {
  const saved = (snapshot.byCategory || [])
    .filter(c => savingsNames.has(String(c.category || '').toLowerCase()))
    .reduce((sum, c) => sum + (c.total || 0), 0);
  return { saved: round(saved), spent: Math.max(0, round((snapshot.expense || 0) - saved)) };
};

const getMonthlySummary = async (userId, args = {}) => {
  const { timezone = 'Asia/Jakarta', currency = 'IDR' } = await preferenceFor(userId);
  const count = Math.min(Math.max(Number(args.months) || 3, 1), MAX_MONTHS);

  const wanted = args.month && YEAR_MONTH.test(args.month) ? [args.month] : monthsBack(count, timezone);
  const [snapshots, savingsNames] = await Promise.all([
    Snapshot.find({ user: userId, yearMonth: { $in: wanted } }).lean(),
    getSavingsCategoryNames(userId),
  ]);

  const byMonth = new Map(snapshots.map(s => [s.yearMonth, s]));
  const months = wanted.map((yearMonth) => {
    const snapshot = byMonth.get(yearMonth);
    if (!snapshot) return { month: yearMonth, recorded: false };
    const { saved, spent } = spendOf(snapshot, savingsNames);
    const income = round(snapshot.income);
    return {
      month: yearMonth,
      recorded: true,
      income,
      spent,
      moved_to_savings: saved,
      net: income - spent,
      savings_rate_percent: income > 0 ? Math.round(((income - spent) / income) * 100) : null,
      transactions: snapshot.txCount || 0,
    };
  });

  return { currency, timezone, months };
};

const getSpendingByCategory = async (userId, args = {}) => {
  const { timezone = 'Asia/Jakarta', currency = 'IDR' } = await preferenceFor(userId);
  const month = args.month && YEAR_MONTH.test(args.month)
    ? args.month
    : moment.tz(timezone).format('YYYY-MM');

  const [snapshot, savingsNames] = await Promise.all([
    Snapshot.findOne({ user: userId, yearMonth: month }).lean(),
    getSavingsCategoryNames(userId),
  ]);
  if (!snapshot) return { currency, month, recorded: false, categories: [] };

  const { spent } = spendOf(snapshot, savingsNames);
  const categories = (snapshot.byCategory || [])
    .filter(c => !savingsNames.has(String(c.category || '').toLowerCase()) && (c.total || 0) > 0)
    .map(c => ({
      category: c.category,
      total: round(c.total),
      transactions: c.count || 0,
      share_percent: spent > 0 ? Math.round((c.total / spent) * 100) : null,
    }))
    .sort((a, b) => b.total - a.total);

  return { currency, month, recorded: true, total_spent: spent, categories };
};

const getNetWorth = async (userId) => {
  const { currency = 'IDR' } = await preferenceFor(userId);
  const doc = await NetWorth.findOne({ user: userId }).lean();
  if (!doc) return { currency, recorded: false };

  const sum = (rows) => rows.reduce((total, row) => total + (row.amount || 0), 0);
  const assets = round(sum(doc.assets || []));
  const liabilities = round(sum(doc.liabilities || []));

  return {
    currency,
    recorded: true,
    assets,
    liabilities,
    net_worth: assets - liabilities,
    asset_breakdown: (doc.assets || []).map(a => ({ label: a.label, amount: round(a.amount), type: a.type })),
    liability_breakdown: (doc.liabilities || []).map(l => ({ label: l.label, amount: round(l.amount), type: l.type })),
  };
};

const getGoals = async (userId) => {
  const { currency = 'IDR' } = await preferenceFor(userId);
  const goals = await Goal.find({ user: userId }).select('description price savedAmount achieve kind').lean();
  return {
    currency,
    goals: goals.map(goal => ({
      description: goal.description,
      target: round(goal.price),
      saved: round(goal.savedAmount),
      progress_percent: goal.price > 0 ? Math.round(((goal.savedAmount || 0) / goal.price) * 100) : null,
      achieved: goal.achieve === 1,
      kind: goal.kind || 'general',
    })),
  };
};

// Descriptions are the identifying part of a ledger — merchant names, people,
// places. They stay out unless the caller asks for them by name.
const listTransactions = async (userId, args = {}) => {
  const { timezone = 'Asia/Jakarta', currency = 'IDR' } = await preferenceFor(userId);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), MAX_TRANSACTIONS);

  const filter = { user: userId };
  if (args.type === 'income' || args.type === 'expense') filter.type = args.type;
  if (args.category) filter.category = String(args.category);
  if (args.month && YEAR_MONTH.test(args.month)) {
    const start = moment.tz(`${args.month}-01`, 'YYYY-MM-DD', timezone);
    filter.time = { $gte: start.toDate(), $lt: start.clone().add(1, 'month').toDate() };
  }

  const select = args.include_descriptions === true
    ? 'amount type category time description'
    : 'amount type category time';

  const rows = await Transaction.find(filter).select(select).sort({ time: -1 }).limit(limit).lean();

  return {
    currency,
    count: rows.length,
    descriptions_included: args.include_descriptions === true,
    transactions: rows.map(row => ({
      date: moment(row.time).tz(timezone).format('YYYY-MM-DD'),
      type: row.type,
      category: row.category,
      amount: round(row.amount),
      ...(args.include_descriptions === true ? { description: row.description } : {}),
    })),
  };
};

// Whole-ledger read for analysis, paged by time so a caller can walk the entire
// history without holding it all at once. Ordered oldest-first so appended pages
// read as one continuous series.
const exportTransactions = async (userId, args = {}) => {
  const { timezone = 'Asia/Jakarta', currency = 'IDR' } = await preferenceFor(userId);
  const limit = Math.min(Math.max(Number(args.limit) || EXPORT_PAGE, 1), EXPORT_MAX_PAGE);

  const filter = { user: userId };
  if (args.type === 'income' || args.type === 'expense') filter.type = args.type;
  if (args.category) filter.category = String(args.category);

  const range = {};
  if (args.from && YEAR_MONTH_DAY.test(args.from)) {
    range.$gte = moment.tz(args.from, 'YYYY-MM-DD', timezone).startOf('day').toDate();
  }
  if (args.to && YEAR_MONTH_DAY.test(args.to)) {
    range.$lte = moment.tz(args.to, 'YYYY-MM-DD', timezone).endOf('day').toDate();
  }
  // The cursor is the last row's timestamp, so paging cannot skip or repeat a
  // row the way a numeric offset does when the ledger changes mid-walk.
  if (args.cursor) {
    const after = new Date(args.cursor);
    if (!Number.isNaN(after.getTime())) range.$gt = range.$gt && range.$gt > after ? range.$gt : after;
  }
  if (Object.keys(range).length) filter.time = range;

  const select = args.include_descriptions === true
    ? 'amount type category time description currency'
    : 'amount type category time currency';

  const rows = await Transaction.find(filter).select(select).sort({ time: 1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  const totals = page.reduce((acc, row) => {
    if (row.type === 'income') acc.income += row.amount || 0;
    else acc.expense += row.amount || 0;
    return acc;
  }, { income: 0, expense: 0 });

  return {
    currency,
    timezone,
    count: page.length,
    has_more: hasMore,
    next_cursor: hasMore && page.length ? page[page.length - 1].time.toISOString() : null,
    descriptions_included: args.include_descriptions === true,
    page_totals: { income: round(totals.income), expense: round(totals.expense) },
    transactions: page.map(row => ({
      date: moment(row.time).tz(timezone).format('YYYY-MM-DD'),
      time: row.time.toISOString(),
      type: row.type,
      category: row.category,
      amount: round(row.amount),
      ...(args.include_descriptions === true ? { description: row.description } : {}),
    })),
  };
};

const getLedgerRange = async (userId) => {
  const { timezone = 'Asia/Jakarta', currency = 'IDR' } = await preferenceFor(userId);
  const [oldest, newest, total] = await Promise.all([
    Transaction.findOne({ user: userId }).select('time').sort({ time: 1 }).lean(),
    Transaction.findOne({ user: userId }).select('time').sort({ time: -1 }).lean(),
    Transaction.countDocuments({ user: userId }),
  ]);
  if (!total) return { currency, timezone, total_transactions: 0, recorded: false };

  return {
    currency,
    timezone,
    recorded: true,
    total_transactions: total,
    first_transaction: moment(oldest.time).tz(timezone).format('YYYY-MM-DD'),
    last_transaction: moment(newest.time).tz(timezone).format('YYYY-MM-DD'),
    suggested_page_size: EXPORT_PAGE,
    pages_at_suggested_size: Math.ceil(total / EXPORT_PAGE),
  };
};

const TOOLS = [
  {
    name: 'get_monthly_summary',
    description: 'Income, spending, savings rate and transaction count for recent months. Savings-group transfers are counted as kept, not spent.',
    scope: 'finan:read',
    inputSchema: {
      type: 'object',
      properties: {
        months: { type: 'integer', description: 'How many recent months to return (1-24, default 3)' },
        month: { type: 'string', description: 'A single month as YYYY-MM. Overrides months.' },
      },
      additionalProperties: false,
    },
    handler: getMonthlySummary,
  },
  {
    name: 'get_spending_by_category',
    description: 'Spending broken down by category for one month, ranked by amount, with each category share of the month total.',
    scope: 'finan:read',
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'Month as YYYY-MM. Defaults to the current month.' } },
      additionalProperties: false,
    },
    handler: getSpendingByCategory,
  },
  {
    name: 'get_net_worth',
    description: 'Current assets, liabilities and net worth, with the per-holding breakdown.',
    scope: 'finan:read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: getNetWorth,
  },
  {
    name: 'get_goals',
    description: 'Savings goals with target, amount saved and progress.',
    scope: 'finan:read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: getGoals,
  },
  {
    name: 'list_transactions',
    description: 'Individual transactions, newest first. Descriptions are withheld unless include_descriptions is set to true.',
    scope: 'finan:read',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '1-100, default 20' },
        month: { type: 'string', description: 'Month as YYYY-MM' },
        type: { type: 'string', enum: ['income', 'expense'] },
        category: { type: 'string' },
        include_descriptions: { type: 'boolean', description: 'Include the free-text description of each transaction. Off by default, because descriptions carry merchant and personal detail.' },
      },
      additionalProperties: false,
    },
    handler: listTransactions,
  },
  {
    name: 'get_ledger_range',
    description: 'How much history exists: total transaction count, first and last dates, and how many pages export_transactions will take. Call this before exporting so you know the size of the job.',
    scope: 'finan:read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: getLedgerRange,
  },
  {
    name: 'export_transactions',
    description: 'The full ledger for analysis, oldest first, paged. Returns up to 1000 rows per call with a next_cursor; pass it back to continue until has_more is false. Narrow with from/to/type/category when the whole history is more than you need.',
    scope: 'finan:read',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Rows per page, 1-2000, default 1000' },
        cursor: { type: 'string', description: 'The next_cursor from the previous page' },
        from: { type: 'string', description: 'Earliest date, YYYY-MM-DD' },
        to: { type: 'string', description: 'Latest date, YYYY-MM-DD' },
        type: { type: 'string', enum: ['income', 'expense'] },
        category: { type: 'string' },
        include_descriptions: { type: 'boolean', description: 'Include free-text descriptions. Off by default — they carry merchant and personal detail.' },
      },
      additionalProperties: false,
    },
    handler: exportTransactions,
  },
];

const findTool = (name) => TOOLS.find(tool => tool.name === name) || null;

const listToolDefinitions = (scopes) => TOOLS
  .filter(tool => scopes.includes(tool.scope))
  .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

module.exports = { TOOLS, findTool, listToolDefinitions };
