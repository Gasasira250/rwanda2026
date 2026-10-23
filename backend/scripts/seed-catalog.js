import 'dotenv/config';
import fs from 'node:fs';
import { prisma } from '../src/db.js';
import { Prisma } from '../src/generated/prisma/client.ts';

const dry = process.argv.includes('--dry');
const ifEmpty = process.argv.includes('--if-empty');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || new URL('../../frontend/index.html', import.meta.url);

const html = fs.readFileSync(file, 'utf8');
const start = html.indexOf('const CATS=[');
const end = html.indexOf('const APP=', start);
if (start < 0 || end < 0) throw new Error('Could not find the catalogue in ' + file);

const { CATS, P, PACKAGES } = new Function(html.slice(start, end) + ';return {CATS,P,PACKAGES}')();

const products = P.map((p) => ({
  sku: p.id, name: p.name, category: p.cat, description: p.desc || '', price: p.price,
  brand: p.brand || null, stock: p.stock || 'in', lead: p.lead || null,
  financeable: p.hp !== false, best: !!p.best, hidden: !!p.hidden, icon: p.a || null,
  images: p.imgs || (p.img ? [p.img] : []), specs: p.specs || {}, options: p.apparel || null,
}));

console.log(`Found ${CATS.length} categories, ${products.length} products, ${PACKAGES.length} packages.`);
if (dry) {
  await prisma.$disconnect();
  process.exit(0);
}
if (ifEmpty) {
  const existingCount = await prisma.products.count();
  if (existingCount > 0) {
    console.log(`Catalog already contains ${existingCount} products; leaving it unchanged.`);
    await prisma.$disconnect();
    process.exit(0);
  }
}

try {
  await prisma.$transaction(async (tx) => {
    for (const [i, c] of CATS.entries()) {
      await tx.categories.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, subtitle: c.sub, icon: c.a, sort_order: i + 1 },
        update: { name: c.name, subtitle: c.sub, icon: c.a, sort_order: i + 1 },
      });
    }
    for (const p of products) {
      const data = {
        name: p.name, category: p.category, description: p.description, unit_price_rwf: p.price,
        brand: p.brand, stock_status: p.stock, lead_time: p.lead, financeable: p.financeable,
        best_seller: p.best, hidden: p.hidden, icon: p.icon, image_keys: p.images,
        specs: p.specs, options: p.options ?? Prisma.DbNull,
      };
      await tx.products.upsert({
        where: { sku: p.sku },
        create: { sku: p.sku, ...data },
        update: data,
      });
    }
    for (const k of PACKAGES) {
      const data = {
        name: k.name, size: k.size, level: k.level, icon: k.a || null,
        image_key: k.img || null, items: k.items.map(([sku, qty]) => ({ sku, qty })),
      };
      await tx.packages.upsert({
        where: { sku: k.id },
        create: { sku: k.id, ...data },
        update: data,
      });
    }
  });
  const [categoriesCount, productsCount, packagesCount] = await Promise.all([
    prisma.categories.count(), prisma.products.count(), prisma.packages.count(),
  ]);
  console.log('Done. In the database now:', { categories: categoriesCount, products: productsCount, packages: packagesCount });
} catch (e) {
  console.error('Seed failed and was rolled back:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
