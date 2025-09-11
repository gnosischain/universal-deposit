import "dotenv/config";
import { z } from "zod";

const bool = z
  .string()
  .transform((v) => v?.toLowerCase() === "true")
  .or(z.boolean())
  .optional()
  .default(false);

const optionalNumberFromString = z
  .string()
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : Number(v)))
  .refine((n) => n === undefined || !Number.isNaN(n), {
    message: "Expected number",
  });

const ResidualScheduleSchema = z
  .string()
  .default("300000,600000,1800000,3600000,10800000") // 5m,10m,30min,1h,3h
  .transform((v) =>
    v
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  )
  .refine((arr) => arr.length > 0, {
    message:
      "RESIDUAL_DELAY_SCHEDULE must contain at least one positive number",
  });

const EnvSchema = z.object({
  // Service toggles
  RUN_API: bool,
  RUN_BALANCE_WATCHER: bool,
  RUN_DEPLOY_WORKER: bool,
  RUN_SETTLE_WORKER: bool,

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // API
  API_PORT: optionalNumberFromString.default("3000"),

  // Datastores
  DATABASE_URL: z.string().url().describe("PostgreSQL connection URL"),
  REDIS_URL: z.string().url().describe("Redis connection URL"),
  RABBITMQ_URL: z.string().url().describe("AMQP connection URL"),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: optionalNumberFromString.default("86400000"),
  RATE_LIMIT_MAX_REQUESTS: optionalNumberFromString.default("100"),

  // Residual reprocessing schedule
  RESIDUAL_DELAY_SCHEDULE: ResidualScheduleSchema,

  // Keys
  DEPLOYMENT_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid private key hex")
    .optional(),
  SETTLEMENT_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid private key hex")
    .optional(),

  // Policy flags
  VERIFY_DEST_CHAIN: bool.default(false),

  // Business rules
  BALANCE_CHECK_INTERVAL_MS: optionalNumberFromString.default("30000"),

  // Service configuration
  HEARTBEAT_INTERVAL_MS: optionalNumberFromString.default("5000"), // 5 seconds
  SLIPPAGE_PERCENTAGE: optionalNumberFromString.default("500"), // 0.5% = 500 basis points

  // Authentication
  DEVELOPER_MASTER_KEY: z
    .string()
    .min(32, "DEVELOPER_MASTER_KEY must be at least 32 characters")
    .default("dev-master-key-change-in-production-32chars"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Build helpful error message
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const config = loadConfig();
