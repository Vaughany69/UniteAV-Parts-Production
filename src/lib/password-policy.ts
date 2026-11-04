/** Same minimum createUser enforces in src/lib/actions.ts. */
export const MIN_PASSWORD_LENGTH = 6;

/** Same cost createUser and the seed scripts pass to bcrypt.hash. */
export const BCRYPT_ROUNDS = 10;

/** Shown for every well-formed address, whether or not an account exists. */
export const PASSWORD_RESET_NEUTRAL_MESSAGE =
  "If an account exists for that email, a reset link is on its way. It expires in one hour.";

export const PASSWORD_RESET_LIMITS = {
  tokenTtlMs: 60 * 60 * 1000,
  minIntervalMs: 60 * 1000,
  maxPerEmailPerHour: 5,
  ipWindowMs: 15 * 60 * 1000,
  maxPerIp: 8,
} as const;
