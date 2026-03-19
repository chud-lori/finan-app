import Link from 'next/link';
import Reveal from '@/components/Reveal';
import LandingNav from '@/components/LandingNav';
import LandingHeroCTA from '@/components/LandingHeroCTA';
import ForceLightMode from '@/components/ForceLightMode';

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

// ─── Data ─────────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '📊', title: 'Smart Dashboard',    desc: 'Balance, income, and expenses at a glance. Filter by month, search, and sort — all in real time.' },
  { icon: '📈', title: 'Deep Analytics',     desc: 'Monthly & yearly breakdowns, category trends, and savings rate history. Know where money actually goes.' },
  { icon: '📅', title: 'Custom Reports',     desc: 'Query any date range. Income vs expense summaries, category breakdowns, export everything as CSV.' },
  { icon: '🔍', title: 'AI Insights',        desc: 'Anomaly detection, spending velocity, explainability scores, and time-to-zero projections.' },
  { icon: '💡', title: '10 Planning Tools',  desc: 'Debt snowball to FIRE calculator, 50/30/20 splits to PPh 21 tax estimator — all built-in.' },
  { icon: '🔒', title: 'Secure & Private',   desc: 'JWT with token versioning, Google OAuth, password change invalidates all sessions.' },
];

const TOOLS = [
  { icon: '🛒', name: 'Can I Afford This?', desc: 'Real-time budget check' },
  { icon: '📊', name: '50/30/20 Rule',       desc: 'Split income into buckets' },
  { icon: '🎯', name: 'Savings Goal',        desc: 'Timeline to any target' },
  { icon: '📅', name: 'Daily Budget',        desc: 'Safe spend for rest of month' },
  { icon: '🛡️', name: 'Emergency Fund',      desc: '3–6 month safety net' },
  { icon: '💳', name: 'Debt Payoff',         desc: 'Snowball vs avalanche' },
  { icon: '🔥', name: 'FIRE Calculator',     desc: 'Financial independence number' },
  { icon: '📉', name: 'Inflation Impact',    desc: 'Purchasing power erosion' },
  { icon: '🧾', name: 'Tax Estimator',       desc: 'PPh 21 bracket estimate' },
  { icon: '📋', name: 'Net Worth',           desc: 'Assets vs liabilities' },
];

const STEPS = [
  { n: '1', title: 'Create your account',   desc: 'Sign up in 30 seconds — free, no credit card. Or continue with Google.' },
  { n: '2', title: 'Log your transactions', desc: 'Add income & expenses manually, or import a CSV file for bulk entry.' },
  { n: '3', title: 'See the full picture',  desc: 'Analytics, insights, and reports update instantly as you add data.' },
  { n: '4', title: 'Plan with confidence',  desc: 'Use 10 built-in tools to make smarter decisions every month.' },
];

const FOOTER_LINKS = {
  Product: [
    { label: 'Features',       href: '#features' },
    { label: 'Planning Tools', href: '#tools' },
    { label: 'How it works',   href: '#how' },
    { label: 'Dashboard',      href: '/dashboard' },
  ],
  Account: [
    { label: 'Sign in',        href: '/login' },
    { label: 'Create account', href: '/register' },
  ],
  Tools: [
    { label: 'Can I Afford This?', href: '/register' },
    { label: 'FIRE Calculator',    href: '/register' },
    { label: 'Debt Payoff',        href: '/register' },
    { label: 'Tax Estimator',      href: '/register' },
    { label: 'Net Worth',          href: '/register' },
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay }) {
  return (
    <Reveal delay={delay}>
      <div className="group bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg hover:shadow-teal-100/60 hover:-translate-y-1 hover:border-teal-200 transition-all duration-300 h-full">
        <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center text-xl mb-4 group-hover:bg-teal-100 group-hover:scale-110 transition-all duration-300">
          {icon}
        </div>
        <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </Reveal>
  );
}

function ToolPill({ icon, name, desc, delay }) {
  return (
    <Reveal delay={delay} variant="scale">
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-teal-300 hover:bg-teal-50 hover:shadow-md hover:shadow-teal-100/50 hover:-translate-y-0.5 transition-all duration-200 group cursor-default h-full">
        <span className="text-xl shrink-0 group-hover:scale-125 transition-transform duration-200">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors leading-tight">{name}</p>
          <p className="text-xs text-gray-400 leading-tight mt-0.5 truncate">{desc}</p>
        </div>
      </div>
    </Reveal>
  );
}

