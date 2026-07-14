import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { passwordResetEmail, sendEmail, verificationEmail } from "@/lib/email";

export const VERIFICATION_TOKEN_TTL_HOURS = 24;
export const PASSWORD_RESET_TTL_HOURS = 1;

/** Reset tokens share the VerificationToken table; the identifier prefix
 * keeps the two flows from consuming each other's tokens. */
const RESET_PREFIX = "password-reset:";

/** Only the SHA-256 hash is stored; the raw token travels in the email link. */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;

/** VerificationToken has no createdAt; derive it from expires − TTL. */
export function isWithinCooldown(
  expires: Date,
  ttlHours: number,
  now = new Date(),
  cooldownSeconds = EMAIL_RESEND_COOLDOWN_SECONDS,
) {
  const createdAt = expires.getTime() - ttlHours * 3_600_000;
  return now.getTime() - createdAt < cooldownSeconds * 1000;
}

async function hasRecentToken(identifier: string, ttlHours: number) {
  const token = await prisma.verificationToken.findFirst({
    where: { identifier },
  });
  return token !== null && isWithinCooldown(token.expires, ttlHours);
}

export function hasRecentVerificationToken(email: string) {
  return hasRecentToken(email, VERIFICATION_TOKEN_TTL_HOURS);
}

export function hasRecentPasswordResetToken(email: string) {
  return hasRecentToken(`${RESET_PREFIX}${email}`, PASSWORD_RESET_TTL_HOURS);
}

/** Creates a fresh token for the email (invalidating previous ones) and sends the link. */
export async function sendVerificationEmail(
  user: { name: string | null; email: string },
  origin: string,
) {
  const token = randomBytes(32).toString("hex");

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: user.email } }),
    prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token: hashToken(token),
        expires: new Date(
          Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000,
        ),
      },
    }),
  ]);

  const verifyUrl = `${origin}/verify-email?token=${token}`;
  const { subject, html } = verificationEmail(user.name, verifyUrl);
  await sendEmail({ to: user.email, subject, html });
}

/** Creates a reset token (invalidating previous ones) and emails the link. */
export async function sendPasswordResetEmail(
  user: { name: string | null; email: string },
  origin: string,
) {
  const token = randomBytes(32).toString("hex");
  const identifier = `${RESET_PREFIX}${user.email}`;

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: {
        identifier,
        token: hashToken(token),
        expires: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000),
      },
    }),
  ]);

  const resetUrl = `${origin}/reset-password?token=${token}`;
  const { subject, html } = passwordResetEmail(user.name, resetUrl);
  await sendEmail({ to: user.email, subject, html });
}

/** Consumes a reset token and returns the email it belongs to, or null. */
export async function consumePasswordResetToken(rawToken: string) {
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(rawToken) },
  });
  if (!record || !record.identifier.startsWith(RESET_PREFIX)) return null;

  await prisma.verificationToken.delete({ where: { token: record.token } });
  if (record.expires < new Date()) return null;

  return record.identifier.slice(RESET_PREFIX.length);
}

export type VerifyEmailResult = "verified" | "already-verified" | "invalid";

/** Consumes a raw token from the email link and marks the user as verified. */
export async function verifyEmailToken(
  rawToken: string,
): Promise<VerifyEmailResult> {
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(rawToken) },
  });
  if (!record || record.expires < new Date()) return "invalid";

  const user = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true, emailVerified: true },
  });

  await prisma.verificationToken.delete({ where: { token: record.token } });

  if (!user) return "invalid";
  if (user.emailVerified) return "already-verified";

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });
  return "verified";
}
