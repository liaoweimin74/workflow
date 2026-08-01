package com.workflow.framework.security.jwt;

import com.workflow.common.constant.GlobalConstant;
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

    public String createAccessToken(Long userId, String username) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
                .claim("type", GlobalConstant.ACCESS_TOKEN_KEY)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + accessTokenExpire * 60 * 1000))
                .signWith(secretKey)
                .compact();
    }

    public String createRefreshToken(Long userId, String username) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
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
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return Long.parseLong(claims.getSubject());
    }

    public String getUsernameFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claims.get("username", String.class);
    }

    public String getTokenType(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claims.get("type", String.class);
    }
}