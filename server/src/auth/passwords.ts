import bcrypt from "bcryptjs";

// 12 rounds is the OWASP minimum recommendation for bcrypt as of 2024.
// It makes a single hash take ~300 ms on modern hardware, which is slow
// enough to make brute-force attacks expensive and fast enough that a
// legitimate login feels instant to the user.
const BCRYPT_ROUNDS = 12;

// A static dummy hash computed once at module load.  It is used in the login
// path when the email is not found, so that comparing against it takes the
// same ~300 ms as a real comparison.  Without this, a timing side-channel
// would let an attacker enumerate which emails are registered.
//
// We use a synchronous hash here because Node16 module resolution does not
// support top-level await in .ts files; the async version would need a .mts
// extension or a different module setting.
const DUMMY_HASH = bcrypt.hashSync("__dummy__", BCRYPT_ROUNDS);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Called when no user was found for the given email.  Performing a real
// bcrypt.compare() (against the dummy hash) ensures the response time is
// indistinguishable from a failed login for an existing user, preventing
// timing attacks that reveal whether an email is registered.
export async function consumeTimingBudget(): Promise<void> {
  await bcrypt.compare("__timing_budget__", DUMMY_HASH);
}
