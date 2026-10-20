package com.workflow.engine.datasource.scope;

import com.workflow.framework.security.domain.LoginUser;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 把登录主体摊平成数据范围可匹配的主体标识集合（{@code ROLE:<roleCode>}）。
 *
 * <p>一个用户可以同时命中多个权限对象（多个角色各命中若干对象），命中集合由
 * {@code DataScopeService} 取并集（OR）生效。
 */
@Component
public class DataScopeSubjectResolver {

    public Set<String> subjectsOf(LoginUser user) {
        Set<String> out = new LinkedHashSet<>();
        if (user == null || user.getRoles() == null) {
            return out;
        }
        for (String role : user.getRoles()) {
            if (role != null && !role.isBlank()) {
                out.add(DataScopeSubject.ROLE.name() + ":" + role);
            }
        }
        return out;
    }
}
