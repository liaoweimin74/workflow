package com.workflow.framework.security.domain;

import com.workflow.system.domain.entity.SysClient;
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

    /** 所属组织 id（sys_user.org_id）；数据范围 {orgId} 模板取值来源，可为 null。 */
    private Long orgId;

    /** 端上下文（J4）：token client claim 灌入，过滤器/菜单接口/PageAccessGuard 的唯一端来源。 */
    private Long clientId;

    /** 渠道类型（WEB/MP/…），token channel claim 灌入。 */
    private String channel;

    /** 无端上下文构造：按默认平台端 + WEB 解释（历史语义等价，与 claim 缺省同一口径）。 */
    public LoginUser(Long userId, String username, String password,
                     List<String> roles, Set<String> permissions, Boolean enabled) {
        this(userId, username, password, roles, permissions, enabled, SysClient.PORTAL_CLIENT_ID, "WEB");
    }

    public LoginUser(Long userId, String username, String password,
                     List<String> roles, Set<String> permissions, Boolean enabled,
                     Long clientId, String channel) {
        this.userId = userId;
        this.username = username;
        this.password = password;
        this.roles = roles;
        this.permissions = permissions;
        this.enabled = enabled;
        this.clientId = clientId;
        this.channel = channel;
    }

    public Long getUserId() { return userId; }
    public List<String> getRoles() { return roles; }
    public Set<String> getPermissions() { return permissions; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getClientId() { return clientId; }
    public String getChannel() { return channel; }

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
