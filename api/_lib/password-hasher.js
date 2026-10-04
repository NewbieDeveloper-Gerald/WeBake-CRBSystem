const crypto = require('crypto');

const CURRENT_ITERATIONS = 210000;
const KEY_LEN = 64;
const DIGEST = 'sha512';

/**
 * Hash a plain text password using PBKDF2 with SHA-512 and a cryptographically secure random salt
 * @param {string} password 
 * @returns {Promise<string>} Serialized salt and hash: pbkdf2$210000$<salt>$<hash>
 */
async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, CURRENT_ITERATIONS, KEY_LEN, DIGEST, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
  return `pbkdf2$${CURRENT_ITERATIONS}$${salt}$${derivedKey}`;
}

/**
 * Verify a plain text password against a stored hash string
 * Constant-time comparison with timingSafeEqual and length validation
 * @param {string} password 
 * @param {string} storedHash 
 * @returns {Promise<{ valid: boolean, needsRehash: boolean }>}
 */
async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return { valid: false, needsRehash: false };
  }

  // Standard PBKDF2 format: pbkdf2$<iterations>$<salt>$<hash>
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return { valid: false, needsRehash: false };
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];

    if (!iterations || isNaN(iterations) || !salt || !originalHash) {
      return { valid: false, needsRehash: false };
    }

    const derivedKey = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, KEY_LEN, DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key.toString('hex'));
      });
    });

    const bufDerived = Buffer.from(derivedKey, 'hex');
    const bufOriginal = Buffer.from(originalHash, 'hex');

    if (bufDerived.length !== bufOriginal.length) {
      return { valid: false, needsRehash: false };
    }

    const valid = crypto.timingSafeEqual(bufDerived, bufOriginal);
    const needsRehash = valid && (iterations < CURRENT_ITERATIONS);
    return { valid, needsRehash };
  }

  // Safe fallback for any legacy SHA-256 hashes
  try {
    const shaHash = crypto.createHash('sha256').update(password).digest('hex');
    const bufSha = Buffer.from(shaHash);
    const bufStored = Buffer.from(storedHash);
    if (bufSha.length === bufStored.length && crypto.timingSafeEqual(bufSha, bufStored)) {
      return { valid: true, needsRehash: true };
    }
  } catch (e) {}

  return { valid: false, needsRehash: false };
}

module.exports = {
  CURRENT_ITERATIONS,
  hashPassword,
  verifyPassword
};
