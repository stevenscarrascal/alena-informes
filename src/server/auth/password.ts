import { hash, verify } from "@node-rs/argon2";

// Parámetros recomendados por OWASP para argon2id (19 MiB, 2 iteraciones).
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, OPTIONS);
  } catch {
    // Un hash corrupto o de otro algoritmo no debe tumbar el login.
    return false;
  }
}
