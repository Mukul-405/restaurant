import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  PORT: z.string().default('8000'),
  AIOSELL_USERNAME: z.string(),
  AIOSELL_PASSWORD: z.string(),
  AIOSELL_PMS_SLUG: z.string(),
  AIOSELL_HOTEL_CODE: z.string(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
