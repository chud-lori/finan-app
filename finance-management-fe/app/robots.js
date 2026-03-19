export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/add', '/analytics', '/insights', '/reports', '/range', '/import', '/profile', '/settings', '/recommendation', '/auth'],
    },
    sitemap: 'https://finance.lori.my.id/sitemap.xml',
  };
}
