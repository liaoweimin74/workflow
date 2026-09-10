package com.workflow.system.controller;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.system.domain.dto.UserCreateRequest;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.dto.UserUpdateRequest;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public R<PageResult<UserVO>> list(UserQueryRequest query) {
        return R.ok(userService.list(query));
    }

    @GetMapping("/batch")
    public R<List<UserVO>> batch(@RequestParam(required = false) List<Long> ids) {
        if (ids == null) ids = List.of();
        return R.ok(userService.findByIds(ids));
    }

    @GetMapping("/{id}")
    public R<UserVO> getById(@PathVariable Long id) {
        return R.ok(userService.getById(id));
    }

    @PostMapping
    public R<UserVO> create(@Valid @RequestBody UserCreateRequest request) {
        return R.ok(userService.create(request));
    }

    @PutMapping("/{id}")
    public R<UserVO> update(@PathVariable Long id, @Valid @RequestBody UserUpdateRequest request) {
        return R.ok(userService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return R.ok();
    }

    @PutMapping("/{id}/status")
    public R<Void> updateStatus(@PathVariable Long id, @RequestBody StatusRequest request) {
        userService.updateStatus(id, request.status());
        return R.ok();
    }

    @PutMapping("/{id}/reset-password")
    public R<Void> resetPassword(@PathVariable Long id) {
        userService.resetPassword(id);
        return R.ok();
    }

    public record StatusRequest(Integer status) {}
}