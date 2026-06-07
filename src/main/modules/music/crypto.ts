/**
 * 网易云 WeAPI 加密
 * 参考 https://github.com/Binaryify/NeteaseCloudMusicApi
 */
import { createCipheriv } from 'crypto'

const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const NONCE   = Buffer.from('0CoJUm6Qyw8W8jud')   // 16 bytes
const IV      = Buffer.from('0102030405060708')    // 16 bytes
const PUB_KEY = '010001'
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddeec2c5f4b3ffe8c18b8f69a0e5d7e2a35a36e38ffddfe0'

function aesCBC(data: Buffer, key: Buffer): string {
  const cipher = createCipheriv('aes-128-cbc', key, IV)
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('base64')
}

function powMod(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n, b = base % mod, e = exp
  while (e > 0n) {
    if (e & 1n) r = r * b % mod
    e >>= 1n
    b = b * b % mod
  }
  return r
}

function rsaEncrypt(buf: Buffer): string {
  const reversed = Buffer.from([...buf].reverse())
  const m = BigInt('0x' + reversed.toString('hex'))
  const n = BigInt('0x' + MODULUS)
  const e = BigInt('0x' + PUB_KEY)
  return powMod(m, e, n).toString(16).padStart(256, '0')
}

export function weapi(data: object): Record<string, string> {
  const text = JSON.stringify(data)

  // ★ 关键：join() 先拼成字符串，再传给 Buffer
  //   Buffer.from(['a','b'...]) 会把字符当 number 转换，全变 0x00
  //   Buffer.from('ab...') 才会正确取字符的 charCode
  const secretKey = Buffer.from(
    Array.from({ length: 16 }, () => BASE62[Math.floor(Math.random() * 62)]).join(''),
  )

  const params    = aesCBC(Buffer.from(aesCBC(Buffer.from(text), NONCE)), secretKey)
  const encSecKey = rsaEncrypt(secretKey)
  return { params, encSecKey }
}
