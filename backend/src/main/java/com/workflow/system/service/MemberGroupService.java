package com.workflow.system.service;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysMemberGroup;
import com.workflow.system.domain.entity.SysMemberGroupMember;
import com.workflow.system.domain.entity.SysOrganization;
import com.workflow.system.domain.entity.SysPost;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.vo.GroupMemberVO;
import com.workflow.system.domain.vo.MemberGroupVO;
import com.workflow.system.repository.SysMemberGroupMemberRepository;
import com.workflow.system.repository.SysMemberGroupRepository;
import com.workflow.system.repository.SysOrganizationRepository;
import com.workflow.system.repository.SysPostRepository;
import com.workflow.system.repository.SysUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 成员组服务（Task 142：去业务表单化，专用数据表 + 专用接口）。
 *
 * <p>成员均为手动添加（自动规则机制已移除）；成员明细量级小，
 * 与 PostService 相同采用内存分页模式，keyword 过滤在服务层完成。
 */
@Service
public class MemberGroupService {

    private final SysMemberGroupRepository groupRepository;
    private final SysMemberGroupMemberRepository memberRepository;
    private final SysUserRepository userRepository;
    private final SysOrganizationRepository organizationRepository;
    private final SysPostRepository postRepository;

    public MemberGroupService(SysMemberGroupRepository groupRepository,
                              SysMemberGroupMemberRepository memberRepository,
                              SysUserRepository userRepository,
                              SysOrganizationRepository organizationRepository,
                              SysPostRepository postRepository) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.postRepository = postRepository;
    }

    // ================= 成员组 CRUD =================

    /** 分页列表（keyword 匹配名称/说明；每行携带有效成员数）。 */
    public PageResult<MemberGroupVO> list(int page, int size, String keyword) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        String kw = keyword != null && !keyword.isBlank() ? keyword.trim() : null;

        List<SysMemberGroup> rows = groupRepository.search(kw);
        int from = Math.min((safePage - 1) * safeSize, rows.size());
        int to = Math.min(from + safeSize, rows.size());
        List<SysMemberGroup> pageRows = rows.subList(from, to);

        Map<Long, Long> counts = countAliveMembersByGroup(
                pageRows.stream().map(SysMemberGroup::getId).toList());
        List<MemberGroupVO> vos = pageRows.stream()
                .map(g -> toGroupVO(g, counts.getOrDefault(g.getId(), 0L)))
                .toList();
        return new PageResult<>(rows.size(), safePage, safeSize, vos);
    }

    @Transactional
    public MemberGroupVO create(String groupName, String description) {
        String name = requireValidName(groupName);
        // 软删墓碑占用唯一键：同名已删组直接复活（成员关系保持已删，从空组开始）
        java.util.Optional<SysMemberGroup> tombstone =
                groupRepository.findByGroupNameAndIsDeleted(name, GlobalConstant.DELETED_YES);
        if (tombstone.isPresent()) {
            SysMemberGroup revived = tombstone.get();
            revived.setIsDeleted(GlobalConstant.DELETED_NO);
            revived.setDescription(normalizeDescription(description));
            revived.setStatus(1);
            revived.setUpdatedAt(java.time.LocalDateTime.now());
            revived = groupRepository.save(revived);
            return toGroupVO(revived, 0L);
        }
        requireNameAvailable(name, null);
        SysMemberGroup group = new SysMemberGroup();
        group.setGroupName(name);
        group.setDescription(normalizeDescription(description));
        group.setStatus(1);
        group = groupRepository.save(group);
        return toGroupVO(group, 0L);
    }

    @Transactional
    public MemberGroupVO update(Long id, String groupName, String description, Integer status) {
        SysMemberGroup group = requireGroup(id);
        if (groupName != null) {
            String name = requireValidName(groupName);
            if (!name.equals(group.getGroupName())) {
                requireNameAvailable(name, id);
                // 重命名目标名若被软删墓碑占用，物理清除墓碑（其成员关系已随组删除软删）
                groupRepository.findByGroupNameAndIsDeleted(name, GlobalConstant.DELETED_YES)
                        .ifPresent(this::purgeTombstone);
            }
            group.setGroupName(name);
        }
        if (description != null) {
            group.setDescription(normalizeDescription(description));
        }
        if (status != null) {
            group.setStatus(status == 0 ? 0 : 1);
        }
        group = groupRepository.save(group);
        return toGroupVO(group, countAliveMembersByGroup(List.of(id)).getOrDefault(id, 0L));
    }

    /** 删除成员组（软删，连带软删全部成员关系）。 */
    @Transactional
    public void delete(Long id) {
        SysMemberGroup group = requireGroup(id);
        memberRepository.softDeleteByGroupId(id);
        group.setIsDeleted(GlobalConstant.DELETED_YES);
        groupRepository.save(group);
    }

    // ================= 组成员管理 =================

    /** 组成员分页（keyword 匹配用户名/昵称；按加入时间倒序）。 */
    public PageResult<GroupMemberVO> listMembers(Long groupId, int page, int size, String keyword) {
        requireGroup(groupId);
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        String kw = keyword != null && !keyword.isBlank() ? keyword.trim() : null;

        List<SysMemberGroupMember> links = memberRepository.findByGroupIdAndIsDeleted(groupId, GlobalConstant.DELETED_NO)
                .stream()
                .sorted(Comparator.comparing(SysMemberGroupMember::getId).reversed())
                .toList();

        Set<Long> aliveUserIds = aliveUserIds(links.stream().map(SysMemberGroupMember::getUserId).toList());
        Map<Long, SysUser> users = userRepository.findAllById(aliveUserIds).stream()
                .collect(Collectors.toMap(SysUser::getId, Function.identity()));

        // 组织 / 岗位展示名批量映射
        Set<Long> orgIds = users.values().stream().map(SysUser::getOrgId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> postIds = users.values().stream().map(SysUser::getPostId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> orgNames = organizationRepository.findAllById(orgIds).stream()
                .filter(o -> o.getIsDeleted() == GlobalConstant.DELETED_NO)
                .collect(Collectors.toMap(SysOrganization::getId, SysOrganization::getOrgName));
        Map<Long, String> postNames = postRepository.findAllById(postIds).stream()
                .filter(p -> p.getIsDeleted() == GlobalConstant.DELETED_NO)
                .collect(Collectors.toMap(SysPost::getId, SysPost::getPostName));

        List<GroupMemberVO> joined = links.stream()
                .filter(m -> aliveUserIds.contains(m.getUserId()))
                .map(m -> {
                    SysUser u = users.get(m.getUserId());
                    return new GroupMemberVO(
                            u.getId(),
                            u.getUsername(),
                            u.getNickname(),
                            u.getOrgId() != null ? orgNames.get(u.getOrgId()) : null,
                            u.getPostId() != null ? postNames.get(u.getPostId()) : null,
                            GroupMemberVO.SOURCE_MANUAL,
                            GroupMemberVO.SOURCE_MANUAL_LABEL,
                            m.getCreatedAt());
                })
                .filter(v -> kw == null
                        || contains(v.username(), kw)
                        || contains(v.nickname(), kw))
                .toList();

        int from = Math.min((safePage - 1) * safeSize, joined.size());
        int to = Math.min(from + safeSize, joined.size());
        return new PageResult<>(joined.size(), safePage, safeSize, joined.subList(from, to));
    }

    /** 批量添加成员（已在本组的有效关系跳过；曾移除的复活）。 */
    @Transactional
    public void addMembers(Long groupId, List<Long> userIds) {
        requireGroup(groupId);
        List<Long> requested = normalizeUserIds(userIds);
        if (requested.isEmpty()) {
            throw new BusinessException(400, "请选择要添加的成员");
        }
        List<SysUser> users = userRepository.findAllById(requested).stream()
                .filter(u -> u.getIsDeleted() == GlobalConstant.DELETED_NO)
                .toList();
        if (users.size() != requested.size()) {
            throw new BusinessException(400, "部分用户不存在或已删除，无法添加");
        }

        Map<Long, SysMemberGroupMember> existing = memberRepository
                .findByGroupIdAndUserIdIn(groupId, requested).stream()
                .collect(Collectors.toMap(SysMemberGroupMember::getUserId, Function.identity()));

        for (Long userId : requested) {
            SysMemberGroupMember link = existing.get(userId);
            if (link == null) {
                SysMemberGroupMember created = new SysMemberGroupMember();
                created.setGroupId(groupId);
                created.setUserId(userId);
                memberRepository.save(created);
            } else if (link.getIsDeleted() == GlobalConstant.DELETED_YES) {
                link.setIsDeleted(GlobalConstant.DELETED_NO);
                link.setUpdatedAt(java.time.LocalDateTime.now());
                memberRepository.save(link);
            }
            // 已在本组的有效关系：幂等跳过
        }
    }

    /** 批量移除成员（仅移除有效关系）。 */
    @Transactional
    public void removeMembers(Long groupId, List<Long> userIds) {
        requireGroup(groupId);
        List<Long> requested = normalizeUserIds(userIds);
        if (requested.isEmpty()) {
            return;
        }
        List<Long> linkIds = memberRepository
                .findByGroupIdAndUserIdInAndIsDeleted(groupId, requested, GlobalConstant.DELETED_NO)
                .stream()
                .map(SysMemberGroupMember::getId)
                .toList();
        if (!linkIds.isEmpty()) {
            memberRepository.softDeleteByIds(linkIds);
        }
    }

    // ================= 内部工具 =================

    private SysMemberGroup requireGroup(Long id) {
        return groupRepository.findByIdAndIsDeleted(id, GlobalConstant.DELETED_NO)
                .orElseThrow(() -> new BusinessException(400, "成员组不存在或已删除"));
    }

    private String requireValidName(String groupName) {
        if (groupName == null || groupName.isBlank()) {
            throw new BusinessException(400, "成员组名称不能为空");
        }
        return groupName.trim();
    }

    private void requireNameAvailable(String name, Long excludeId) {
        if (groupRepository.countByNameExcluding(name, excludeId) > 0) {
            throw new BusinessException(400, "成员组名称已存在: " + name);
        }
    }

    private String normalizeDescription(String description) {
        if (description == null) {
            return null;
        }
        String trimmed = description.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** 物理清除软删墓碑组（含其成员关系行；仅用于同名唯一键让位）。 */
    private void purgeTombstone(SysMemberGroup tombstone) {
        memberRepository.deleteByGroupId(tombstone.getId());
        groupRepository.delete(tombstone);
    }

    private List<Long> normalizeUserIds(List<Long> userIds) {
        if (userIds == null) {
            return List.of();
        }
        return userIds.stream().filter(Objects::nonNull).distinct().toList();
    }

    private Set<Long> aliveUserIds(Collection<Long> userIds) {
        if (userIds.isEmpty()) {
            return Set.of();
        }
        return userRepository.findAllById(userIds).stream()
                .filter(u -> u.getIsDeleted() == GlobalConstant.DELETED_NO)
                .map(SysUser::getId)
                .collect(Collectors.toSet());
    }

    /** 批量统计多个组的有效成员数（已删用户的关系不计入）。 */
    private Map<Long, Long> countAliveMembersByGroup(Collection<Long> groupIds) {
        if (groupIds.isEmpty()) {
            return Map.of();
        }
        List<SysMemberGroupMember> links = memberRepository
                .findByGroupIdInAndIsDeleted(groupIds, GlobalConstant.DELETED_NO);
        if (links.isEmpty()) {
            return Map.of();
        }
        Set<Long> aliveUserIds = aliveUserIds(links.stream().map(SysMemberGroupMember::getUserId).toList());
        Map<Long, Long> counts = new LinkedHashMap<>();
        for (SysMemberGroupMember link : links) {
            if (aliveUserIds.contains(link.getUserId())) {
                counts.merge(link.getGroupId(), 1L, Long::sum);
            }
        }
        return counts;
    }

    private MemberGroupVO toGroupVO(SysMemberGroup group, long memberCount) {
        return new MemberGroupVO(
                group.getId(),
                group.getGroupName(),
                group.getDescription(),
                group.getStatus(),
                memberCount,
                group.getCreatedAt());
    }

    private boolean contains(String value, String keyword) {
        return value != null && value.contains(keyword);
    }
}
