import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { pool } from "./db";

function baseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const auth = betterAuth({
  appName: "FitTrack AI",
  baseURL: baseURL(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 giorni
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [
    baseURL(),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
  ],
  plugins: [nextCookies()],
});
