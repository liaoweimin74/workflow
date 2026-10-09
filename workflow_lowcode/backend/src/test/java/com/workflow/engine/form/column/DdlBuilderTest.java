package com.workflow.engine.form.column;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * DdlBuilder 单元测试：CREATE/ALTER 语句生成与白名单校验。
 */
class DdlBuilderTest {

    private ColumnConfig column(String key, String type, Integer length, boolean required) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType(type);
        c.setLength(length);
        c.setRequired(required);
        return c;
    }

    @Test
    void buildCreateTable_generatesValidSql() {
        ColumnConfig name = column("name", "VARCHAR", 255, true);
        name.setLabel("姓名");
        ColumnConfig amount = column("amount", "DECIMAL", 18, true);
        amount.setScale(2);

        String sql = DdlBuilder.buildCreateTable("biz_leave", List.of(name, amount));

        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS wf_biz_biz_leave");
        assertThat(sql).contains("name VARCHAR(255) NOT NULL");
        assertThat(sql).contains("amount DECIMAL(18,2) NOT NULL");
        assertThat(sql).contains("tenant_id VARCHAR(64) NOT NULL");
        assertThat(sql).contains("version INT");
        assertThat(sql).contains("id VARCHAR(64)");
        assertThat(sql).contains("PRIMARY KEY");
    }

    @Test
    void buildCreateTable_uniqueColumn_generatesUniqueIndex() {
        ColumnConfig code = column("code", "VARCHAR", 64, false);
        code.setUnique(true);

        String sql = DdlBuilder.buildCreateTable("biz_leave", List.of(code));

        assertThat(sql).contains("UNIQUE KEY uk_biz_leave_code (tenant_id, code)");
    }

    @Test
    void buildCreateTable_indexedColumn_generatesIndex() {
        ColumnConfig dept = column("dept", "VARCHAR", 64, false);
        dept.setIndexed(true);

        String sql = DdlBuilder.buildCreateTable("biz_leave", List.of(dept));

        assertThat(sql).contains("INDEX idx_biz_leave_dept (dept)");
    }

    @Test
    void buildAlter_addsColumn_whenMissing() {
        ColumnConfig dept = column("dept", "VARCHAR", 64, false);

        List<String> stmts = DdlBuilder.buildAlterStatements("biz_leave", List.of(dept), List.of());

        assertThat(stmts).anyMatch(s -> s.contains("ADD COLUMN dept VARCHAR(64)"));
    }

    @Test
    void buildAlter_modifiesColumn_whenWidened() {
        ColumnConfig dept = column("dept", "VARCHAR", 128, false);
        ColumnInfo existing = new ColumnInfo("dept", "VARCHAR", 64, null, true, false);

        List<String> stmts = DdlBuilder.buildAlterStatements("biz_leave", List.of(dept), List.of(existing));

        assertThat(stmts).anyMatch(s -> s.contains("MODIFY COLUMN dept VARCHAR(128)"));
    }

    @Test
    void buildAlter_narrowingColumn_rejected() {
        ColumnConfig dept = column("dept", "VARCHAR", 32, false);
        ColumnInfo existing = new ColumnInfo("dept", "VARCHAR", 64, null, true, false);

        assertThatThrownBy(() -> DdlBuilder.buildAlterStatements("biz_leave", List.of(dept), List.of(existing)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缩短");
    }

    @Test
    void buildAlter_dropsColumn_neverGenerated() {
        ColumnInfo old = new ColumnInfo("oldField", "VARCHAR", 255, null, true, false);

        List<String> stmts = DdlBuilder.buildAlterStatements("biz_leave", List.of(), List.of(old));

        assertThat(stmts).noneMatch(s -> s.contains("DROP"));
    }

    @Test
    void buildAlter_sameColumn_noStatement() {
        ColumnConfig dept = column("dept", "VARCHAR", 64, false);
        ColumnInfo existing = new ColumnInfo("dept", "VARCHAR", 64, null, true, false);

        List<String> stmts = DdlBuilder.buildAlterStatements("biz_leave", List.of(dept), List.of(existing));

        assertThat(stmts).isEmpty();
    }

    @Test
    void buildAlter_crossTypeChange_rejected() {
        ColumnConfig dept = column("dept", "DECIMAL", 18, false);
        ColumnInfo existing = new ColumnInfo("dept", "VARCHAR", 64, null, true, false);

        assertThatThrownBy(() -> DdlBuilder.buildAlterStatements("biz_leave", List.of(dept), List.of(existing)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("跨类变更");
    }

    @Test
    void invalidColumnKey_rejected() {
        ColumnConfig bad = new ColumnConfig();
        bad.setKey("bad name!");
        bad.setColumnType("VARCHAR");
        bad.setLength(255);

        assertThatThrownBy(() -> DdlBuilder.buildCreateTable("biz_x", List.of(bad)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void reservedColumnKey_rejected() {
        ColumnConfig bad = new ColumnConfig();
        bad.setKey("tenant_id");
        bad.setColumnType("VARCHAR");
        bad.setLength(255);

        assertThatThrownBy(() -> DdlBuilder.buildCreateTable("biz_x", List.of(bad)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalidFormKey_rejected() {
        assertThatThrownBy(() -> DdlBuilder.buildCreateTable("biz bad name", List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void longtextColumnDefinition() {
        ColumnConfig c = new ColumnConfig();
        c.setKey("sign");
        c.setColumnType("LONGTEXT");

        String sql = DdlBuilder.buildCreateTable("f1", List.of(c));

        assertThat(sql).contains("sign LONGTEXT");
    }

    @Test
    void invalidColumnType_rejected() {
        ColumnConfig bad = new ColumnConfig();
        bad.setKey("foo");
        bad.setColumnType("BLOB");

        assertThatThrownBy(() -> DdlBuilder.buildCreateTable("biz_x", List.of(bad)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ==================== 子表 ====================

    @Test
    void buildCreateSubTable_includesFixedAndBizColumns() {
        ColumnConfig amount = column("amount", "DECIMAL", 18, false);
        amount.setScale(2);

        String sql = DdlBuilder.buildCreateSubTable("expense", "items", List.of(amount));

        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS wf_biz_expense_items");
        assertThat(sql).contains("id VARCHAR(64) NOT NULL");
        assertThat(sql).contains("biz_id VARCHAR(64) NOT NULL");
        assertThat(sql).contains("tenant_id VARCHAR(64) NOT NULL");
        assertThat(sql).contains("sort_no INT NOT NULL DEFAULT 0");
        assertThat(sql).contains("amount DECIMAL(18,2)");
        assertThat(sql).contains("PRIMARY KEY (id)");
        assertThat(sql).contains("(tenant_id, biz_id)");
    }

    @Test
    void buildCreateSubTable_rejectsInvalidField() {
        assertThatThrownBy(() -> DdlBuilder.buildCreateSubTable("expense", "bad field", List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void buildCreateSubTable_rejectsReservedColumn() {
        ColumnConfig bad = new ColumnConfig();
        bad.setKey("biz_id");
        bad.setColumnType("VARCHAR");
        bad.setLength(64);

        assertThatThrownBy(() -> DdlBuilder.buildCreateSubTable("expense", "items", List.of(bad)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void buildAlterSubTable_addsColumnOnly() {
        ColumnConfig amount = column("amount", "DECIMAL", 18, false);
        amount.setScale(2);
        ColumnInfo existing = new ColumnInfo("name", "VARCHAR", true, false);

        List<String> stmts = DdlBuilder.buildAlterSubTable("expense", "items", List.of(amount), List.of(existing));

        assertThat(stmts).contains("ALTER TABLE wf_biz_expense_items ADD COLUMN amount DECIMAL(18,2)");
        assertThat(stmts).noneMatch(s -> s.contains("DROP"));
    }

    @Test
    void buildAlterSubTable_sameColumn_noStatement() {
        ColumnConfig amount = column("amount", "DECIMAL", 18, false);
        amount.setScale(2);
        ColumnInfo existing = new ColumnInfo("amount", "DECIMAL", 18, 2, true, false);

        List<String> stmts = DdlBuilder.buildAlterSubTable("expense", "items", List.of(amount), List.of(existing));

        assertThat(stmts).isEmpty();
    }

    @Test
    void buildAlterSubTable_crossTypeChange_rejected() {
        ColumnConfig amount = column("amount", "INT", null, false);
        ColumnInfo existing = new ColumnInfo("amount", "DECIMAL", 18, 2, true, false);

        assertThatThrownBy(() -> DdlBuilder.buildAlterSubTable("expense", "items", List.of(amount), List.of(existing)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("跨类变更");
    }

    @Test
    void buildAlterSubTable_narrowing_rejected() {
        ColumnConfig name = column("name", "VARCHAR", 32, false);
        ColumnInfo existing = new ColumnInfo("name", "VARCHAR", 64, null, true, false);

        assertThatThrownBy(() -> DdlBuilder.buildAlterSubTable("expense", "items", List.of(name), List.of(existing)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缩短");
    }

    @Test
    void validateSubField_rejectsInvalid() {
        assertThatThrownBy(() -> DdlBuilder.validateSubField("bad field"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DdlBuilder.validateSubField("1abc"))
                .isInstanceOf(IllegalArgumentException.class);
        DdlBuilder.validateSubField("items_2"); // 合法不抛错
    }

    // ==================== 主表构建跳过子表占位字段 ====================

    private ColumnConfig subtableField(String key, ColumnConfig... subs) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setSubColumns(List.of(subs));
        c.setSubMode("embedded");
        return c;
    }

    @Test
    void buildCreateTable_skipsSubtablePlaceholder() {
        ColumnConfig items = subtableField("items", column("itemName", "VARCHAR", 255, false));
        ColumnConfig title = column("title", "VARCHAR", 255, false);

        String sql = DdlBuilder.buildCreateTable("expense", List.of(title, items));

        assertThat(sql).contains("title VARCHAR(255)");
        assertThat(sql).doesNotContain("items VARCHAR");
        assertThat(sql).doesNotContain("itemName");
    }

    @Test
    void buildCreateTable_subtablePlaceholder_withoutOwnType_doesNotReject() {
        // 子表占位字段自身无 columnType（空），主表构建应跳过而非报"非法列类型"
        ColumnConfig items = subtableField("items", column("itemName", "VARCHAR", 255, false));

        String sql = DdlBuilder.buildCreateTable("expense", List.of(items));

        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS wf_biz_expense");
        assertThat(sql).doesNotContain("items ");
    }

    @Test
    void buildCreateTable_onlySubtableColumns_rejectsEmpty() {
        // 主表没有任何真实业务列时仍应成功建表（固定列兜底），子表占位字段不生成列定义
        ColumnConfig items = subtableField("items", column("itemName", "VARCHAR", 255, false));

        String sql = DdlBuilder.buildCreateTable("expense", List.of(items));

        assertThat(sql).contains("PRIMARY KEY (id)");
        assertThat(sql).doesNotContain("itemName");
    }

    @Test
    void buildAlterStatements_skipsSubtablePlaceholder() {
        ColumnConfig items = subtableField("items", column("itemName", "VARCHAR", 255, false));
        ColumnConfig title = column("title", "VARCHAR", 255, false);

        List<String> stmts = DdlBuilder.buildAlterStatements("expense", List.of(title, items), List.of());

        assertThat(stmts).anyMatch(s -> s.contains("ADD COLUMN title VARCHAR(255)"));
        assertThat(stmts).noneMatch(s -> s.contains("items"));
    }
}
