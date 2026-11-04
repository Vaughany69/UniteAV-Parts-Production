/**
 * Password-reset checks: token hashing, expiry, single use, and dry-run mail.
 *
 * Point DATABASE_URL at a throwaway local Postgres (or SQLite) database.
 * The script refuses hosted hosts and refuses to run when RESEND_API_KEY is set,
 * so it cannot email a real person or touch a shared database.
 */
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redactSecrets, sendMail } from "@/lib/mail";
import { hashResetToken, createPasswordResetToken, requestPasswordReset, resetPasswordWithToken } from "@/lib/password-reset";
import { BCRYPT_ROUNDS, PASSWORD_RESET_LIMITS, PASSWORD_RESET_NEUTRAL_MESSAGE } from "@/lib/password-policy";

function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) throw new Error("DATABASE_URL is not set. Point it at a throwaway local database.");
  if (process.env.RESEND_API_KEY?.trim()) {
    throw new Error("Unset RESEND_API_KEY before running. This script must not send email.");
  }
  if (raw.startsWith("file:")) return;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a URL this script will use.");
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local) throw new Error(`Refusing to run: database host "${host}" is not local.`);
  if (/neon|supabase|vercel|amazonaws|render\.com|railway|pooler/i.test(raw)) {
    throw new Error("Refusing to run against a hosted database.");
  }
}

