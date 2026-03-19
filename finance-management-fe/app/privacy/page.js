import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Finan App',
  description: 'How Finan App collects, uses, and protects your personal financial data.',
};

const Section = ({ title, children }) => (
  <section className="mb-8">
    <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
    <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-teal-600 text-lg">Finan App</Link>
          <Link href="/login" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">Sign in</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-400">Last updated: March 2026</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-800">
          Finan App is a personal finance tracker. We take your financial data seriously and will never sell it to third parties.
        </div>

        <Section title="1. What we collect">
          <p>When you create an account we store your <strong>name</strong>, <strong>email address</strong>, and <strong>hashed password</strong> (bcrypt). If you sign in with Google we store your Google account ID and email.</p>
          <p>When you add transactions we store the <strong>description</strong>, <strong>amount</strong>, <strong>category</strong>, <strong>date/time</strong>, and <strong>type</strong> (income or expense) that you provide.</p>
          <p>We store your <strong>timezone</strong> (browser-detected) so amounts are correctly attributed to the right day in your local time.</p>
        </Section>

        <Section title="2. How we use your data">
          <p>Your data is used solely to provide the Finan App service — displaying your dashboard, calculating analytics, generating insights, and fulfilling CSV exports you request.</p>
          <p>We do not use your financial data for advertising, profiling, or any purpose other than running the app.</p>
        </Section>

        <Section title="3. Data sharing">
          <p>We do not sell, rent, or share your personal data with third parties.</p>
          <p>We use <strong>MongoDB Atlas</strong> to store your data. Atlas is hosted in the cloud; its data handling is governed by MongoDB&apos;s privacy policy.</p>
          <p>If you sign in with Google, the initial authentication uses Google&apos;s identity service; after that, all session tokens are managed by Finan App independently.</p>
        </Section>

        <Section title="4. Data retention">
          <p>Your data is retained as long as your account exists. You can permanently delete your account and all associated data at any time from the Profile page. Deletion is immediate and irreversible.</p>
        </Section>

        <Section title="5. Security">
          <p>Passwords are hashed with bcrypt (never stored in plaintext). API access requires a signed JWT token. Sessions can be invalidated remotely via the &ldquo;Log out all devices&rdquo; feature.</p>
          <p>While we take reasonable security precautions, no system is 100% secure. Do not store information here that you would not want exposed in a worst-case breach.</p>
        </Section>

        <Section title="6. Cookies and local storage">
          <p>Finan App stores your session token in <strong>browser local storage</strong> — not in a cookie. We also store your theme preference (light/dark) in local storage. No tracking cookies are set.</p>
        </Section>

        <Section title="7. Your rights">
          <p>You have the right to access, export, and delete your data at any time. Use the export and delete-account features in the Profile page. For any other requests, contact us.</p>
        </Section>

        <Section title="8. Contact">
          <p>For privacy questions, contact the developer at the email listed on <a href="https://profile.lori.my.id/" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">profile.lori.my.id</a>.</p>
        </Section>

        <div className="mt-10 pt-6 border-t border-gray-200 flex gap-4 text-xs text-gray-400">
          <Link href="/terms" className="hover:text-teal-600 transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-teal-600 transition-colors">← Back to Finan App</Link>
        </div>
      </main>
    </div>
  );
}
