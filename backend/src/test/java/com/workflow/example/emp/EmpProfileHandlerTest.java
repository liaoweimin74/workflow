package com.workflow.example.emp;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * EmpProfileHandler 单元测试：查询覆盖（在职天数 + 部门过滤）与前置校验钩子。
 */
@ExtendWith(MockitoExtension.class)
class EmpProfileHandlerTest {

    @Mock
    private BizDataSupport support;

    @Mock
    private UserService userService;

    private EmpProfileHandler handler;

    @BeforeEach
    void setUp() {
        handler = new EmpProfileHandler(support, userService);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(Long userId) {
        LoginUser loginUser = new LoginUser(userId, "admin", null, List.of(), Set.of(), true);
        Authentication auth = new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private static BizDataVO emp(String id, String dept, String hireDate, String status) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", "员工" + id);
        data.put("phone", "13800138000");
        data.put("dept", dept);
        data.put("hire_date", hireDate);
        if (status != null) {
            data.put("status", status);
        }
        return new BizDataVO(id, data, 1, null, null);
    }

    // ==================== overridesQuery ====================

    @Test
    void getFormKey_isEmpProfile() {
        assertThat(handler.getFormKey()).isEqualTo("emp_profile");
    }

    @Test
    void query_marksOverridden() {
        assertThat(handler.overridesQuery()).isTrue();
    }

    @Test
    void query_computesWorkingDaysAndFiltersByCurrentUserDept() {
        loginAs(1L);
        when(userService.getById(1L))
                .thenReturn(new UserVO(1L, "admin", "管理员", null, null, null, 10L, "研发部", 1, null, null));

        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO page = new BizDataPageVO(
                List.of(emp("e1", "10", "2024-01-10", null), emp("e2", "20", "2024-05-01", null)), 2, 1, 20);
        when(support.queryGeneric(eq("emp_profile"), any(BizDataQueryRequest.class))).thenReturn(page);

        BizDataPageVO result = handler.query(req);

        // 仅保留当前用户部门（orgId=10）的员工
        assertThat(result.getRecords()).hasSize(1);
        assertThat(result.getRecords().get(0).getId()).isEqualTo("e1");
        // 在职天数已补充（入职 2024-01-10 → 距今 > 0 天）
        Object workingDays = result.getRecords().get(0).getData().get("workingDays");
        assertThat(workingDays).isNotNull();
        assertThat(((Number) workingDays).longValue()).isPositive();
        assertThat(result.getTotal()).isEqualTo(1);
    }

    @Test
    void query_noAuthentication_returnsAllRecordsWithoutDeptFilter() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO page = new BizDataPageVO(
                List.of(emp("e1", "10", "2024-01-10", null), emp("e2", "20", "2024-05-01", null)), 2, 1, 20);
        when(support.queryGeneric(eq("emp_profile"), any(BizDataQueryRequest.class))).thenReturn(page);

        BizDataPageVO result = handler.query(req);

        // 无安全上下文：不按部门过滤，但仍在职天数
        assertThat(result.getRecords()).hasSize(2);
        assertThat(result.getRecords().get(0).getData()).containsKey("workingDays");
    }

    // ==================== beforeCreate ====================

    @Test
    void beforeCreate_invalidPhone_rejects400() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("phone", "12345");

        assertThatThrownBy(() -> handler.beforeCreate(data))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("手机号");
    }

    @Test
    void beforeCreate_validPhone_passes() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("phone", "13800138000");

        handler.beforeCreate(data); // 不抛异常
    }

    // ==================== beforeDelete ====================

    @Test
    void beforeDelete_activeEmp_rejects409() {
        BizDataVO existing = emp("e1", "10", "2024-01-10", "在职");

        assertThatThrownBy(() -> handler.beforeDelete(existing))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不可删除");
    }

    @Test
    void beforeDelete_noStatus_treatedAsActive_rejects409() {
        BizDataVO existing = emp("e1", "10", "2024-01-10", null);

        assertThatThrownBy(() -> handler.beforeDelete(existing))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不可删除");
    }

    @Test
    void beforeDelete_resignedEmp_passes() {
        BizDataVO existing = emp("e1", "10", "2024-01-10", "离职");

        handler.beforeDelete(existing); // 已离职可删
    }
}