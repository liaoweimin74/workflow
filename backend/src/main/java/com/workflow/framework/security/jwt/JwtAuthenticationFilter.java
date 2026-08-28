package com.workflow.framework.security.jwt;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.service.LoginUserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtTokenProvider jwtTokenProvider;
    private final LoginUserService loginUserService;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider,
                                   LoginUserService loginUserService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.loginUserService = loginUserService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);
        if (token != null && jwtTokenProvider.validateToken(token)) {
            String tokenType = jwtTokenProvider.getTokenType(token);
            if (!GlobalConstant.ACCESS_TOKEN_KEY.equals(tokenType)) {
                filterChain.doFilter(request, response);
                return;
            }
            Long userId = jwtTokenProvider.getUserIdFromToken(token);
            // 加载完整角色与权限集合（后端鉴权依赖，不能为空）
            LoginUser loginUser = loginUserService.buildLoginUser(userId);
            if (loginUser != null) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }
        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader(GlobalConstant.TOKEN_HEADER);
        if (StringUtils.hasText(header) && header.startsWith(GlobalConstant.TOKEN_PREFIX)) {
            return header.substring(GlobalConstant.TOKEN_PREFIX.length());
        }
        return null;
    }
}