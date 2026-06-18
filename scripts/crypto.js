import crypto from 'crypto';

/**
 * Encrypts a string or buffer using AES-256-CBC.
 * @param {string|Buffer} data - The data to encrypt.
 * @param {string} passphrase - The encryption password.
 * @returns {Buffer} - The initialization vector (16 bytes) concatenated with the encrypted payload.
 */
export function encrypt(data, passphrase) {
  const key = crypto.createHash('sha256').update(passphrase).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const inputBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return Buffer.concat([iv, cipher.update(inputBuffer), cipher.final()]);
}

/**
 * Decrypts a buffer using AES-256-CBC.
 * @param {Buffer} encryptedBuffer - The encrypted buffer containing the 16-byte IV at the beginning.
 * @param {string} passphrase - The decryption password.
 * @returns {Buffer} - The decrypted payload.
 */
export function decrypt(encryptedBuffer, passphrase) {
  if (encryptedBuffer.length < 17) {
    throw new Error('Invalid encrypted buffer size.');
  }
  const key = crypto.createHash('sha256').update(passphrase).digest();
  const iv = encryptedBuffer.subarray(0, 16);
  const encrypted = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
