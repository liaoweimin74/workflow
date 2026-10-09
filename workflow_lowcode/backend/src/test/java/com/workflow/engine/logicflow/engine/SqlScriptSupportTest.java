package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SQL 批处理语句解析/编译纯单测：切分器（引号/注释感知）、类型识别、别名提取、
 * 占位符编译（{{var.path}} → ? 真绑定）、路径取值语义。
 */
class SqlScriptSupportTest {

    // ------------------------------------------------------------------
    // splitStatements：引号/注释感知切分
    // ------------------------------------------------------------------

    @Test
    void splitsBasicStatements() {
        List<String> out = SqlScriptSupport.splitStatements("UPDATE a SET x = 1; DELETE FROM b; SELECT 1");
        assertThat(out).hasSize(3);
        assertThat(out.get(0)).isEqualTo("UPDATE a SET x = 1");
        assertThat(out.get(2)).isEqualTo("SELECT 1");
    }

    @Test
    void keepsSemicolonInsideStringLiteral() {
        List<String> out = SqlScriptSupport.splitStatements("INSERT INTO t VALUES ('a;b');SELECT 1");
        assertThat(out).hasSize(2);
        assertThat(out.get(0)).isEqualTo("INSERT INTO t VALUES ('a;b')");
    }

    @Test
    void keepsSemicolonInsideEscapedLiteral() {
        // '' 双写转义 + 反斜杠转义内的 ; 均不切分
        List<String> out = SqlScriptSupport.splitStatements("INSERT INTO t VALUES ('it''s;a');SELECT 1");
        assertThat(out).hasSize(2);
        assertThat(out.get(0)).isEqualTo("INSERT INTO t VALUES ('it''s;a')");

        List<String> out2 = SqlScriptSupport.splitStatements("INSERT INTO t VALUES ('a\\;b');SELECT 1");
        assertThat(out2).hasSize(2);
    }

    @Test
    void keepsSemicolonInsideComments() {
        List<String> out = SqlScriptSupport.splitStatements("-- 注释;含分号\nSELECT 1; # 行注释;也含\nUPDATE t SET a=1");
        assertThat(out).hasSize(2);
        assertThat(out.get(0)).isEqualTo("-- 注释;含分号\nSELECT 1");
    }

    @Test
    void keepsSemicolonInsideBlockComment() {
        List<String> out = SqlScriptSupport.splitStatements("/* 开头;注释 */SELECT 1");
        assertThat(out).hasSize(1);
        assertThat(out.get(0)).isEqualTo("/* 开头;注释 */SELECT 1");
    }

    @Test
    void keepsSemicolonInsideBacktickIdentifier() {
        List<String> out = SqlScriptSupport.splitStatements("SELECT `a;b` FROM t;UPDATE x SET y=1");
        assertThat(out).hasSize(2);
    }

    @Test
    void dropsEmptyStatements() {
        List<String> out = SqlScriptSupport.splitStatements("SELECT 1;; ;  -- 只有注释\n; ");
        assertThat(out).containsExactly("SELECT 1");
    }

