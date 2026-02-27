import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required')
}

const rawKey = process.env.ENCRYPTION_KEY.trim()

// AES-256 cần đúng 32 bytes. Key phải có ít nhất 32 ký tự.
// Nếu ngắn hơn, padEnd tạo key yếu mà không có cảnh báo — throw sớm.
if (rawKey.length < 32) {
  throw new Error(
    `ENCRYPTION_KEY must be at least 32 characters (got ${rawKey.length}). ` +
    'Generate a secure key with: openssl rand -hex 32'
  )
}

// Lấy 32 bytes đầu (UTF-8). Key trong .env nên là chuỗi >= 64 hex chars.
const ENCRYPTION_KEY = Buffer.from(rawKey.slice(0, 32))

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  return iv.toString('hex') + ':' + encrypted
}

export function decrypt(text: string): string {
  const parts = text.split(':')
  const iv = Buffer.from(parts.shift()!, 'hex')
  const encryptedText = parts.join(':')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
