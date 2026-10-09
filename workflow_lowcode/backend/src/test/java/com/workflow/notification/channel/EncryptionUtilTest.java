package com.workflow.notification.channel;

import com.workflow.notification.model.ChannelType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EncryptionUtilTest {

    @Test
    void encrypt_decrypt_roundtrip() {
        EncryptionUtil util = new EncryptionUtil();
        // 使用反射设置密钥（测试环境）
        try {
            var field = EncryptionUtil.class.getDeclaredField("encryptionKey");
            field.setAccessible(true);
            // 生成一个 32 字节的测试密钥
            byte[] keyBytes = new byte[32];
            new java.security.SecureRandom().nextBytes(keyBytes);
            field.set(util, java.util.Base64.getEncoder().encodeToString(keyBytes));
        } catch (Exception e) {
            // 忽略
        }

        String plainText = "my-secret-api-key-12345";
        String encrypted = util.encrypt(plainText);
        String decrypted = util.decrypt(encrypted);

        assertThat(decrypted).isEqualTo(plainText);
        assertThat(encrypted).isNotEqualTo(plainText);
    }
}
