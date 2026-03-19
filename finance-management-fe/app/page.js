import Link from 'next/link';
import AuthRedirect from '@/components/AuthRedirect';

export const metadata = {
  title: 'Finan App — Personal Finance Tracker & Planner',
  description:
    'Track income and expenses, analyse spending patterns, plan budgets, calculate debt payoff, FIRE number, and tax estimates — all in one clean dashboard. Free to use.',
  keywords: [
    'personal finance', 'finance tracker', 'expense tracker', 'budget planner',
    'FIRE calculator', 'debt payoff', 'tax estimator Indonesia', 'PPh 21',
    'savings goal', 'net worth tracker', 'financial dashboard',
  ],
  openGraph: {
    title: 'Finan App — Personal Finance Tracker & Planner',
    description: 'Track, analyse, and plan your finances with 10 built-in financial tools.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Finan App — Personal Finance Tracker & Planner',
    description: 'Track, analyse, and plan your finances with 10 built-in financial tools.',
  },
};

// ─── Static feature data ──────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '📊',
    title: 'Smart Dashboard',
    desc: 'See your balance, monthly income, and expenses at a glance. Filter by month, search, and sort — all in real time.',
  },
  {
    icon: '📈',
    title: 'Deep Analytics',
    desc: 'Monthly and yearly spending breakdowns, category trends, and savings rate history — understand where your money actually goes.',
  },
  {
    icon: '📅',
    title: 'Custom Reports',
    desc: 'Query any date range. Get income vs expense summaries, category breakdowns, and export everything as CSV.',
  },
  {
    icon: '🔍',
    title: 'AI Insights',
    desc: 'Anomaly detection, spending velocity, explainability scores, and time-to-zero projections — powered by your own data.',
  },
  {
    icon: '💡',
    title: '10 Planning Tools',
    desc: 'From debt snowball to FIRE calculator, 50/30/20 splits to PPh 21 tax estimator — every tool a personal finance nerd needs.',
  },
  {
    icon: '🔒',
    title: 'Secure & Private',
    desc: 'JWT auth with token versioning, Google OAuth, password change invalidates all sessions. Your data stays yours.',
  },
];

const TOOLS = [
  { icon: '🛒', name: 'Can I Afford This?',  desc: 'Real-time budget check against your actual spend' },
  { icon: '📊', name: '50/30/20 Rule',        desc: 'Split income into needs, wants & savings' },
  { icon: '🎯', name: 'Savings Goal',          desc: 'Timeline calculator to any financial target' },
  { icon: '📅', name: 'Daily Budget',          desc: 'Safe daily spend for the rest of the month' },
  { icon: '🛡️', name: 'Emergency Fund',        desc: '3–6 month safety net tracker' },
  { icon: '💳', name: 'Debt Payoff',           desc: 'Snowball vs avalanche comparison' },
  { icon: '🔥', name: 'FIRE Calculator',       desc: 'Financial independence number & timeline' },
  { icon: '📉', name: 'Inflation Impact',      desc: 'How inflation erodes purchasing power' },
  { icon: '🧾', name: 'Tax Estimator',         desc: 'PPh 21 progressive bracket estimate (Indonesia)' },
  { icon: '📋', name: 'Net Worth Tracker',     desc: 'Assets vs liabilities with coverage ratio' },
];

const STEPS = [
  { n: '1', title: 'Create your account',    desc: 'Sign up free in under 30 seconds — no credit card needed. Or continue with Google.' },
  { n: '2', title: 'Log your transactions',  desc: 'Add income and expenses manually, or import a CSV file for bulk entry.' },
  { n: '3', title: 'See the full picture',   desc: 'Analytics, insights, and reports update instantly as you add data.' },
  { n: '4', title: 'Plan with confidence',   desc: 'Use the 10 built-in tools to make smarter financial decisions every month.' },
];

