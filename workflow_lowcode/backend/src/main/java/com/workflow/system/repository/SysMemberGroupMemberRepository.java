package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysMemberGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 成员组成员关系仓库（Task 142）。
 */
public interface SysMemberGroupMemberRepository extends JpaRepository<SysMemberGroupMember, Long> {

    Optional<SysMemberGroupMember> findByIdAndIsDeleted(Long id, Integer isDeleted);

    /** 组内全部有效成员关系。 */
    List<SysMemberGroupMember> findByGroupIdAndIsDeleted(Long groupId, Integer isDeleted);

    /** 批量取多个组的有效成员关系（列表页成员数统计，避免 N+1）。 */
    List<SysMemberGroupMember> findByGroupIdInAndIsDeleted(Collection<Long> groupIds, Integer isDeleted);

    /** 组内指定用户的有效成员关系（去重判断 / 批量移除前置查询）。 */
    List<SysMemberGroupMember> findByGroupIdAndUserIdInAndIsDeleted(Long groupId, Collection<Long> userIds, Integer isDeleted);

    /** 组内指定用户的关系（含已软删；用于「移除后重新添加」复活链路）。 */
    List<SysMemberGroupMember> findByGroupIdAndUserIdIn(Long groupId, Collection<Long> userIds);

    /** 软删除组内全部有效成员关系（组删除时连带）。 */
    @Modifying
    @Query("UPDATE SysMemberGroupMember m SET m.isDeleted = 1, m.updatedAt = CURRENT_TIMESTAMP " +
           "WHERE m.groupId = :groupId AND m.isDeleted = 0")
    int softDeleteByGroupId(@Param("groupId") Long groupId);

    /** 批量软删除指定成员关系行。 */
    @Modifying
    @Query("UPDATE SysMemberGroupMember m SET m.isDeleted = 1, m.updatedAt = CURRENT_TIMESTAMP " +
           "WHERE m.id IN :ids")
    int softDeleteByIds(@Param("ids") Collection<Long> ids);

    /** 物理删除某组全部成员关系（仅用于墓碑组清理）。 */
    @Modifying
    @Query("DELETE FROM SysMemberGroupMember m WHERE m.groupId = :groupId")
    int deleteByGroupId(@Param("groupId") Long groupId);
}
