package com.workflow.system.service;

import com.workflow.common.domain.PageResult;
import com.workflow.system.domain.dto.ChannelUpsertRequest;
import com.workflow.system.domain.dto.ClientCreateRequest;
import com.workflow.system.domain.dto.ClientQueryRequest;
import com.workflow.system.domain.dto.ClientUpdateRequest;
import com.workflow.system.domain.vo.ChannelTestVO;
import com.workflow.system.domain.vo.ClientChannelVO;
import com.workflow.system.domain.vo.ClientOptionVO;
import com.workflow.system.domain.vo.ClientVO;

import java.util.List;

/**
 * 客户端业务服务（J2，移植 backend-node system/service/client.service.ts）。
 *
 * <h3>secret 边界约定（务必遵守）</h3>
 * <ul>
 *   <li>加密只发生在这里：{@code upsertChannel} 写库前 {@link com.workflow.framework.security.ClientCrypto#encrypt}；
 *       内部使用处 decrypt。</li>
 *   <li>repository 不碰加解密；任何<b>读出口</b>（listPage / options / upsertChannel 回显）
 *       的 config.secret 一律替换为掩码 {@code '******'}，config_json 原文绝不出 API。</li>
 * </ul>
 */
public interface ClientService {

    PageResult<ClientVO> listPage(ClientQueryRequest query);

    List<ClientOptionVO> options();

    ClientVO create(ClientCreateRequest request);

    ClientVO update(Long id, ClientUpdateRequest request);

    void setStatus(Long id, Integer status);

    ClientChannelVO upsertChannel(Long clientId, ChannelUpsertRequest request);

    ChannelTestVO testChannel(Long clientId, String channelType);
}
