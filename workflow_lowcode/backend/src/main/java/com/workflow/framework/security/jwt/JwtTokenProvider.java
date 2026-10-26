package com.workflow.framework.security.jwt;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.system.domain.entity.SysClient;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

@Component
public class JwtTokenProvider {
    private final SecretKey secretKey;
    private final long accessTokenExpire;
    private final long refreshTokenExpire;

    public JwtTokenProvider(
            @Value("${jwt.secret:YnJfRFdpbjQ5dU5hZzJ4c0VvN0s2bUx4R0R4aUZ3cG1WeU9yS3F6RXhDdVN4V0E=}") String secret,
            @Value("${jwt.access-token-expire:30}") long accessTokenExpire,
            @Value("${jwt.refresh-token-expire:10080}") long refreshTokenExpire) {
        this.secretKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        this.accessTokenExpire = accessTokenExpire;
        this.refreshTokenExpire = refreshTokenExpire;
    }

    /**
     * 签发 access token（J4）：client/channel claim 是过滤器、菜单接口、PageAccessGuard
     * 端上下文的唯一来源（spec client-login-identity「token 携带端声明」）。
     */
    public String createAccessToken(Long userId, String username, Long clientId, String channel) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
                .claim("client", clientId)
                .claim("channel", channel)
                .claim("type", GlobalConstant.ACCESS_TOKEN_KEY)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + accessTokenExpire * 60 * 1000))
                .signWith(secretKey)
                .compact();
    }

    /** refresh token 同带端 claim：轮换（refreshToken 接口）时继承，避免续期后端上下文降级。 */
    public String createRefreshToken(Long userId, String username, Long clientId, String channel) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
                .claim("client", clientId)
                .claim("channel", channel)
                .claim("type", GlobalConstant.REFRESH_TOKEN_KEY)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + refreshTokenExpire * 60 * 1000))
                .signWith(secretKey)
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public Long getUserIdFromToken(String token) {
        return Long.parseLong(parseClaims(token).getSubject());
    }

    public String getUsernameFromToken(String token) {
        return parseClaims(token).get("username", String.class);
    }

    public String getTokenType(String token) {
        return parseClaims(token).get("type", String.class);
    }

    /** 无端声明的历史凭证按默认平台端解释（spec 过渡兼容条款：V64 时代 2 参 token 不破）。 */
    public Long getClientIdFromToken(String token) {
        Number client = parseClaims(token).get("client", Number.class);
        return client == null ? SysClient.PORTAL_CLIENT_ID : client.longValue();
    }

    public String getChannelFromToken(String token) {
        String channel = parseClaims(token).get("channel", String.class);
        return channel == null || channel.isBlank() ? "WEB" : channel;
    }

    private Claims parseClaims(String token) {
        return Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
    }
}
