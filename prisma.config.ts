import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaClient } from '@prisma/client';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasources: {
    db: { adapter: 'postgresql' },
  },
});

export const prisma = new PrismaClient({
  datasources: {
    db: { adapter: 'postgresql', url: process.env.DATABASE_URL },
  },
});
