import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';

/* ---------------------------------------------------------------- setup */

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500'
)
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
  .concat(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // no Origin header = curl / PowerShell / server-to-server, which CORS does not apply to
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      console.warn(`Blocked browser origin by CORS: ${origin || '(none)'}. Allowed origins: ${allowedOrigins.join(', ')}`);
      cb(new Error('Origin not allowed by CORS.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '1mb' }));

// In production, serve the SPA and API from one origin. Local development keeps
// using Live Server on port 5500/5501.
if (process.env.NODE_ENV === 'production') {
  const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend');
  app.use(express.static(frontendDir, { index: 'index.html' }));
}

// Throttle only the endpoints that can be brute-forced (not /me, which runs on every page load)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use(['/api/auth/login', '/api/auth/register'], authLimiter);

/* ------------------------------------------------------------- validation */

const registerSchema = z.object({
  school: z.string().trim().min(2).max(180),
  country: z.enum(['RW', 'UG']).default('RW'),
  type: z.string().max(100).optional().default(''),
  dist: z.string().max(120).optional().default(''),
  learners: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1000000)),
  tin: z.string().max(80).optional().default(''),
  head: z.string().trim().min(2).max(180),
  name: z.string().trim().min(2).max(180),
  role: z.string().max(100).optional().default(''),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(254),
  pass: z.string().min(8).max(128),
  bank: z.string().max(100).optional().default(''),
  shule: z.boolean().optional().default(false),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  pass: z.string().min(1).max(128),
});

const orderSchema = z.object({
  frontendOrderId: z.string().max(100).optional(),
  total: z.coerce.number().finite().positive().max(100000000000), // checked against the server's own total
  mode: z.enum(['full', 'hp']),
  method: z.enum(['MTN MoMo', 'Airtel Money', 'Bank transfer', 'LPO (public schools)', 'Invoice Financing']),
  lines: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]), // product sku, e.g. "d1"
        qty: z.coerce.number().int().positive().max(100000),
        unit: z.coerce.number().nonnegative().max(100000000).optional(), // ignored: server sets prices
        opts: z.any().optional(),
      }),
    )
    .min(1)
    .max(500),
  delivery: z.record(z.any()).default({}),
});

const financeSchema = z.object({
  requestedLender: z.string().max(120).optional().default(''),
  depositPercent: z.coerce.number().min(0).max(100),
  repaymentUnit: z.enum(['month', 'term']),
  repaymentCount: z.coerce.number().int().positive().max(60),
  details: z.record(z.any()).default({}),
});

/* ------------------------------------------------------------------- auth */

function userRecord(user) {
  const school = user.schools;
  return {
    id: user.id, email: user.email, role: user.role, school_id: user.school_id,
    school_name: school.school_name, country: school.country, school_type: school.school_type,
    district: school.district, learner_count: school.learner_count, tin: school.tin,
    head_teacher: school.head_teacher, contact_name: school.contact_name,
    contact_role: school.contact_role, phone: school.phone,
    bank_preference: school.bank_preference, shule_plus: school.shule_plus,
  };
}

// Compared against when the email is unknown, so response time doesn't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

function tokenFor(user) {
  return jwt.sign({ sub: user.id, schoolId: user.school_id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '2h',
    issuer: 'yodeals-api',
    audience: 'yodeals-web',
  });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in is required.' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'yodeals-api',
      audience: 'yodeals-web',
    });
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  try {
    const user = await prisma.users.findUnique({
      where: { id: payload.sub },
      include: { schools: true },
    });
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = userRecord(user);
    return next();
  } catch (error) {
    return next(error);
  }
}

function publicUser(u) {
  return {
    id: u.id, email: u.email, role: u.role, schoolId: u.school_id,
    school: u.school_name, country: u.country, type: u.school_type, dist: u.district,
    learners: u.learner_count, tin: u.tin, head: u.head_teacher, name: u.contact_name,
    roleTitle: u.contact_role, phone: u.phone, bank: u.bank_preference, shule: u.shule_plus,
  };
}

// `db` can be Prisma Client or a Prisma transaction client
async function audit(db, userId, type, entityType, entityId, metadata = {}) {
  await db.audit_events.create({
    data: {
      actor_user_id: userId,
      event_type: type,
      entity_type: entityType,
      entity_id: String(entityId),
      metadata,
    },
  });
}

/* ---------------------------------------------------------------- pricing */

