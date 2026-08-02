import rateLimit from "express-rate-limit";

// Login is the highest-value brute-force target — keyed on IP, generous
// enough not to lock out a real user mistyping their password a few times.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

// Shared by registration and forgot-password start/reset — all of these send
// an email or mutate account state and don't need to tolerate rapid retries.
export const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});
