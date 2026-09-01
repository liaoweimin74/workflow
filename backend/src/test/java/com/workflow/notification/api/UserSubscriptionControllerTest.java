package com.workflow.notification.api;

import com.workflow.common.domain.R;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.UserSubscription;
import com.workflow.notification.subscription.SubscriptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 用户端订阅偏好 API 测试
 */
class UserSubscriptionControllerTest {

    private SubscriptionService subscriptionService;
    private TenantProvider tenantProvider;
    private UserSubscriptionController controller;

    @BeforeEach
    void setUp() {
        subscriptionService = mock(SubscriptionService.class);
        tenantProvider = mock(TenantProvider.class);
        when(tenantProvider.getTenantId()).thenReturn("default");
        controller = new UserSubscriptionController(subscriptionService, tenantProvider);

        // 默认登录用户 100
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new LoginUser(100L, "user100", "x", List.of(), Set.of(), true),
                        null));
    }

    @Test
    void list_returns_all_channels_default_subscribed() {
        // 无任何偏好记录 → 所有渠道默认订阅 true
        when(subscriptionService.getUserPreferences("default", 100L)).thenReturn(List.of());

        R<List<Map<String, Object>>> res = controller.list();

        assertThat(res.getCode()).isEqualTo(200);
        assertThat(res.getData()).hasSize(ChannelType.values().length);
        assertThat(res.getData()).allMatch(row -> Boolean.TRUE.equals(row.get("subscribed")));
    }

    @Test
    void list_reflects_user_unsubscribed_channel() {
        UserSubscription smsPref = new UserSubscription();
        smsPref.setChannel(ChannelType.SMS);
        smsPref.setSubscribed(false);
        when(subscriptionService.getUserPreferences("default", 100L)).thenReturn(List.of(smsPref));

        R<List<Map<String, Object>>> res = controller.list();

        Map<String, Object> sms = res.getData().stream()
                .filter(row -> "SMS".equals(row.get("channel")))
                .findFirst().orElseThrow();
        assertThat(sms.get("subscribed")).isEqualTo(false);
        // 其余渠道默认 true
        assertThat(res.getData().stream()
                .filter(row -> !"SMS".equals(row.get("channel")))
                .allMatch(row -> Boolean.TRUE.equals(row.get("subscribed")))).isTrue();
    }

    @Test
    void update_applies_preferences_per_channel() {
        R<Void> res = controller.update(List.of(
                Map.of("channel", "SMS", "subscribed", false),
                Map.of("channel", "IN_APP", "subscribed", true)));

        assertThat(res.getCode()).isEqualTo(200);
        verify(subscriptionService).updatePreference("default", 100L, ChannelType.SMS, false);
        verify(subscriptionService).updatePreference("default", 100L, ChannelType.IN_APP, true);
    }

    @Test
    void update_ignores_invalid_channel_without_breaking_batch() {
        R<Void> res = controller.update(List.of(
                Map.of("channel", "NOT_A_CHANNEL", "subscribed", true),
                Map.of("channel", "WECHAT_WORK", "subscribed", false)));

        assertThat(res.getCode()).isEqualTo(200);
        verify(subscriptionService).updatePreference("default", 100L, ChannelType.WECHAT_WORK, false);
        verify(subscriptionService, never()).updatePreference(eq("default"), eq(100L), eq(ChannelType.SMS), anyBoolean());
    }

    @Test
    void update_skips_items_missing_fields() {
        R<Void> res = controller.update(List.of(Map.of("channel", "SMS")));

        assertThat(res.getCode()).isEqualTo(200);
        verify(subscriptionService, never()).updatePreference(any(), any(), any(), anyBoolean());
    }
}