// The browser's prices are never trusted. Every line is re-priced from the products table:
//   unit = list price x (1 - bulk discount for that line's quantity) + logo fee per unit if embroidery is chosen
async function priceLines(db, lines, requireFinanceable = false) {
  const skus = [...new Set(lines.map((l) => String(l.id)))];
  const [products, tierRows, fee] = await Promise.all([
    db.products.findMany({
      where: { sku: { in: skus }, active: true },
      select: { sku: true, name: true, unit_price_rwf: true, financeable: true },
    }),
    db.pricing_tiers.findMany({ orderBy: { min_qty: 'asc' } }),
    db.settings.findUnique({ where: { key: 'logo_fee_rwf' } }),
  ]);
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const tiers = tierRows.map((t) => ({ min: t.min_qty, off: Number(t.discount) }));
  const logoFee = Number(fee?.value ?? 0);

  const missing = skus.filter((s) => !bySku.has(s));
  if (missing.length) return { error: `Unknown or unavailable product: ${missing.join(', ')}` };
  if (requireFinanceable && products.some((product) => !product.financeable)) {
    return { error: 'One or more products in this order are not eligible for Invoice Financing.' };
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const priced = lines.map((l) => {
    const p = bySku.get(String(l.id));
    const tier = [...tiers].reverse().find((t) => l.qty >= t.min) || { off: 0 };
    const logo = l.opts && l.opts.logo === 'emb' ? logoFee : 0;
    const unit = round2(Number(p.unit_price_rwf) * (1 - tier.off) + logo);
    return {
      id: p.sku, name: p.name, qty: l.qty, unit,
      lineTotal: round2(unit * l.qty), opts: l.opts ?? null,
    };
  });
  const total = round2(priced.reduce((sum, l) => sum + l.lineTotal, 0));
  return { priced, total };
}

/* ------------------------------------------------------------------ routes */

app.get('/', (_req, res) => res.json({ service: 'Shulemart API', health: '/api/health' }));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Please check the registration details.',
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();
  try {
    const hash = await bcrypt.hash(d.pass, 12);
    const created = await prisma.$transaction(async (tx) => {
      const school = await tx.schools.create({
        data: {
          school_name: d.school, country: d.country, school_type: d.type,
          district: d.dist, learner_count: d.learners, tin: d.tin,
          head_teacher: d.head, contact_name: d.name, contact_role: d.role,
          phone: d.phone, email, bank_preference: d.bank, shule_plus: d.shule,
        },
      });
      const user = await tx.users.create({
        data: { school_id: school.id, email, password_hash: hash },
      });
      await audit(tx, user.id, 'account.registered', 'school', school.id, { country: d.country });
      return user;
    });
    const full = await prisma.users.findUnique({
      where: { id: created.id },
      include: { schools: true },
    });
    res.status(201).json({ token: tokenFor(created), user: publicUser(userRecord(full)) });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(e);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  try {
    const user = await prisma.users.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    const ok = await bcrypt.compare(parsed.data.pass, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Email or password not recognised.' });

    const full = await prisma.users.findUnique({ where: { id: user.id }, include: { schools: true } });
    await audit(prisma, user.id, 'account.login', 'user', user.id);
    res.json({ token: tokenFor(user), user: publicUser(userRecord(full)) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---- catalogue (public) ---- */

app.get('/api/products', async (_req, res, next) => {
  try {
    const [cats, products, pricingTiers, fee] = await Promise.all([
      prisma.categories.findMany({
        select: { id: true, name: true, subtitle: true, icon: true },
        orderBy: { sort_order: 'asc' },
      }),
      prisma.products.findMany({
        where: { active: true, sku: { not: null } },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          sku: true, name: true, category: true, description: true, unit_price_rwf: true,
          brand: true, stock_status: true, lead_time: true, financeable: true, best_seller: true,
          hidden: true, icon: true, image_keys: true, specs: true, options: true,
        },
      }),
      prisma.pricing_tiers.findMany({ orderBy: { min_qty: 'asc' } }),
      prisma.settings.findUnique({ where: { key: 'logo_fee_rwf' } }),
    ]);
    res.json({
      categories: cats,
      products: products.map((p) => ({
        id: p.sku, name: p.name, category: p.category, description: p.description,
        price: Number(p.unit_price_rwf), brand: p.brand, stock: p.stock_status,
        lead: p.lead_time, hp: p.financeable, best: p.best_seller, hidden: p.hidden,
        icon: p.icon, image_keys: p.image_keys, specs: p.specs, options: p.options,
      })),
      tiers: pricingTiers.map((t) => ({ min: t.min_qty, off: Number(t.discount), label: t.label })),
      logoFee: Number(fee?.value ?? 0),
      currency: 'RWF',
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/packages', async (_req, res, next) => {
  try {
    const packages = await prisma.packages.findMany({
      where: { active: true },
      orderBy: { sku: 'asc' },
      select: { sku: true, name: true, size: true, level: true, icon: true, image_key: true, items: true },
    });
    res.json({ packages: packages.map(({ sku, ...item }) => ({ id: sku, ...item })) });
  } catch (e) {
    next(e);
  }
});

/* ---- orders ---- */

app.get('/api/orders', auth, async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { school_id: req.user.school_id },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true, order_number: true, frontend_order_id: true, status: true, currency: true,
        total_rwf: true, payment_method: true, order_mode: true, delivery_details: true,
        lines: true, created_at: true,
      },
    });
    res.json({ orders: orders.map((order) => ({ ...order, order_number: String(order.order_number) })) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/orders', auth, async (req, res, next) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid order details.', details: parsed.error.flatten().fieldErrors });
  }
  const d = parsed.data;
  if ((d.mode === 'hp') !== (d.method === 'Invoice Financing')) {
    return res.status(400).json({ error: 'Choose a payment method that matches this order type.' });
  }
  try {
    const pricing = await priceLines(prisma, d.lines, d.mode === 'hp');
    if (pricing.error) return res.status(400).json({ error: pricing.error });

    // Amounts are RWF. A mismatch means the page's price list is stale (or sent in another currency).
    if (Math.abs(pricing.total - d.total) > 1) {
      return res.status(409).json({
        error: 'Prices have changed. Please review your cart.',
        serverTotal: pricing.total,
        clientTotal: d.total,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialize retries for the same school/order key, including concurrent requests.
      if (d.frontendOrderId) {
        const lockKey = `order:${req.user.school_id}:${d.frontendOrderId}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const existing = await tx.orders.findFirst({
          where: { school_id: req.user.school_id, frontend_order_id: d.frontendOrderId },
          select: {
            id: true, order_number: true, status: true, total_rwf: true,
            created_at: true, lines: true,
          },
        });
        if (existing) return { order: existing, duplicate: true };
      }

      const created = await tx.orders.create({
        data: {
          school_id: req.user.school_id,
          created_by: req.user.id,
          status: 'submitted',
          total_rwf: pricing.total,
          payment_method: d.method,
          order_mode: d.mode,
          delivery_details: d.delivery,
          lines: pricing.priced,
          frontend_order_id: d.frontendOrderId || null,
        },
        select: { id: true, order_number: true, status: true, total_rwf: true, created_at: true },
      });
      await audit(tx, req.user.id, 'order.created', 'order', created.id, { total: pricing.total, mode: d.mode });
      return { order: { ...created, lines: pricing.priced }, duplicate: false };
    });
    res.status(result.duplicate ? 200 : 201).json({
      order: { ...result.order, order_number: String(result.order.order_number) },
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/orders/:id/financing-requests', auth, async (req, res, next) => {
  const orderId = z.string().uuid().safeParse(req.params.id);
  if (!orderId.success) return res.status(400).json({ error: 'Invalid order ID.' });
  const parsed = financeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid financing request.', details: parsed.error.flatten().fieldErrors });
  }
  const d = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.findFirst({
        where: { id: orderId.data, school_id: req.user.school_id },
        select: { id: true, order_mode: true },
      });
      if (!order) return { error: 'not_found' };
      if (order.order_mode !== 'hp') return { error: 'not_financed' };

      const lockKey = `financing:${req.user.school_id}:${order.id}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const existing = await tx.financing_requests.findFirst({
        where: { order_id: order.id },
        select: { id: true, status: true, created_at: true },
      });
      if (existing) return { request: existing, duplicate: true };

      const request = await tx.financing_requests.create({
        data: {
          order_id: order.id,
          school_id: req.user.school_id,
          requested_lender: d.requestedLender,
          deposit_percent: d.depositPercent,
          repayment_unit: d.repaymentUnit,
          repayment_count: d.repaymentCount,
          submitted_details: d.details,
        },
        select: { id: true, status: true, created_at: true },
      });
      await audit(tx, req.user.id, 'financing.requested', 'financing_request', request.id, {
        termsVersion: 'unapproved-demo-terms',
      });
      return { request };
    });
    if (result.error === 'not_found') return res.status(404).json({ error: 'Order not found.' });
    if (result.error === 'not_financed') return res.status(400).json({ error: 'This order is not marked for financing.' });
    res.status(result.duplicate ? 200 : 201).json({
      request: result.request,
      notice: 'Submitted for review only. This does not constitute credit approval or a binding offer.',
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------- errors */

app.use((req, res) => res.status(404).json({ error: 'API endpoint not found.', path: req.path }));

app.use((err, _req, res, _next) => {
  console.error('API error:', err.message);
  if (err.message === 'Origin not allowed by CORS.') {
    return res.status(403).json({ error: 'This frontend origin is not allowed.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body contains invalid JSON.' });
  }
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

/* ----------------------------------------------------------------- start */

const port = Number(process.env.PORT || 4000);
console.log(`CORS allows frontend origins: ${allowedOrigins.join(', ')}`);
app
  .listen(port, '0.0.0.0', () => console.log(`Shulemart API listening on http://localhost:${port}`))
  .on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Another copy of the server is probably running: close it, or change PORT in .env.`);
      process.exit(1);
    }
    throw e;
  });
process.on('unhandledRejection', (e) => console.error('UNHANDLED REJECTION:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT EXCEPTION:', e));
