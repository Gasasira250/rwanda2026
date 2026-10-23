import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 5000,
  onPoolError: (error) => console.error('Unexpected PostgreSQL pool error:', error.message),
});

export const prisma = new PrismaClient({ adapter });