// ─── Components ───────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md hover:border-teal-200 transition-all group">
      <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-xl mb-4 group-hover:bg-teal-100 transition-colors">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function ToolPill({ icon, name, desc }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-teal-300 hover:bg-teal-50 transition-all group">
      <span className="text-xl shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors leading-tight">{name}</p>
        <p className="text-xs text-gray-400 leading-tight mt-0.5 truncate">{desc}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      {/* Redirect logged-in users to dashboard (client-side only) */}
      <AuthRedirect to="/dashboard" />

      <div className="min-h-screen bg-white">

        {/* ── Nav ── */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <span className="font-bold text-xl text-teal-600 tracking-tight">Finan App</span>
            <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600 font-medium">
              <a href="#features" className="hover:text-teal-600 transition-colors">Features</a>
              <a href="#tools" className="hover:text-teal-600 transition-colors">Tools</a>
              <a href="#how" className="hover:text-teal-600 transition-colors">How it works</a>
            </nav>
            <div className="flex items-center gap-2">
              <Link href="/login"
                className="px-3.5 py-1.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                Sign in
              </Link>
              <Link href="/register"
                className="px-3.5 py-1.5 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                Get started
              </Link>
            </div>
          </div>
        </header>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-50 via-white to-emerald-50 pt-20 pb-24 sm:pt-28 sm:pb-32">
          {/* Background decoration */}
          <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-teal-100/50 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-emerald-100/40 blur-3xl" />
          </div>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              10 financial tools · Free to use
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight tracking-tight mb-6">
              Take control of
              <span className="block text-teal-600">your money</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Track every rupiah, understand your spending patterns, and plan your financial future — all in one clean, fast dashboard.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/register"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-teal-600 text-white font-semibold text-base hover:bg-teal-700 active:scale-95 transition-all shadow-lg shadow-teal-200">
                Start for free
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link href="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white border border-gray-200 text-gray-700 font-semibold text-base hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all">
                Sign in
              </Link>
            </div>

            <p className="text-xs text-gray-400 mt-4">No credit card · Free account · Google OAuth supported</p>
          </div>

          {/* Mock dashboard preview */}
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 mt-16">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-200/60 overflow-hidden">
              {/* Fake navbar */}
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-4">
                <span className="font-bold text-sm text-teal-600">Finan App</span>
                <div className="flex gap-2 flex-1">
                  {['Dashboard', 'Analytics', 'Reports', 'Planner', 'Insights'].map(n => (
                    <span key={n} className="text-xs text-gray-400 px-2 py-1 rounded-lg hidden sm:block">{n}</span>
                  ))}
                </div>
                <div className="w-20 h-6 bg-teal-600 rounded-lg opacity-80" />
              </div>
              {/* Fake stat cards */}
              <div className="p-5 bg-gray-50">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Balance', val: 'Rp 19.200.000', color: 'text-gray-900' },
                    { label: 'Income', val: 'Rp 30.000.000', color: 'text-emerald-600' },
                    { label: 'Expense', val: 'Rp 10.800.000', color: 'text-rose-600' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      <p className={`text-sm sm:text-base font-bold ${color}`}>{val}</p>
                    </div>
                  ))}
                </div>
                {/* Fake table rows */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">Transactions</span>
                    <span className="text-xs text-gray-400">Mar 2026</span>
                  </div>
                  {[
                    { desc: 'Gaji bulanan', cat: 'Salary', amt: '+Rp 30.000.000', type: 'income' },
                    { desc: 'Bayar kos', cat: 'Rent', amt: '−Rp 3.500.000', type: 'expense' },
                    { desc: 'Makan siang', cat: 'Food', amt: '−Rp 85.000', type: 'expense' },
                    { desc: 'Transfer savings', cat: 'Investment', amt: '−Rp 5.000.000', type: 'expense' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-300 w-4">{i+1}</span>
                      <span className="text-xs text-gray-700 flex-1 truncate">{r.desc}</span>
                      <span className="text-xs text-gray-400 hidden sm:block">{r.cat}</span>
                      <span className={`text-xs font-semibold ${r.type === 'income' ? 'text-emerald-600' : 'text-gray-700'}`}>{r.amt}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {r.type === 'income' ? '↑' : '↓'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Everything you need</h2>
              <p className="text-gray-500 max-w-xl mx-auto">One app that covers tracking, analytics, reporting, insights, and planning — no spreadsheet juggling.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map(f => <FeatureCard key={f.title} {...f} />)}
            </div>
          </div>
        </section>

        {/* ── Tools ── */}
        <section id="tools" className="py-20 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">10 financial planning tools</h2>
              <p className="text-gray-500 max-w-xl mx-auto">From daily spending checks to retirement planning — each tool gives you instant, actionable numbers.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-10">
              {TOOLS.map(t => <ToolPill key={t.name} {...t} />)}
            </div>
            <div className="text-center">
              <Link href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors">
                Try all tools free
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Up and running in minutes</h2>
              <p className="text-gray-500 max-w-xl mx-auto">No complex setup, no tutorials. Just sign up and start adding transactions.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {STEPS.map(({ n, title, desc }) => (
                <div key={n} className="relative">
                  {/* connector line */}
                  <div className="hidden lg:block absolute top-5 left-full w-6 border-t-2 border-dashed border-teal-200 -translate-x-0 last:hidden" />
                  <div className="w-10 h-10 rounded-xl bg-teal-600 text-white font-black text-base flex items-center justify-center mb-4 shadow-md shadow-teal-200">
                    {n}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <section className="py-14 bg-teal-600">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center text-white">
              {[
                { val: '10',  unit: 'tools',     label: 'Planning tools built-in' },
                { val: '∞',   unit: 'months',    label: 'of transaction history' },
                { val: 'CSV', unit: '',           label: 'Import & export support' },
                { val: '0',   unit: 'cost',       label: 'Always free to use' },
              ].map(({ val, unit, label }) => (
                <div key={label}>
                  <p className="text-3xl font-black">{val}<span className="text-lg ml-1 opacity-70">{unit}</span></p>
                  <p className="text-sm text-teal-100 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-24 bg-gradient-to-br from-gray-50 to-teal-50">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
              Start tracking today.<br />
              <span className="text-teal-600">It&apos;s completely free.</span>
            </h2>
            <p className="text-gray-500 mb-8 text-lg">
              No ads, no paywalls, no credit card required. Just a clean finance dashboard that respects your time and data.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/register"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-teal-600 text-white font-bold text-base hover:bg-teal-700 active:scale-95 transition-all shadow-xl shadow-teal-200">
                Create free account
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border border-gray-200 bg-white text-gray-700 font-bold text-base hover:bg-gray-50 active:scale-95 transition-all">
                Already have an account
              </Link>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
