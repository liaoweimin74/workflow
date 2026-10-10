package com.workflow.engine.logicflow.listener;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.logicflow.service.FormLogicBindingService;
import com.workflow.engine.logicflow.service.WorkflowLogicTriggerService;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEventType;
import org.flowable.common.engine.api.delegate.event.FlowableEntityEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEventListener;
import org.flowable.engine.delegate.event.FlowableCancelledEvent;
import org.flowable.engine.delegate.event.FlowableProcessStartedEvent;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanCurrentlyInCreationException;

import java.util.Map;
import java.util.function.Supplier;

/**
 * Flowable 全局事件监听器：工作流生命周期事件 → 表单×逻辑编排绑定触发。
 *
 * <p>映射（formhook-v2 #5 触发点扩展）：
 * <ul>
 *   <li>{@code PROCESS_STARTED} → AFTER_PROCESS_START（流程级，派发全部引用表单）；</li>
 *   <li>{@code TASK_CREATED} → TASK_CREATE（任务级；自动通过的发起任务同样触发）；</li>
 *   <li>{@code PROCESS_COMPLETED} → PROCESS_COMPLETE（流程级）；</li>
 *   <li>{@code PROCESS_CANCELLED} → PROCESS_CANCEL（流程级；refuse/超时拒绝/手动终止
 *       走 deleteProcessInstance 亦落到此事件，cause 写入触发变量）。</li>
 * </ul>
 *
 * <p>注册于 {@code FlowableEngineConfig}；以 {@link Supplier} 懒解析
 * {@link WorkflowLogicTriggerService}，避免引擎装配期循环依赖。
 *
 * <p>异常语义：SYNC_IN_TX 绑定的业务失败（{@link BusinessException}）原样抛出 →
 * isFailOnException=true → Flowable 中止当前命令并回滚（强一致）；
 * 其余基础设施异常仅记日志不阻断引擎流转。
 */
public class WorkflowLogicTriggerListener implements FlowableEventListener {

    private static final Logger log = LoggerFactory.getLogger(WorkflowLogicTriggerListener.class);

    private final Supplier<WorkflowLogicTriggerService> serviceProvider;

    public WorkflowLogicTriggerListener(Supplier<WorkflowLogicTriggerService> serviceProvider) {
        this.serviceProvider = serviceProvider;
    }

    @Override
    public void onEvent(FlowableEvent event) {
        if (event == null || event.getType() == null) {
            return;
        }
        WorkflowLogicTriggerService service;
        try {
            service = serviceProvider.get();
        } catch (BeanCurrentlyInCreationException e) {
            // 引擎启动期事件（自动部署等）：触发服务尚未就绪且此刻无业务实例，跳过；
            // 若在此刻 getBean 会把服务拖进引擎构建链 → 装配环
            log.warn("WorkflowLogicTriggerService not ready (engine starting), skip event {}", event.getType());
            return;
        }
        if (service == null) {
            // 提供者未就绪（理论不发生）；跳过避免引擎卡死
            log.warn("WorkflowLogicTriggerService unavailable, skip event {}", event.getType());
            return;
        }
        try {
            dispatch(event, service);
        } catch (BusinessException e) {
            // SYNC_IN_TX 语义：绑定流失败 → 中止当前命令并回滚主操作
            throw e;
        } catch (Exception e) {
            // 基础设施异常不阻断引擎流转（绑定流自身的业务失败已在 dispatch 内包装为 BusinessException）
            log.error("WorkflowLogicTriggerListener failed to handle event {}: {}",
                    event.getType(), e.getMessage(), e);
        }
    }

    private void dispatch(FlowableEvent event, WorkflowLogicTriggerService service) {
        FlowableEngineEventType type = (FlowableEngineEventType) event.getType();
        switch (type) {
            case PROCESS_STARTED -> {
                if (event instanceof FlowableProcessStartedEvent pi) {
                    FlowableEngineEvent engineEvent = (FlowableEngineEvent) pi;
                    service.fireProcessEvent(null,
                            FormLogicBindingService.TRIG_AFTER_PROCESS_START,
                            engineEvent.getProcessDefinitionId(), engineEvent.getProcessInstanceId(), null);
                }
            }
            case TASK_CREATED -> {
                if (event instanceof FlowableEntityEvent ee && ee.getEntity() instanceof Task task) {
                    service.fireTaskEvent(null,
                            FormLogicBindingService.TRIG_TASK_CREATE, task, null);
                }
            }
            case PROCESS_COMPLETED -> {
                if (event instanceof FlowableEngineEvent pe) {
                    service.fireProcessEvent(null,
                            FormLogicBindingService.TRIG_PROCESS_COMPLETE,
                            pe.getProcessDefinitionId(), pe.getProcessInstanceId(), null);
                }
            }
            case PROCESS_CANCELLED -> {
                if (event instanceof FlowableEngineEvent ce) {
                    service.fireProcessEvent(null,
                            FormLogicBindingService.TRIG_PROCESS_CANCEL,
                            ce.getProcessDefinitionId(), ce.getProcessInstanceId(),
                            ce instanceof FlowableCancelledEvent cancelled
                                    ? Map.of("cause", String.valueOf(cancelled.getCause()))
                                    : null);
                }
            }
            default -> {
                // 其余事件不关心
            }
        }
    }

    /** 业务异常须中止命令（回滚）；返回 true 由 Flowable 决定是否向上传播。 */
    @Override
    public boolean isFailOnException() {
        return true;
    }

    @Override
    public boolean isFireOnTransactionLifecycleEvent() {
        return false;
    }

    @Override
    public String getOnTransaction() {
        return null;
    }
}
