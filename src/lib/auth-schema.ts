/**
 * Shared (client-safe) schemas for customer accounts. The /api/auth/* routes re-validate
 * with these; the account pages use them with React Hook Form.
 */
import { z } from "zod";

import { emailField } from "./schemas";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`);

const turnstileToken = z.string().max(4096).nullable().optional();

export const signupSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().max(100).optional().or(z.literal("")),
  turnstileToken,
});

export const loginSchema = z.object({
  email: emailField,
  // Never enforce the length rules at login: an old password must still be accepted.
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX),
  turnstileToken,
});

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

export const forgotPasswordSchema = z.object({ email: emailField, turnstileToken });

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This reset link is not valid"),
  password: passwordField,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** What GET /api/auth/me returns for a signed-in visitor. */
export type AccountUser = { email: string; name: string | null; verified: boolean };
