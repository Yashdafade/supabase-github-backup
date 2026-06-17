import crypto from 'crypto';

/**
 * Encrypts a text string using a passphrase.
 * @param {string} text - The plaintext to encrypt.
 * @param {string} passphrase - The encryption password.
 * @returns {string} - The IV and ciphertext separated by a colon, hex encoded.
 */
export function encrypt(text, passphrase) {
  // Derive key using SHA256 of the passphrase
  const key = crypto.createHash('sha256').update(passphrase).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts an encrypted hex string using a passphrase.
 * @param {string} encryptedText - The IV and ciphertext separated by a colon.
 * @param {string} passphrase - The decryption password.
 * @returns {string} - The decrypted plaintext.
 */
export function decrypt(encryptedText, passphrase) {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted format.');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = crypto.createHash('sha256').update(passphrase).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
