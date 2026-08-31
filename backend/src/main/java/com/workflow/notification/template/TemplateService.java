package com.workflow.notification.template;

import com.workflow.common.exception.BusinessException;
import com.workflow.notification.model.MessageTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 模板服务
 */
@Service
public class TemplateService {

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    private final MessageTemplateRepository templateRepository;

    public TemplateService(MessageTemplateRepository templateRepository) {
        this.templateRepository = templateRepository;
    }

    /**
     * 根据模板代码和租户ID获取模板
     */
    public MessageTemplate getTemplate(String templateCode, String tenantId) {
        return templateRepository.findByTemplateCodeAndTenantId(templateCode, tenantId)
                .orElseThrow(() -> new BusinessException("模板不存在: " + templateCode));
    }

    /**
     * 渲染模板内容，替换变量
     */
    public String render(String template, Map<String, Object> variables) {
        if (template == null || variables == null) return template;

        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String varName = matcher.group(1);
            Object value = variables.get(varName);
            matcher.appendReplacement(sb, value != null ? Matcher.quoteReplacement(value.toString()) : "");
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * 校验模板变量必填性
     */
    public void validateVariables(String template, Map<String, Object> variables) {
        if (template == null) return;

        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        while (matcher.find()) {
            String varName = matcher.group(1);
            if (!variables.containsKey(varName) || variables.get(varName) == null) {
                throw new BusinessException("缺少必填变量: " + varName);
            }
        }
    }

    /**
     * 创建模板
     */
    @Transactional
    public MessageTemplate create(MessageTemplate template) {
        if (templateRepository.existsByTemplateCodeAndTenantId(template.getTemplateCode(), template.getTenantId())) {
            throw new BusinessException("模板代码已存在: " + template.getTemplateCode());
        }
        return templateRepository.save(template);
    }

    /**
     * 更新模板
     */
    @Transactional
    public MessageTemplate update(Long id, MessageTemplate updated) {
        MessageTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new BusinessException("模板不存在"));
        existing.setName(updated.getName());
        existing.setTitle(updated.getTitle());
        existing.setContent(updated.getContent());
        existing.setPriority(updated.getPriority());
        existing.setCategory(updated.getCategory());
        return templateRepository.save(existing);
    }

    /**
     * 启用/停用模板
     */
    @Transactional
    public void toggle(Long id) {
        // 模板无 status 字段，此方法为占位
    }

    /**
     * 获取模板列表
     */
    public List<MessageTemplate> list(String tenantId) {
        return templateRepository.findAll();
    }
}
