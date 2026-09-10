package com.workflow.system.service;

import com.workflow.system.domain.dto.UserCreateRequest;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.dto.UserUpdateRequest;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.common.domain.PageResult;

import java.util.List;

public interface UserService {
    PageResult<UserVO> list(UserQueryRequest query);

    UserVO getById(Long id);

    UserVO create(UserCreateRequest request);

    UserVO update(Long id, UserUpdateRequest request);

    void delete(Long id);

    void updateStatus(Long id, Integer status);

    void resetPassword(Long id);

    List<UserVO> findByIds(List<Long> ids);

    /**
     * 根据用户名列表批量查询用户。
     *
     * @param usernames 用户名列表
     * @return 用户 VO 列表
     */
    List<UserVO> findByUsernames(List<String> usernames);
}