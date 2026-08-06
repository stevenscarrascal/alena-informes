import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Los tokens (de sesión y de invitación/recuperación) se entregan al usuario en
 * claro una sola vez y en la base solo se guarda su SHA-256. Así una lectura de
 * la tabla no permite suplantar a nadie.
 *
 * SHA-256 basta aquí, a diferencia de las contraseñas: son 256 bits aleatorios,
 * no hay nada que adivinar por fuerza bruta ni diccionario.
 */

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante de dos hashes hexadecimales. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
