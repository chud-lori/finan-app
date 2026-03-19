import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Finan App',
  description: 'Terms and conditions for using Finan App.',
};

const Section = ({ title, children }) => (
  <section className="mb-8">
    <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
    <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-400">Last updated: March 2026</p>
        </div>

        <Section title="1. Acceptance">
          <p>By creating an account or using Finan App (&ldquo;the Service&rdquo;), you agree to these terms. If you do not agree, do not use the Service.</p>
        </Section>

        <Section title="2. Description of service">
          <p>Finan App is a personal finance tracking tool that lets you record income and expenses, view analytics, and plan finances. The Service is provided free of charge.</p>
        </Section>

        <Section title="3. Your account">
          <p>You are responsible for maintaining the confidentiality of your password and for all activity that occurs under your account. Notify us immediately of any unauthorised use.</p>
          <p>You must provide accurate information when creating an account. Accounts used for fraudulent, illegal, or abusive purposes will be terminated.</p>
        </Section>

        <Section title="4. Your data">
          <p>You own the data you enter into Finan App. By using the Service, you grant us a limited licence to store and process that data solely to provide the Service to you.</p>
          <p>We do not sell your data. See our <Link href="/privacy" className="text-teal-600 hover:underline">Privacy Policy</Link> for details.</p>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to: attempt to reverse engineer or compromise the Service; use the Service for any unlawful purpose; share access to your account with others; or use automated tools to scrape data from the Service.</p>
        </Section>

        <Section title="6. Disclaimer of warranties">
          <p>The Service is provided &ldquo;as is&rdquo; without warranties of any kind. Finan App is a personal tool — it does not provide financial, legal, or tax advice. Always consult a qualified professional before making significant financial decisions.</p>
          <p>We do not guarantee uninterrupted or error-free operation of the Service.</p>
        </Section>

        <Section title="7. Limitation of liability">
          <p>To the maximum extent permitted by law, the developer of Finan App shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service, including loss of data.</p>
        </Section>

        <Section title="8. Termination">
          <p>You may delete your account at any time from the Profile page. We reserve the right to suspend or terminate accounts that violate these terms, with or without notice.</p>
        </Section>

        <Section title="9. Changes to these terms">
          <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms. We will indicate the &ldquo;last updated&rdquo; date at the top of this page.</p>
        </Section>

        <Section title="10. Contact">
          <p>Questions about these terms? Contact the developer at <a href="https://profile.lori.my.id/" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">profile.lori.my.id</a>.</p>
        </Section>

        <div className="mt-10 pt-6 border-t border-gray-200 flex gap-4 text-xs text-gray-400">
          <Link href="/privacy" className="hover:text-teal-600 transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-teal-600 transition-colors">← Back to Finan App</Link>
        </div>
      </main>
    </div>
  );
}
