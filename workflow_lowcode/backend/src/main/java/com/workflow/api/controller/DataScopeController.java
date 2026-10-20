package com.workflow.api.controller;

import com.workflow.api.dto.DataScopeDTO;
import com.workflow.api.dto.DataScopeEffectiveVO;
import com.workflow.api.dto.DataScopeSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.scope.DataScopeAction;
import com.workflow.engine.datasource.scope.DataScopeService;
import com.workflow.engine.datasource.scope.WfDataScope;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.service.LoginUserService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 数据范围（主体 × 数据源 × 动作）配置与生效预览端点。
 *
 * <p>整组接口仅管理员可用：这是权限配置，能被普通用户改写等于自己给自己放行。
 * 后端目前无方法级授权（{@code @PreAuthorize} 零使用），沿用项目既有的编程式管理员校验。
 */
@RestController
@RequestMapping("/api/v1/data-scopes")
public class DataScopeController {

    private final DataScopeService dataScopeService;
    private final DataSourceDefinitionService dataSourceService;
    private final LoginUserService loginUserService;

    public DataScopeController(DataScopeService dataScopeService,
                               DataSourceDefinitionService dataSourceService,
                               LoginUserService loginUserService) {
        this.dataScopeService = dataScopeService;
        this.dataSourceService = dataSourceService;
        this.loginUserService = loginUserService;
    }

    @GetMapping
    public R<List<DataScopeDTO>> list(@RequestParam String dataSourceId) {
        requireAdmin();
        return R.ok(dataScopeService.list(dataSourceId).stream().map(this::toDTO).toList());
    }

    /**
     * 保存规则（同租户 + 同数据源 + 同动作 + 同主体覆盖）。
     * 先校验数据源存在：悬空 dataSourceId 的配置看着生效实则永不命中，属于必须拒绝的误配。
     */
    @PostMapping
    public R<DataScopeDTO> save(@RequestBody DataScopeSaveRequest req) {
        requireAdmin();
        dataSourceService.getById(req.getDataSourceId());
        WfDataScope saved = dataScopeService.save(req.getDataSourceId(), req.getAction(),
                req.getSubjectType(), req.getSubjectKey(), req.getScopeType(),
                req.getScopeColumn(), req.getScopeValue());
        return R.ok(toDTO(saved));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        requireAdmin();
        dataScopeService.delete(id);
        return R.ok();
    }

    /**
     * 生效预览：指定用户（默认为当前登录人）在某数据源某动作上实际受什么限制。
     *
     * <p>只读、不改行为；条件走 {@code DataScopeService} 与真实施加同一条代码路径，
     * 因此预览结果不会与线上行为漂移。管理员排障时不必再猜「这人到底能看到哪些行」。
     */
    @GetMapping("/effective")
    public R<DataScopeEffectiveVO> effective(@RequestParam String dataSourceId,
                                             @RequestParam(defaultValue = "READ") DataScopeAction action,
                                             @RequestParam(required = false) Long userId) {
        requireAdmin();
        dataSourceService.getById(dataSourceId);
        LoginUser target = resolveTarget(userId);

        WfDataScope rule = dataScopeService.effectiveRule(dataSourceId, action, target);
        Map<String, Object> condition = dataScopeService.conditionFor(dataSourceId, action, target);
        Set<String> subjects = dataScopeService.subjectsOf(target);

        DataScopeEffectiveVO vo = new DataScopeEffectiveVO();
        vo.setDataSourceId(dataSourceId);
        vo.setAction(action);
        vo.setUserId(target.getUserId());
        vo.setUsername(target.getUsername());
        vo.setSubjects(List.copyOf(subjects));
        vo.setMatchedRules(dataScopeService.matchedRules(dataSourceId, action, target)
                .stream().map(this::toDTO).toList());
        vo.setEffectiveRule(toDTO(rule));
        // ALL 命中与无命中都表现为「无行级条件」，但含义不同，这里如实区分开
        vo.setUnrestricted(condition.isEmpty());
        vo.setCondition(condition);
        return R.ok(vo);
    }

    private LoginUser resolveTarget(Long userId) {
        if (userId == null) {
            LoginUser current = currentLoginUser();
            if (current == null) {
                throw new BusinessException(400, "缺少 userId 且当前请求无登录主体");
            }
            return current;
        }
        LoginUser target = loginUserService.buildLoginUser(userId);
        if (target == null) {
            throw new BusinessException(404, "用户不存在或已禁用: " + userId);
        }
        return target;
    }

    private DataScopeDTO toDTO(WfDataScope entity) {
        if (entity == null) {
            return null;
        }
        DataScopeDTO dto = new DataScopeDTO();
        dto.setId(entity.getId());
        dto.setDataSourceId(entity.getDataSourceId());
        dto.setAction(entity.getAction());
        dto.setSubjectType(entity.getSubjectType());
        dto.setSubjectKey(entity.getSubjectKey());
        dto.setScopeType(entity.getScopeType());
        dto.setScopeColumn(entity.getScopeColumn());
        dto.setScopeValue(entity.getScopeValue());
        return dto;
    }

    private void requireAdmin() {
        LoginUser loginUser = currentLoginUser();
        boolean admin = loginUser != null
                && loginUser.getRoles() != null
                && loginUser.getRoles().stream().anyMatch(r -> "admin".equals(r) || "ROLE_ADMIN".equals(r));
        if (!admin) {
            throw new BusinessException(403, "需要管理员权限");
        }
    }

    private LoginUser currentLoginUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser;
        }
        return null;
    }
}
