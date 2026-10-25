import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { loadEnv } from '../config/env'

/**
 * 客户端渠道 secret 的对称加密（AES-256-GCM）。
 *
 * 密钥来自配置 `crypto.secretKey`（env `CLIENT_CRYPTO_KEY`，base64 的 32 字节）。
 * 密文格式：`base64( iv(12) ‖ authTag(16) ‖ ciphertext )` —— iv/tag 随密文一起存，
 * 每次加密用新随机 iv，故同一明文两次密文不同（GCM 语义，非缺陷）。
 *
 * ⚠️ 加解密只允许发生在 service 边界（见 client.service.ts 约定）：
 *   repository 不做加解密、任何 VO 读出口一律掩码 secret。本模块只提供纯函数。
 */

/** AES-256-GCM 的 iv 长度（字节）。 */
const IV_BYTES = 12
/** GCM 认证标签长度（字节）。 */
const TAG_BYTES = 16

let cachedKey: Buffer | undefined

/** 惰性解析密钥：首次读取 loadEnv()，之后复用（同一次进程内密钥恒定，便于加解密往返）。 */
function key(): Buffer {
  if (cachedKey === undefined) {
    const raw = Buffer.from(loadEnv().crypto.secretKey, 'base64')
    if (raw.length !== 32) {
      throw new Error('CLIENT_CRYPTO_KEY 必须是 base64 编码的 32 字节密钥')
    }
    cachedKey = raw
  }
  return cachedKey
}

/**
 * 加密明文 secret。空串 / null / undefined 原样直通（不落密文、不报错）。
 */
export function encryptSecret(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

/**
 * 解密密文 secret。空串 / null / undefined 原样直通。
 */
export function decryptSecret(ciphertext: string | null | undefined): string | null | undefined {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') return ciphertext
  const raw = Buffer.from(ciphertext, 'base64')
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new Error('非法的 secret 密文（长度不足）')
  }
  const iv = raw.subarray(0, IV_BYTES)
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const body = raw.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}
