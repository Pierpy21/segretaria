import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Schema and relations files
  schema: ["./drizzle/schema.ts", "./drizzle/relations.ts"],

  // Output directory for generated migrations (if using Drizzle Kit migrations)
  out: "./drizzle/migrations",

  // PostgreSQL dialect
  dialect: "postgresql",

  // Database connection — uses Supabase local Docker instance by default
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },

  // Verbose logging during migrations
  verbose: true,

  // Require confirmation before destructive operations
  strict: true,
});
