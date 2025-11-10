import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

// Define environment variable schema
const envSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE: z.string().default('medialog.db'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Validate and export environment variables
let env;
try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment variables:', error.errors);
  process.exit(1);
}

export default env;
