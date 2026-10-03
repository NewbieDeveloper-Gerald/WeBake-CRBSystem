const crypto = require('crypto');

/**
 * Hash a plain text password using PBKDF2 with SHA-512 and a cryptographically secure random salt
 * @param {string} password 
 * @returns {string} Serialized salt and hash: pbkdf2$10000$<salt>$<hash>
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const keyLen = 64;
  const digest = 'sha512';
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keyLen, digest).toString('hex');
  return `pbkdf2$${iterations}$${salt}$${derivedKey}`;
}

/**
 * Verify a plain text password against a stored hash string
 * Supports PBKDF2 serialized format and safe legacy/dev fallback
 * @param {string} password 
 * @param {string} storedHash 
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  // Standard PBKDF2 format: pbkdf2$<iterations>$<salt>$<hash>
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];
    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(originalHash, 'hex'));
  }

  // Fallback: SHA-256 hash or plain string for dev backward compatibility
  try {
    const shaHash = crypto.createHash('sha256').update(password).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(shaHash), Buffer.from(storedHash))) {
      return true;
    }
  } catch (e) {}

  return password === storedHash;
}

module.exports = {
  hashPassword,
  verifyPassword
};
