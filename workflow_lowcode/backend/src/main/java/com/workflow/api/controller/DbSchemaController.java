package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 数据库结构只读端点（SQL 数据源可视化配置用）。
 * <p>
 * 提供当前库全部基础表名与按表名的真实字段列表（information_schema），
 * 供 SQL 数据源可视化配置（主表/JOIN 目标表/字段下拉）对齐数据库真实结构，
 * 替代原先「已发布业务表单白名单 + 表单 columnConfig」的受限来源。
 * 表名入参经 JdbcTemplate 参数绑定，无注入风险。
 */
@RestController
@RequestMapping("/api/v1/data-sources/db")
public class DbSchemaController {

    /** Flyway 迁移历史表（建表框架自动创建，不属于业务表，列表排除） */
    private static final String FLYWAY_HISTORY_TABLE = "flyway_schema_history";

    private final DynamicTableManager tableManager;

    public DbSchemaController(DynamicTableManager tableManager) {
        this.tableManager = tableManager;
    }

    /**
     * 当前库全部基础表名（排除 Flyway 迁移历史表）。
     */
    @GetMapping("/tables")
    public R<List<String>> tables() {
        List<String> names = tableManager.listTableNames().stream()
                .filter(name -> !FLYWAY_HISTORY_TABLE.equalsIgnoreCase(name))
                .toList();
        return R.ok(names);
    }

    /**
     * 按表名列举真实字段（information_schema.COLUMNS；表不存在返回空列表）。
     */
    @GetMapping("/tables/{table}/columns")
    public R<List<ColumnInfo>> columns(@PathVariable String table) {
        return R.ok(tableManager.findTableColumns(table));
    }
}