    @Test
    void rejectsUnterminatedQuoteAndComment() {
        assertThatThrownBy(() -> SqlScriptSupport.splitStatements("SELECT 'abc"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("未闭合");
        assertThatThrownBy(() -> SqlScriptSupport.splitStatements("SELECT 1 /* 未闭合"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("未闭合");
    }

    @Test
    void blankInputReturnsEmpty() {
        assertThat(SqlScriptSupport.splitStatements(null)).isEmpty();
        assertThat(SqlScriptSupport.splitStatements("   ")).isEmpty();
        assertThat(SqlScriptSupport.splitStatements("-- 只有注释\n")).isEmpty();
    }

    // ------------------------------------------------------------------
    // kindOf：类型白名单
    // ------------------------------------------------------------------

    @Test
    void classifiesQueryStatements() {
        assertThat(SqlScriptSupport.kindOf("SELECT * FROM t")).isEqualTo(SqlScriptSupport.Kind.QUERY);
        assertThat(SqlScriptSupport.kindOf("-- 查询\nSHOW TABLES")).isEqualTo(SqlScriptSupport.Kind.QUERY);
        assertThat(SqlScriptSupport.kindOf("desc wf_form_def")).isEqualTo(SqlScriptSupport.Kind.QUERY);
        assertThat(SqlScriptSupport.kindOf("WITH x AS (SELECT 1) SELECT * FROM x")).isEqualTo(SqlScriptSupport.Kind.QUERY);
        assertThat(SqlScriptSupport.kindOf("EXPLAIN SELECT 1")).isEqualTo(SqlScriptSupport.Kind.QUERY);
    }

    @Test
    void classifiesInsertAndDml() {
        assertThat(SqlScriptSupport.kindOf("INSERT INTO t VALUES (1)")).isEqualTo(SqlScriptSupport.Kind.INSERT);
        assertThat(SqlScriptSupport.kindOf("REPLACE INTO t VALUES (1)")).isEqualTo(SqlScriptSupport.Kind.INSERT);
        assertThat(SqlScriptSupport.kindOf("UPDATE t SET a=1")).isEqualTo(SqlScriptSupport.Kind.DML);
        assertThat(SqlScriptSupport.kindOf("DELETE FROM t")).isEqualTo(SqlScriptSupport.Kind.DML);
    }

    @Test
    void rejectsDdlAndAdminCommands() {
        assertThatThrownBy(() -> SqlScriptSupport.kindOf("DROP TABLE t"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("仅支持");
        assertThatThrownBy(() -> SqlScriptSupport.kindOf("CREATE TABLE t(id INT)"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SqlScriptSupport.kindOf("GRANT ALL ON *.* TO u"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ------------------------------------------------------------------
    // extractName：别名声明
    // ------------------------------------------------------------------

    @Test
    void extractsNameFromLeadingLineComment() {
        assertThat(SqlScriptSupport.extractName("-- name: upsert_user\nINSERT INTO t VALUES (1)"))
                .isEqualTo("upsert_user");
        assertThat(SqlScriptSupport.extractName("# name=abc\nUPDATE t SET a=1")).isEqualTo("abc");
        assertThat(SqlScriptSupport.extractName("-- 说明\n-- name: second\nSELECT 1")).isEqualTo("second");
    }

    @Test
    void returnsNullWhenNoNameDeclaration() {
        assertThat(SqlScriptSupport.extractName("SELECT 1")).isNull();
        assertThat(SqlScriptSupport.extractName("-- 普通注释\nSELECT 1")).isNull();
        // 正文之后出现的 name: 不算别名
        assertThat(SqlScriptSupport.extractName("SELECT 1 -- name: late")).isNull();
    }

    // ------------------------------------------------------------------
    // compile：{{var.path}} → ? 真绑定
    // ------------------------------------------------------------------

    @Test
    void compilesBarePlaceholdersWithTypePreserved() {
        Map<String, Object> vars = new HashMap<>();
        vars.put("v", 5);
        vars.put("u", Map.of("id", 7));
        SqlScriptSupport.CompiledSql out = SqlScriptSupport.compile(
                "UPDATE t SET a = {{v}} WHERE id = {{u.id}}", vars, new ObjectMapper());
        assertThat(out.jdbcSql()).isEqualTo("UPDATE t SET a = ? WHERE id = ?");
        assertThat(out.params()).containsExactly(5, 7);
        assertThat(out.params().get(0)).isInstanceOf(Integer.class);
    }

    @Test
    void compilesQuotedSinglePlaceholderStrippingQuotes() {
        Map<String, Object> vars = Map.of("u", Map.of("name", "张三"));
        SqlScriptSupport.CompiledSql out = SqlScriptSupport.compile(
                "SELECT 1 FROM t WHERE name = '{{u.name}}'", vars, new ObjectMapper());
        assertThat(out.jdbcSql()).isEqualTo("SELECT 1 FROM t WHERE name = ?");
        assertThat(out.params()).containsExactly("张三");
    }

    @Test
    void compilesMixedLiteralAsInterpolatedString() {
        SqlScriptSupport.CompiledSql out = SqlScriptSupport.compile(
                "SELECT 1 FROM t WHERE name LIKE '%{{kw}}%'", Map.of("kw", "焊"), new ObjectMapper());
        assertThat(out.jdbcSql()).isEqualTo("SELECT 1 FROM t WHERE name LIKE ?");
        assertThat(out.params()).containsExactly("%焊%");
    }

    @Test
    void missingVariableBindsNull() {
        SqlScriptSupport.CompiledSql out = SqlScriptSupport.compile(
                "UPDATE t SET a = {{nope}} WHERE id = 1", Map.of(), new ObjectMapper());
        assertThat(out.jdbcSql()).isEqualTo("UPDATE t SET a = ? WHERE id = 1");
        assertThat(out.params()).containsExactly((Object) null);
    }

    @Test
    void containerValueSerializesToJsonString() {
        ObjectMapper om = new ObjectMapper();
        SqlScriptSupport.CompiledSql out = SqlScriptSupport.compile(
                "INSERT INTO t(payload) VALUES ({{data}})", Map.of("data", Map.of("k", 1)), om);
        assertThat(out.params()).containsExactly("{\"k\":1}");
    }

    @Test
    void rejectsBadPlaceholderSyntax() {
        assertThatThrownBy(() -> SqlScriptSupport.compile("SELECT {{a b}}", Map.of(), null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("占位符");
        assertThatThrownBy(() -> SqlScriptSupport.compile("SELECT {{x", Map.of(), null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("占位符");
    }

    @Test
    void rejectsNonMapIntermediatePath() {
        assertThatThrownBy(() -> SqlScriptSupport.compile("SELECT {{u.id}}", Map.of("u", "str"), null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("中间层非对象");
    }

    @Test
    void leavesLiteralWithoutPlaceholderVerbatim() {
        SqlScriptSupport.CompiledSql out = SqlScriptSupport.compile(
                "UPDATE t SET note = '含分号;保留' WHERE id = 1", Map.of(), null);
        assertThat(out.jdbcSql()).isEqualTo("UPDATE t SET note = '含分号;保留' WHERE id = 1");
        assertThat(out.params()).isEmpty();
    }
}
