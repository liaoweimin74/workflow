package com.workflow.notification.channel;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM 加密工具
 * 
 * <p>用于加密存储渠道配置中的敏感参数（api_key, api_secret 等）
 */
@Component
public class EncryptionUtil {

    @Value("${notification.encryption.key:}")
    private String encryptionKey;

    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    /**
     * 加密字符串
     */
    public String encrypt(String plainText) {
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.ENCRYPT_MODE, getSecretKey(), spec);

            byte[] encrypted = cipher.doFinal(plainText.getBytes("UTF-8"));
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("加密失败", e);
        }
    }

    /**
     * 解密字符串
     */
    public String decrypt(String cipherText) {
        try {
            byte[] combined = Base64.getDecoder().decode(cipherText);
            byte[] iv = new byte[GCM_IV_LENGTH];
            byte[] encrypted = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, iv.length);
            System.arraycopy(combined, iv.length, encrypted, 0, encrypted.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), spec);

            byte[] decrypted = cipher.doFinal(encrypted);
            return new String(decrypted, "UTF-8");
        } catch (Exception e) {
            throw new RuntimeException("解密失败", e);
        }
    }

    private SecretKey getSecretKey() {
        // 如果配置了密钥，使用配置的；否则生成默认密钥（生产环境应配置）
        byte[] keyBytes;
        if (encryptionKey != null && !encryptionKey.isEmpty()) {
            keyBytes = Base64.getDecoder().decode(encryptionKey);
        } else {
            // 默认密钥（仅开发环境使用）
            keyBytes = new byte[32];
            new SecureRandom().nextBytes(keyBytes);
        }
        return new SecretKeySpec(keyBytes, "AES");
    }
}
