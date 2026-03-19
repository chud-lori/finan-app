export default function sitemap() {
  const base = 'https://finance.lori.my.id';
  const now  = new Date().toISOString();

  return [
    { url: base,                    lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${base}/login`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/register`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.6 },
    { url: `${base}/forgot-password`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${base}/terms`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
  ];
}