function captureConsole() {
  const lines: string[] = [];
  const original = {
    info: console.info,
    error: console.error,
    log: console.log,
  };
  const record = (args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  console.info = (...args: unknown[]) => record(args);
  console.error = (...args: unknown[]) => record(args);
  console.log = (...args: unknown[]) => record(args);
  return {
    lines,
    restore() {
      console.info = original.info;
      console.error = original.error;
      console.log = original.log;
    },
  };
}

async function makeUser(active = true) {
  const email = `pwreset-${randomBytes(4).toString("hex")}@example.test`;
  const password = `Old-${randomBytes(9).toString("hex")}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "Reset verify",
      role: "VIEWER",
      active,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    },
    select: { id: true, email: true },
  });
  return { ...user, password };
}

async function storedHash(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user.passwordHash) throw new Error("ASSERT FAILED: test user has no password hash");
  return user.passwordHash;
}

async function main() {
  assertLocalDatabase();
  process.env.APP_URL = process.env.APP_URL || "http://127.0.0.1:3000";
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || `verify-${randomBytes(8).toString("hex")}`;
  delete process.env.RESEND_API_KEY;

  const startedAt = new Date(Date.now() - 1000);
  const preexisting = new Set((await prisma.user.findMany({ select: { id: true } })).map((user) => user.id));
  const created: string[] = [];

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    fetchCalls += 1;
    return originalFetch(...args);
  }) as typeof fetch;

  try {
    console.log("Token creation and hashing:");
    const user = await makeUser();
    created.push(user.id);
    const createdToken = await createPasswordResetToken(user.id);
    const tokenHash = hashResetToken(createdToken.token);
    assert(tokenHash !== createdToken.token, "SHA-256 hash is not the raw token");
    assert(/^[a-f0-9]{64}$/.test(tokenHash), "token hash is 64 hex characters");

    const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
    assert(row.userId === user.id, "token row belongs to the test user");
    assert(row.usedAt === null, "new token is unused");
    assert(row.expiresAt.getTime() > Date.now(), "new token expires in the future");
    assert(row.expiresAt.getTime() - Date.now() <= PASSWORD_RESET_LIMITS.tokenTtlMs + 5000, "expiry is about one hour");

    const dumped = JSON.stringify(
      await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "PasswordResetToken" WHERE "userId" = $1`, user.id),
    );
    assert(!dumped.includes(createdToken.token), "database row does not contain the raw token");

    console.log("\nValidation does not consume the token:");
    const tooShort = await resetPasswordWithToken({
      token: createdToken.token,
      password: "short",
      confirm: "short",
    });
    if (tooShort.ok) throw new Error("ASSERT FAILED: short password was accepted");
    assert(tooShort.error.includes("6"), "password shorter than 6 characters is rejected");
    const mismatch = await resetPasswordWithToken({
      token: createdToken.token,
      password: "longenough",
      confirm: "different1",
    });
    if (mismatch.ok) throw new Error("ASSERT FAILED: mismatched password was accepted");
    assert(mismatch.error === "Passwords do not match.", "mismatched confirmation is rejected");
    const stillThere = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
    assert(stillThere.usedAt === null, "rejected attempts leave the token unused");

    console.log("\nExpiry:");
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const beforeExpiry = await storedHash(user.id);
    const expired = await resetPasswordWithToken({
      token: createdToken.token,
      password: "longenough",
      confirm: "longenough",
    });
    assert(!expired.ok, "expired token is rejected");
    assert((await storedHash(user.id)) === beforeExpiry, "expired token does not change the password hash");

    console.log("\nSingle use:");
    const fresh = await createPasswordResetToken(user.id);
    const freshHash = hashResetToken(fresh.token);
    const replaced = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
    assert(replaced.usedAt !== null, "issuing a new token invalidates the previous one");

    const nextPassword = `New-${randomBytes(9).toString("hex")}`;
    const firstUse = await resetPasswordWithToken({
      token: fresh.token,
      password: nextPassword,
      confirm: nextPassword,
    });
    assert(firstUse.ok === true, "unused token sets a new password");
    const after = await storedHash(user.id);
    assert(after !== nextPassword, "password is not stored in plaintext");
    assert(/^\$2[ab]\$10\$/.test(after), "password is a bcrypt hash at cost 10");
    assert(await bcrypt.compare(nextPassword, after), "bcrypt accepts the new password");
    assert(!(await bcrypt.compare(user.password, after)), "bcrypt rejects the previous password");
    const used = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: freshHash } });
    assert(used.usedAt !== null, "token is marked used");

    const secondUse = await resetPasswordWithToken({
      token: fresh.token,
      password: "another-password",
      confirm: "another-password",
    });
    assert(!secondUse.ok, "used token cannot be used again");
    assert((await storedHash(user.id)) === after, "a replay does not change the password hash");

    console.log("\nNo account enumeration:");
    const missing = await requestPasswordReset(`missing-${randomBytes(3).toString("hex")}@example.test`, "203.0.113.10");
    const present = await requestPasswordReset(user.email, "203.0.113.11");
    if (!missing.ok || !present.ok) throw new Error("ASSERT FAILED: a well-formed address was rejected");
    assert(missing.message === present.message, "known and unknown addresses get the same message");
    assert(missing.message === PASSWORD_RESET_NEUTRAL_MESSAGE, "message does not reveal whether the account exists");

    const inactive = await makeUser(false);
    created.push(inactive.id);
    const inactiveResult = await requestPasswordReset(inactive.email, "203.0.113.12");
    if (!inactiveResult.ok) throw new Error("ASSERT FAILED: inactive account was rejected");
    assert(inactiveResult.message === PASSWORD_RESET_NEUTRAL_MESSAGE, "an inactive account gets the same message");
    const inactiveTokens = await prisma.passwordResetToken.count({ where: { userId: inactive.id } });
    assert(inactiveTokens === 0, "an inactive account is not given a reset token");

    const attemptDump = JSON.stringify(
      await prisma.passwordResetAttempt.findMany({ where: { createdAt: { gte: startedAt } } }),
    );
    assert(!attemptDump.includes(user.email), "throttle rows do not store the raw email");
    assert(!attemptDump.includes("203.0.113.11"), "throttle rows do not store the raw IP");

    console.log("\nThrottling:");
    const throttled = await makeUser();
    created.push(throttled.id);
    const ip = "203.0.113.50";
    const first = await requestPasswordReset(throttled.email, ip);
    assert(first.ok === true, "first request for an address is accepted");
    const second = await requestPasswordReset(throttled.email, `${ip}-other`);
    if (second.ok) throw new Error("ASSERT FAILED: second request was not throttled");
    assert(second.error.length > 0, "a second request for the same address inside a minute is throttled");
    const tokenCount = await prisma.passwordResetToken.count({ where: { userId: throttled.id } });
    assert(tokenCount === 1, "the throttled request does not create another token");

    let blocked = false;
    for (let i = 0; i < PASSWORD_RESET_LIMITS.maxPerIp + 2; i++) {
      const result = await requestPasswordReset(`spray-${i}-${randomBytes(2).toString("hex")}@example.test`, "203.0.113.77");
      if (!result.ok) {
        blocked = true;
        break;
      }
    }
    assert(blocked, "repeated requests from one IP are throttled");
    const afterBlock = await requestPasswordReset(`still-open-${randomBytes(2).toString("hex")}@example.test`, "203.0.113.78");
    assert(afterBlock.ok === true, "a different IP is not blocked by that limit");

    console.log("\nDry-run mail:");
    const secret = randomBytes(32).toString("base64url");
    const body = `Reset: http://127.0.0.1:3000/reset-password?token=${secret}`;
    assert(!redactSecrets(body).includes(secret), "redactSecrets removes the token");
    assert(redactSecrets(body).includes("token=[redacted]"), "redacted text keeps a token placeholder");

    const previousEnv = process.env.NODE_ENV;
    setNodeEnv("production");
    const productionLog = captureConsole();
    let dry: Awaited<ReturnType<typeof sendMail>>;
    try {
      dry = await sendMail({
        to: "pwreset-verify@example.test",
        subject: "Reset your Unite AV password",
        html: `<a href="http://127.0.0.1:3000/reset-password?token=${secret}">reset</a>`,
        text: body,
      });
    } finally {
      productionLog.restore();
      setNodeEnv(previousEnv);
    }
    assert(dry.ok === true && dry.dryRun === true, "missing RESEND_API_KEY is a dry run");
    assert(fetchCalls === 0, "dry run does not call the network");
    const productionText = productionLog.lines.join("\n");
    assert(!productionText.includes(secret), "production dry-run log does not include the token");
    assert(productionText.includes("token=[redacted]"), "production dry-run log redacts the token");
    assert(productionText.includes("pwreset-verify@example.test"), "dry-run log still records the recipient");

    console.log("\nCleanup:");
    for (const id of created) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
    }
    await prisma.passwordResetAttempt.deleteMany({ where: { createdAt: { gte: startedAt } } });
    const remaining = await prisma.user.findMany({ select: { id: true } });
    assert(remaining.length === preexisting.size, "no test users were left behind");
    assert(remaining.every((user) => preexisting.has(user.id)), "pre-existing users were not removed");

    console.log("\nAll password-reset checks passed.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
    await prisma.passwordResetAttempt.deleteMany({ where: { createdAt: { gte: startedAt } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
