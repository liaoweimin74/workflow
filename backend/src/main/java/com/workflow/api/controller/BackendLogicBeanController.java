package com.workflow.api.controller;

import com.workflow.api.dto.BackendBeanInfo;
import com.workflow.common.domain.R;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.RegisteredBeanMethod;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 后端业务逻辑相关只读配置接口。
 */
@RestController
@RequestMapping("/api/v1/backend-logic")
public class BackendLogicBeanController {

    private final BackendBeanRegistry registry;

    public BackendLogicBeanController(BackendBeanRegistry registry) {
        this.registry = registry;
    }

    /**
     * 返回已注册的本系统服务方法清单，供设计器下拉选择。
     */
    @GetMapping("/beans")
    public R<List<BackendBeanInfo>> beans() {
        List<BackendBeanInfo> list = registry.listMethods().stream()
                .map(this::toInfo)
                .toList();
        return R.ok(list);
    }

    private BackendBeanInfo toInfo(RegisteredBeanMethod m) {
        BackendBeanInfo info = new BackendBeanInfo();
        info.setBeanName(m.beanName());
        info.setMethodName(m.methodName());
        info.setDisplayName(m.displayName());
        info.setParameterCount(m.parameterCount());
        return info;
    }
}