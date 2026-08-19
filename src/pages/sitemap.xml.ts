import type { APIRoute } from 'astro';
import data from '../data/products.json';

const BASE = import.meta.env.BASE_URL || '/';
const SITE = 'https://arttato.github.io';

export const GET: APIRoute = () => {
  const urls = data.products
    .map((p) => {
      const loc = `${SITE}${BASE}product/${p.slug}/`;
      return `  <url>
    <loc>${loc}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}${BASE}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}${BASE}services/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
