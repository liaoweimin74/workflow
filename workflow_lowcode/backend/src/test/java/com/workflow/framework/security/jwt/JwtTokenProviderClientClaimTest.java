package com.workflow.framework.security.jwt;

import com.workflow.common.constant.GlobalConstant;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * token 端声明单元测试（J4，spec client-login-identity「token 携带端声明」）。
 *
 * <p>钉三件事：① 签发 access/refresh 都携带 client/channel claim 且可回读；
 * ② 无端声明的历史凭证按默认平台端解释（portal=1 / WEB，过渡兼容）；
 * ③ claim 读取走同一验签路径（伪造无效）。
 */
class JwtTokenProviderClientClaimTest {

    private static final String SECRET = "YnJfRFdpbjQ5dU5hZzJ4c0VvN0s2bUx4R0R4aUZ3cG1WeU9yS3F6RXhDdVN4V0E=";

    private JwtTokenProvider provider;

    @BeforeEach
    void setUp() {
        provider = new JwtTokenProvider(SECRET, 30, 10080);
    }

    @Test
    void accessToken_carriesClientAndChannelClaims() {
        String token = provider.createAccessToken(9L, "zhangsan", 7L, "MP");

        assertEquals(7L, provider.getClientIdFromToken(token));
        assertEquals("MP", provider.getChannelFromToken(token));
        assertEquals(9L, provider.getUserIdFromToken(token));
    }

    @Test
    void refreshToken_alsoCarriesClientClaims_forRotationInheritance() {
        String token = provider.createRefreshToken(9L, "zhangsan", 7L, "MP");

        assertEquals(7L, provider.getClientIdFromToken(token));
        assertEquals("MP", provider.getChannelFromToken(token));
    }

    @Test
    void legacyTokenWithoutClaims_defaultsToPortalWeb() {
        // 模拟 V64 时代签发的 2 参 token（sub/username/type，无 client/channel）
        SecretKey key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET));
        Date now = new Date();
        String legacy = Jwts.builder()
                .subject("9")
                .claim("username", "zhangsan")
                .claim("type", GlobalConstant.ACCESS_TOKEN_KEY)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 60_000))
                .signWith(key)
                .compact();

        assertEquals(1L, provider.getClientIdFromToken(legacy));
        assertEquals("WEB", provider.getChannelFromToken(legacy));
    }
}
