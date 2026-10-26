package com.workflow.system.controller;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.system.domain.dto.ChannelUpsertRequest;
import com.workflow.system.domain.dto.ClientCreateRequest;
import com.workflow.system.domain.dto.ClientQueryRequest;
import com.workflow.system.domain.dto.ClientStatusRequest;
import com.workflow.system.domain.dto.ClientUpdateRequest;
import com.workflow.system.domain.vo.ChannelTestVO;
import com.workflow.system.domain.vo.ClientChannelVO;
import com.workflow.system.domain.vo.ClientOptionVO;
import com.workflow.system.domain.vo.ClientVO;
import com.workflow.system.service.ClientService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口（J2，路径/动词/形状逐一对齐 node client.controller 与前端 A1/A2 契约）。
 *
 * <p>⚠️ 分页形状是 PageResult{total,page,size,rows}（系统管理惯例，不是流程模块的 PageResponse）。
 * ⚠️ GET /options 是字面量路由，Spring 优先于 /{id} 模式匹配（无 node 路由顺序陷阱）。
 */
@RestController
@RequestMapping("/api/clients")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @GetMapping
    public R<PageResult<ClientVO>> list(
            @RequestParam(name = "page", required = false, defaultValue = "1") Integer page,
            @RequestParam(name = "size", required = false, defaultValue = "20") Integer size,
            @RequestParam(name = "keyword", required = false) String keyword,
            @RequestParam(name = "status", required = false) Integer status) {
        return R.ok(clientService.listPage(new ClientQueryRequest(keyword, status, page, size)));
    }

    @GetMapping("/options")
    public R<List<ClientOptionVO>> options() {
        return R.ok(clientService.options());
    }

    @PostMapping
    public R<ClientVO> create(@Valid @RequestBody ClientCreateRequest request) {
        return R.ok(clientService.create(request));
    }

    @PutMapping("/{id}")
    public R<ClientVO> update(@PathVariable Long id, @Valid @RequestBody ClientUpdateRequest request) {
        return R.ok(clientService.update(id, request));
    }

    /** 改状态。portal(id=1) 停用由 service 拒绝。 */
    @PutMapping("/{id}/status")
    public R<Void> setStatus(@PathVariable Long id, @Valid @RequestBody ClientStatusRequest request) {
        clientService.setStatus(id, request.status());
        return R.ok();
    }

    /** 渠道开通/更新（channelType 走 body；非法类型与 MP 必填由 service 校验）。 */
    @PutMapping("/{id}/channels")
    public R<ClientChannelVO> upsertChannel(@PathVariable Long id, @Valid @RequestBody ChannelUpsertRequest request) {
        return R.ok(clientService.upsertChannel(id, request));
    }

    /** 渠道连通测试。 */
    @PostMapping("/{id}/channels/{type}/test")
    public R<ChannelTestVO> testChannel(@PathVariable Long id, @PathVariable String type) {
        return R.ok(clientService.testChannel(id, type));
    }
}
