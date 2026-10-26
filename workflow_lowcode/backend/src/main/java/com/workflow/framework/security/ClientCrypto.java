package com.workflow.framework.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 客户端渠道 secret 的对称加密（AES-256-GCM），J2 移植 backend-node framework/security/crypto.ts。
 *
 * <p>密钥来自配置 {@code client.crypto.key}（env {@code CLIENT_CRYPTO_KEY}，base64 的 32 字节）。
 * 密文格式：{@code base64( iv(12) ‖ authTag(16) ‖ ciphertext )}——与 node 侧逐字节同形，
 * 每次加密用新随机 iv（GCM 语义，同一明文两次密文不同，非缺陷）。
 *
 * <p>⚠️ 加解密只允许发生在 service 边界（见 ClientService 约定）：
 * repository 不做加解密、任何 VO 读出口一律掩码 secret。本类只提供纯函数。
 */
@Component
public class ClientCrypto {

    /** AES-256-GCM 的 iv 长度（字节）。 */
    private static final int IV_BYTES = 12;
    /** GCM 认证标签长度（字节）。 */
    private static final int TAG_BYTES = 16;
    /** GCM 标签比特数。 */
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public ClientCrypto(
            @Value("${client.crypto.key:d29ya2Zsb3ctY2xpZW50LWNyeXB0by1kZXYta2V5MzI=}") String base64Key) {
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(base64Key);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("CLIENT_CRYPTO_KEY 必须是 base64 编码的 32 字节密钥");
        }
        if (raw.length != 32) {
            throw new IllegalStateException("CLIENT_CRYPTO_KEY 必须是 base64 编码的 32 字节密钥");
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    /**
     * 加密明文 secret。空串 / null 原样直通（不落密文、不报错）。
     */
    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) {
            return plaintext;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] bodyWithTag = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            // Java GCM 输出 = ciphertext‖tag；重排为与 node 同形的 iv‖tag‖ciphertext
            int bodyLen = bodyWithTag.length - TAG_BYTES;
            byte[] out = new byte[IV_BYTES + bodyWithTag.length];
            System.arraycopy(iv, 0, out, 0, IV_BYTES);
            System.arraycopy(bodyWithTag, bodyLen, out, IV_BYTES, TAG_BYTES);
            System.arraycopy(bodyWithTag, 0, out, IV_BYTES + TAG_BYTES, bodyLen);
            return Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("secret 加密失败", e);
        }
    }

    /**
     * 解密密文 secret。空串 / null 原样直通。
     */
    public String decrypt(String ciphertext) {
        if (ciphertext == null || ciphertext.isEmpty()) {
            return ciphertext;
        }
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(ciphertext);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("非法的 secret 密文（非 base64）");
        }
        if (raw.length < IV_BYTES + TAG_BYTES) {
            throw new IllegalStateException("非法的 secret 密文（长度不足）");
        }
        byte[] iv = new byte[IV_BYTES];
        byte[] tag = new byte[TAG_BYTES];
        System.arraycopy(raw, 0, iv, 0, IV_BYTES);
        System.arraycopy(raw, IV_BYTES, tag, 0, TAG_BYTES);
        // Java GCM 解密要求 ciphertext‖tag 连续：body 后接 tag 重组
        byte[] bodyWithTag = new byte[raw.length - IV_BYTES];
        System.arraycopy(raw, IV_BYTES + TAG_BYTES, bodyWithTag, 0, bodyWithTag.length - TAG_BYTES);
        System.arraycopy(tag, 0, bodyWithTag, bodyWithTag.length - TAG_BYTES, TAG_BYTES);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(bodyWithTag), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("secret 解密失败（密文无效或密钥不符）", e);
        }
    }
}