// ─── Landing footer ───────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer className="bg-gray-950">
      {/* Main link grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">

          {/* Brand column — 2 cols wide on lg */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white text-sm font-black">
                FA
              </div>
              <span className="text-white font-bold text-lg tracking-tight">Finan App</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-400 max-w-xs mb-3">
              A personal finance tracker built to help you take full control of your money — without complexity, ads, or paywalls.
            </p>
            <p className="text-sm leading-relaxed text-gray-400 max-w-xs">
              10 built-in tools: FIRE calculator, debt payoff, PPh 21 tax estimator, and more. Free forever.
            </p>
            <div className="flex items-center gap-2 mt-5">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-xs text-teal-400 font-medium">Free · No ads · No paywalls</span>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="text-gray-200 text-sm font-semibold mb-4">{section}</p>
              <ul className="space-y-2.5">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href}
                      className="text-sm text-gray-400 hover:text-teal-400 transition-colors duration-200">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="border-t border-gray-800" />
      </div>

      {/* Bottom bar */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} Finan App</span>
          <Link href="/privacy" className="hover:text-teal-400 transition-colors">Privacy Policy</Link>
          <Link href="/terms"   className="hover:text-teal-400 transition-colors">Terms</Link>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Built with Next.js + Tailwind · Built by</span>
          <a href="https://profile.lori.my.id/" target="_blank" rel="noopener noreferrer"
            className="text-teal-400 font-semibold hover:text-teal-300 transition-colors">
            Lori
          </a>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      <ForceLightMode />
      <div className="bg-white overflow-x-hidden">

        {/* ── Sticky nav ── */}
        <LandingNav />

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-50 via-white to-emerald-50 pt-20 pb-24 sm:pt-28 sm:pb-32">
          {/* Blobs */}
          <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-teal-100/60 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-emerald-100/50 blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-teal-50/80 blur-2xl" />
          </div>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
            {/* Badge */}
            <div className="animate-fade-in delay-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              10 financial tools · Free to use
            </div>

            {/* Headline */}
            <h1 className="animate-fade-in-up delay-75 text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight tracking-tight mb-6">
              Take control of
              <span className="block text-teal-600">your money</span>
            </h1>

            {/* Subtext */}
            <p className="animate-fade-in-up delay-200 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Track every rupiah, understand your spending patterns, and plan your financial future — all in one clean, fast dashboard.
            </p>

            {/* CTAs */}
            <LandingHeroCTA />

            <p className="animate-fade-in delay-400 text-xs text-gray-400 mt-4">
              No credit card · Free account · Google OAuth supported
            </p>
          </div>

          {/* Mock dashboard — floats gently */}
          <div className="animate-fade-in-up delay-500 relative max-w-5xl mx-auto px-4 sm:px-6 mt-16">
            <div className="animate-float relative bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-300/40 overflow-hidden">
              {/* Glare overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none z-10 rounded-2xl" />
              {/* Fake navbar */}
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-4">
                <span className="font-bold text-sm text-teal-600">Finan App</span>
                <div className="flex gap-1 flex-1">
                  {['Dashboard', 'Analytics', 'Reports', 'Planner', 'Insights'].map(n => (
                    <span key={n} className="text-xs text-gray-400 px-2.5 py-1 rounded-lg hidden sm:block hover:bg-gray-50">{n}</span>
                  ))}
                </div>
                <div className="w-20 h-6 bg-teal-600 rounded-lg" />
              </div>
              {/* Stat cards */}
              <div className="p-4 sm:p-5 bg-gray-50/80">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Balance', val: 'Rp 19.200.000', color: 'text-gray-900' },
                    { label: 'Income',  val: 'Rp 30.000.000', color: 'text-emerald-600', badge: '📈' },
                    { label: 'Expense', val: 'Rp 10.800.000', color: 'text-rose-600',    badge: '📉' },
                  ].map(({ label, val, color, badge }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-400">{label}</p>
                        {badge && <span className="text-sm">{badge}</span>}
                      </div>
                      <p className={`text-xs sm:text-sm font-bold ${color} tabular-nums`}>{val}</p>
                    </div>
                  ))}
                </div>
                {/* Fake table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">Transactions</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">Mar 2026</span>
                  </div>
                  {[
                    { desc: 'Freelance Job',    cat: 'Salary',     amt: '+Rp 30.000.000', type: 'income'  },
                    { desc: 'Apartment rent',       cat: 'Rent',       amt: '−Rp 3.500.000',  type: 'expense' },
                    { desc: 'Lunch',     cat: 'Food',       amt: '−Rp 85.000',     type: 'expense' },
                    { desc: 'Transfer saving', cat: 'Investment', amt: '−Rp 5.000.000',  type: 'expense' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                      <span className="text-xs text-gray-300 w-4 font-mono">{i + 1}</span>
                      <span className="text-xs text-gray-700 flex-1 truncate font-medium">{r.desc}</span>
                      <span className="text-xs text-gray-400 hidden sm:block px-1.5 py-0.5 bg-gray-100 rounded">{r.cat}</span>
                      <span className={`text-xs font-semibold tabular-nums ${r.type === 'income' ? 'text-emerald-600' : 'text-gray-700'}`}>{r.amt}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {r.type === 'income' ? '↑' : '↓'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Bottom shadow glow */}
            <div aria-hidden className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-teal-200/40 blur-2xl rounded-full" />
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <Reveal className="text-center mb-14">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest mb-3">Features</p>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Everything you need</h2>
              <p className="text-gray-500 max-w-xl mx-auto">One app for tracking, analytics, reporting, AI insights, and planning. No spreadsheet juggling.</p>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f, i) => (
                <FeatureCard key={f.title} {...f} delay={`${i * 80}ms`} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Tools ── */}
        <section id="tools" className="py-24 relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-teal-50/40" />
          <div aria-hidden className="absolute top-0 right-0 w-96 h-96 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
            <Reveal className="text-center mb-14">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest mb-3">Planner</p>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">10 financial planning tools</h2>
              <p className="text-gray-500 max-w-xl mx-auto">From daily spending checks to retirement — each tool gives instant, actionable numbers.</p>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-10">
              {TOOLS.map((t, i) => (
                <ToolPill key={t.name} {...t} delay={`${i * 60}ms`} />
              ))}
            </div>

            <Reveal className="text-center">
              <Link href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-200 hover:-translate-y-0.5 active:scale-95 transition-all duration-200">
                Try all tools free
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <Reveal className="text-center mb-16">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest mb-3">Quick start</p>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Up and running in minutes</h2>
              <p className="text-gray-500 max-w-xl mx-auto">No complex setup, no tutorials. Sign up and start adding transactions.</p>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
              {/* Connector line (desktop) */}
              <div aria-hidden className="hidden lg:block absolute top-5 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] h-0.5 border-t-2 border-dashed border-teal-200" />

              {STEPS.map(({ n, title, desc }, i) => (
                <Reveal key={n} delay={`${i * 120}ms`} variant="up">
                  <div className="relative text-center lg:text-left">
                    <div className="w-10 h-10 rounded-xl bg-teal-600 text-white font-black text-base flex items-center justify-center mb-4 shadow-lg shadow-teal-200 mx-auto lg:mx-0 relative z-10">
                      {n}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why Finan App ── */}
        <section className="py-20 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <Reveal className="text-center mb-12">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-widest mb-3">Why choose us</p>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Built for real people</h2>
              <p className="text-gray-500 max-w-xl mx-auto">No bloat, no subscription, no data selling. Just a fast, honest finance tool.</p>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { icon: '🔒', title: 'Private by design', desc: 'JWT auth with token versioning. No third-party analytics. Your data stays yours.' },
                { icon: '⚡', title: 'Instant & free', desc: 'No credit card. No freemium limits. Every feature — including all 10 planning tools — is free.' },
                { icon: '🇮🇩', title: 'Built for Indonesia', desc: 'IDR currency, Indonesian PPh 21 tax brackets, and rupiah-first formatting throughout.' },
              ].map(({ icon, title, desc }, i) => (
                <Reveal key={title} delay={`${i * 100}ms`}>
                  <div className="flex gap-4 p-5 rounded-2xl border border-gray-200 hover:border-teal-200 hover:shadow-md transition-all duration-200 h-full">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-xl shrink-0">
                      {icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <section className="py-16 bg-teal-600 relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-teal-500/40 blur-3xl" />
            <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-teal-700/50 blur-3xl" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center text-white">
              {[
                { val: '10',  label: 'Planning tools' },
                { val: '∞',   label: 'Transaction history' },
                { val: 'CSV', label: 'Import & export' },
                { val: '$0',  label: 'Forever free' },
              ].map(({ val, label }, i) => (
                <Reveal key={label} delay={`${i * 100}ms`}>
                  <p className="text-4xl font-black mb-1">{val}</p>
                  <p className="text-sm text-teal-100">{label}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-28 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-teal-50" />
          <div aria-hidden className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-teal-200 to-transparent" />

          <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                Join today — completely free
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
                Start tracking today.
                <span className="block text-teal-600">It&apos;s completely free.</span>
              </h2>
              <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                No ads, no paywalls, no credit card. Just a clean finance dashboard that respects your time and data.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/register"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-teal-600 text-white font-bold text-base hover:bg-teal-700 hover:shadow-2xl hover:shadow-teal-200/60 hover:-translate-y-1 active:scale-95 transition-all duration-200">
                  Create free account
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link href="/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border border-gray-200 bg-white text-gray-700 font-bold text-base hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-95 transition-all duration-200">
                  Already have an account
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Landing footer ── */}
        <LandingFooter />

      </div>
    </>
  );
}
