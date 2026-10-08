package com.workflow.system.controller;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.system.domain.dto.MemberGroupMemberRequest;
import com.workflow.system.domain.dto.MemberGroupSaveRequest;
import com.workflow.system.domain.vo.GroupMemberVO;
import com.workflow.system.domain.vo.MemberGroupVO;
import com.workflow.system.service.MemberGroupService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 成员组接口（Task 142：去业务表单化，路径对齐 Node `@Controller('api/member-groups')`——
 * 前端 http baseURL=/api + '/member-groups'，即 /api/member-groups，不带 v1 段）。
 *
 * <p>成员端点挂在 `:id` 下；自动规则端点已随规则机制移除（Task 141 决策）。
 */
@RestController
@RequestMapping("/api/member-groups")
public class MemberGroupController {

    private final MemberGroupService memberGroupService;

    public MemberGroupController(MemberGroupService memberGroupService) {
        this.memberGroupService = memberGroupService;
    }

    @GetMapping
    public R<PageResult<MemberGroupVO>> list(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size,
                                             @RequestParam(required = false) String keyword) {
        return R.ok(memberGroupService.list(page, size, keyword));
    }

    @PostMapping
    public R<MemberGroupVO> create(@Valid @RequestBody MemberGroupSaveRequest body) {
        return R.ok(memberGroupService.create(body.groupName(), body.description()));
    }

    @PutMapping("/{id}")
    public R<MemberGroupVO> update(@PathVariable Long id, @Valid @RequestBody MemberGroupSaveRequest body) {
        return R.ok(memberGroupService.update(id, body.groupName(), body.description(), body.status()));
    }

    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable Long id) {
        memberGroupService.delete(id);
        return R.ok();
    }

    /** 组成员分页（全部为手动添加成员）。 */
    @GetMapping("/{id}/members")
    public R<PageResult<GroupMemberVO>> members(@PathVariable Long id,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int size,
                                                @RequestParam(required = false) String keyword) {
        return R.ok(memberGroupService.listMembers(id, page, size, keyword));
    }

    /** 批量添加成员。 */
    @PostMapping("/{id}/members")
    public R<Void> addMembers(@PathVariable Long id, @RequestBody MemberGroupMemberRequest body) {
        memberGroupService.addMembers(id, body.userIds());
        return R.ok();
    }

    /** 批量移除成员。 */
    @PostMapping("/{id}/members/remove")
    public R<Void> removeMembers(@PathVariable Long id, @RequestBody MemberGroupMemberRequest body) {
        memberGroupService.removeMembers(id, body.userIds());
        return R.ok();
    }
}
