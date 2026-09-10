package com.workflow.framework.security.domain;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public class LoginUser implements UserDetails {
    private Long userId;
    private String username;
    private String password;
    private List<String> roles;
    private Set<String> permissions;
    private Boolean enabled;

    public LoginUser(Long userId, String username, String password,
                     List<String> roles, Set<String> permissions, Boolean enabled) {
        this.userId = userId;
        this.username = username;
        this.password = password;
        this.roles = roles;
        this.permissions = permissions;
        this.enabled = enabled;
    }

    public Long getUserId() { return userId; }
    public List<String> getRoles() { return roles; }
    public Set<String> getPermissions() { return permissions; }

    @Override
    public String getUsername() { return username; }

    @Override
    public String getPassword() { return password; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return permissions.stream()
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());
    }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { return true; }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() { return enabled; }
}