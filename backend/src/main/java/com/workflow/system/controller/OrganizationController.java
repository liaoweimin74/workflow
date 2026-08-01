package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.system.domain.dto.OrganizationCreateRequest;
import com.workflow.system.domain.dto.OrganizationUpdateRequest;
import com.workflow.system.domain.vo.TreeNode;
import com.workflow.system.service.OrganizationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/orgs")
public class OrganizationController {
    private final OrganizationService orgService;

    public OrganizationController(OrganizationService orgService) {
        this.orgService = orgService;
    }

    @GetMapping("/tree")
    public R<List<TreeNode>> tree() {
        return R.ok(orgService.tree());
    }

    @PostMapping
    public R<TreeNode> create(@Valid @RequestBody OrganizationCreateRequest request) {
        return R.ok(orgService.create(request));
    }

    @PutMapping("/{id}")
    public R<TreeNode> update(@PathVariable Long id, @Valid @RequestBody OrganizationUpdateRequest request) {
        return R.ok(orgService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        orgService.delete(id);
        return R.ok();
    }
}