package com.workflow.api.dto;

import com.workflow.engine.form.bizdata.JoinSqlGenerator.JoinConfig;
import java.util.List;

/** JOIN SQL 预览请求：主表单 key + 关联声明列表（alias 字段可省略，Jackson record 反序列化缺失字段为 null） */
public record JoinPreviewRequest(String formKey, List<JoinConfig> joins) {}