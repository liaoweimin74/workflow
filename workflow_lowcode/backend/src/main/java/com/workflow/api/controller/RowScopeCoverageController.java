package com.workflow.api.controller;

import com.workflow.api.dto.RowScopeCoverageVO;
import com.workflow.api.dto.RowScopeExemptionRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.scope.RowScopeCoverageService;
import com.workflow.engine.datasource.scope.RowScopeCoverageService.AxisCoverage;
import com.workflow.engine.datasource.scope.RowScopeCoverageService.ExemptionView;
import com.workflow.engine.datasource.scope.RowScopeCoverageService.Report;
import com.workflow.engine.datasource.scope.RowScopeCoverageService.SourceCoverage;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 覆盖度盘点与豁免端点（管理员）。
 *
 * <p>覆盖度回答「哪些数据源没挂范围」；豁免端点把「接受某个缺口」的决定留痕。
 * 豁免不能替代配置，只能解释缺口——没有理由的豁免会被拒绝。
 */
@RestController
@RequestMapping("/api/v1/row-scope")
public class RowScopeCoverageController {

    private static final List<String> ADMIN_ROLES = List.of("admin", "ROLE_ADMIN");

    private final RowScopeCoverageService coverageService;

    public RowScopeCoverageController(RowScopeCoverageService coverageService) {
        this.coverageService = coverageService;
    }

    @GetMapping("/coverage")
    public R<RowScopeCoverageVO> coverage() {
        requireAdmin();
        return R.ok(toVO(coverageService.report()));
    }

    @GetMapping("/exemptions")
    public R<List<RowScopeCoverageVO.RowScopeExemptionVO>> exemptions() {
        requireAdmin();
        return R.ok(coverageService.exemptions().stream().map(this::toVO).toList());
    }

    @PostMapping("/exemptions")
    public R<RowScopeCoverageVO.RowScopeExemptionVO> exempt(@RequestBody RowScopeExemptionRequest req) {
        requireAdmin();
        return R.ok(toVO(coverageService.exempt(req.getDataSourceId(), req.getAction(), req.getReason())));
    }

    @PostMapping("/exemptions/{id}/revoke")
    public R<RowScopeCoverageVO.RowScopeExemptionVO> revoke(@PathVariable Long id) {
        requireAdmin();
        return R.ok(toVO(coverageService.revoke(id)));
    }

    private RowScopeCoverageVO toVO(Report report) {
        RowScopeCoverageVO vo = new RowScopeCoverageVO();
        vo.setSources(report.sources().stream().map(source -> {
            RowScopeCoverageVO.SourceCoverage item = new RowScopeCoverageVO.SourceCoverage();
            item.setDataSourceId(source.dataSourceId());
            item.setName(source.name());
            item.setType(source.type());
            item.setRead(toVO(source.read()));
            item.setWrite(toVO(source.write()));
            return item;
        }).toList());
        vo.setTotalAxes(report.totalAxes());
        vo.setCoveredAxes(report.coveredAxes());
        vo.setExemptAxes(report.exemptAxes());
        vo.setGapAxes(report.gapAxes());
        return vo;
    }

    private RowScopeCoverageVO.AxisCoverage toVO(AxisCoverage axis) {
        RowScopeCoverageVO.AxisCoverage item = new RowScopeCoverageVO.AxisCoverage();
        item.setAction(axis.action());
        item.setStatus(axis.status());
        item.setPermissionNames(axis.permissionNames());
        item.setExemption(axis.exemption() == null ? null : toVO(axis.exemption()));
        return item;
    }

    private RowScopeCoverageVO.RowScopeExemptionVO toVO(ExemptionView view) {
        RowScopeCoverageVO.RowScopeExemptionVO vo = new RowScopeCoverageVO.RowScopeExemptionVO();
        vo.setId(view.id());
        vo.setDataSourceId(view.dataSourceId());
        vo.setAction(view.action());
        vo.setReason(view.reason());
        vo.setCreatedBy(view.createdBy());
        vo.setCreatedAt(view.createdAt());
        vo.setRevokedBy(view.revokedBy());
        vo.setRevokedAt(view.revokedAt());
        return vo;
    }

    private void requireAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        LoginUser loginUser = auth != null && auth.getPrincipal() instanceof LoginUser user ? user : null;
        if (loginUser == null || loginUser.getRoles() == null
                || loginUser.getRoles().stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BusinessException(403, "需要管理员权限");
        }
    }
}
