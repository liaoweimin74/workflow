package com.workflow.system.domain.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * MenuCreateRequest 校验注解可用性测试。
 *
 * <p>背景：menuType 早先被标了 {@code @NotBlank}，而该约束只支持 CharSequence，
 * Hibernate Validator 在初始化阶段就抛 HV000030，导致 {@code POST /api/menus} 对
 * 任何请求体都返回 500——即菜单管理页新建菜单全平台不可用。此处把「合法请求体
 * 校验通过」钉住，防止整数字段再被标上字符串约束。
 */
class MenuCreateRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        if (factory != null) factory.close();
    }

    @Test
    void 合法请求体校验通过() {
        MenuCreateRequest request = new MenuCreateRequest(
                1L, "物料看板", 1, "/material/demo-board", "material:demo-board",
                "material:manage", "Files", 10, 1);

        Set<ConstraintViolation<MenuCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isEmpty();
    }

    @Test
    void menuType缺失时按必填拒绝() {
        MenuCreateRequest request = new MenuCreateRequest(
                1L, "物料看板", null, "/material/demo-board", null, null, null, null, null);

        assertThat(validator.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath().toString()).isEqualTo("menuType"));
    }

    @Test
    void 菜单名空白仍按原有约束拒绝() {
        MenuCreateRequest request = new MenuCreateRequest(
                1L, "  ", 1, null, null, null, null, null, null);

        assertThat(validator.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath().toString()).isEqualTo("menuName"));
    }
}
