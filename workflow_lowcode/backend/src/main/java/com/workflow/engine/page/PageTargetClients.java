package com.workflow.engine.page;

import com.workflow.system.domain.entity.SysClient;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 发布目标端（A5）CSV 口径的唯一实现：wf_page_def.target_clients 存
 * sys_client.id 升序去重逗号分隔（"1,2"）。
 *
 * <p>NULL/空白 = 存量行缺省仅 portal(1)——publish 缺省写入与 PageAccessGuard
 * 非 portal 端闸两侧共用此处解读，杜绝口径漂移。
 */
final class PageTargetClients {

    private PageTargetClients() {
    }

    /** 归一：null/空 → [portal(1)]；否则去重升序。 */
    static List<Long> normalize(List<Long> clientIds) {
        if (clientIds == null || clientIds.isEmpty()) {
            return List.of(SysClient.PORTAL_CLIENT_ID);
        }
        return clientIds.stream().distinct().sorted().collect(Collectors.toList());
    }

    static String toCsv(List<Long> targets) {
        return targets.stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    /** 目标端集合是否覆盖 clientId：NULL/空白行按缺省仅 portal(1) 解读。 */
    static boolean contains(String targetClients, long clientId) {
        if (targetClients == null || targetClients.isBlank()) {
            return clientId == SysClient.PORTAL_CLIENT_ID;
        }
        return Arrays.stream(targetClients.split(","))
                .map(String::trim)
                .anyMatch(part -> part.equals(String.valueOf(clientId)));
    }
}
