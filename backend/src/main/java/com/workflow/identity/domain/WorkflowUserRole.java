package com.workflow.identity.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "wf_user_role")
@IdClass(WorkflowUserRole.UserRoleId.class)
public class WorkflowUserRole {

    @Id
    @Column(name = "user_id", length = 64)
    private String userId;

    @Id
    @Column(name = "role_id", length = 64)
    private String roleId;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public static class UserRoleId implements Serializable {
        private String userId;
        private String roleId;

        public UserRoleId() {}
        public UserRoleId(String userId, String roleId) {
            this.userId = userId;
            this.roleId = roleId;
        }

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getRoleId() { return roleId; }
        public void setRoleId(String roleId) { this.roleId = roleId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof UserRoleId that)) return false;
            return Objects.equals(userId, that.userId) && Objects.equals(roleId, that.roleId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, roleId);
        }
    }
}