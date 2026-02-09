import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    // ❗ NO uses this.config antes de super()
    const url = config.get<string>('DATABASE_URL');

    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error(
        'DATABASE_URL no está definido o está vacío. Revisa tu .env',
      );
    }

    const poolConfig: PoolConfig = { connectionString: url };
    const pool = new Pool(poolConfig);
    const adapter = new PrismaPg(pool);

    // ✅ primero super
    super({ adapter });

    // ✅ ahora sí puedes usar this
    this.pool = pool;

    console.log('[PrismaService] usando adapter-pg OK');
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
