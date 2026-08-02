import dotenv from "dotenv";

dotenv.config();

// Fails fast at startup instead of silently signing/verifying tokens with a
// hardcoded fallback secret that's sitting in source control — if that
// fallback were ever reached in a real deployment, anyone could forge a
// valid session token for any user id.
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is not set. Refusing to start with an insecure default secret.",
  );
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
