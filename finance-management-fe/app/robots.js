export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/add', '/analytics', '/insights', '/range', '/import', '/profile', '/settings', '/recommendation', '/auth', '/verify-email'],
    },
    sitemap: 'https://finance.lori.my.id/sitemap.xml',
  };
}
