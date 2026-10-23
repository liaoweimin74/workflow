package com.workflow.engine.app;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 多端应用数据模型迁移测试（Task 1.1 → V68__multi_client_app_model.sql）。
 *
 * 背景：测试 profile（application-test.yml）为 H2 + Flyway 关闭、建表走 Hibernate；
 * 只有生产 MySQL 才跑 Flyway。因此本测试自建 H2(MODE=MySQL) 连接，手工复刻 V20 的
 * wf_page_def（含旧唯一键 uk_page_def_tenant_key_version）作为「V67 时点」存量，
 * 再真实执行 V68 迁移脚本（脚本按 plan Task 1.1 Step 3 写成 MySQL/H2(MODE=MySQL)
 * 双兼容，经探针实证），断言：
 *
 *  1. 4 张新表 wf_app / wf_app_client / wf_app_client_page / wf_app_release 存在，
 *     wf_page_def 新增 app_id 列；
 *  2. 每租户回填 code=default 的默认应用（V32 口径 WHERE NOT EXISTS，防重跑重复插入）；
 *  3. 旧页 app_id 全部落到默认应用 id，无 NULL 双轨（spec「存量升级零感知」）；
 *  4. 页面唯一键由 (tenant_id,key,version) 换为 (tenant_id,app_id,key,version)——
 *     同 key 页面跨应用共存（spec「同 key 页面在不同应用共存」）；
 *  5. client(uk_client) / 分配(uk_client_page) / 发布(uk_release) 唯一键生效；
 *  6. 脚本重放（H2 沙箱口径）不产生重复数据、不破坏既有归属。
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AppModelMigrationTest {

    private static final String V68_RESOURCE = "/db/migration/V68__multi_client_app_model.sql";

    private static Connection conn;

    @BeforeAll
    static void initLegacySchema() throws Exception {
        conn = DriverManager.getConnection(
                "jdbc:h2:mem:appmodel_migration;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        try (Statement st = conn.createStatement()) {
            // V20__create_wf_page_def.sql 的 wf_page_def 复刻（V67 时点形态：无 app_id）
            st.execute("""
                    CREATE TABLE wf_page_def (
                        id                VARCHAR(64)  NOT NULL PRIMARY KEY,
                        tenant_id         VARCHAR(64)  NOT NULL,
                        name              VARCHAR(255) NOT NULL COMMENT '页面名称',
                        `key`             VARCHAR(255) NOT NULL COMMENT '页面标识（租户内唯一）',
                        type              VARCHAR(32)  NOT NULL DEFAULT 'VIEW' COMMENT 'VIEW=视图 / PAGE=自定义页面',
                        form_key          VARCHAR(255) COMMENT '绑定的业务表单 key',
                        `schema`          LONGTEXT COMMENT '页面 schema JSON',
                        version           INT NOT NULL DEFAULT 1,
                        status            VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
                        published_version INT,
                        created_by        VARCHAR(50),
                        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_page_def_tenant_key_version (tenant_id, `key`, version),
                        INDEX idx_page_def_tenant_form (tenant_id, form_key),
                        INDEX idx_page_def_tenant_status (tenant_id, status)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面定义（视图/自定义页面）'
                    """);
            // 存量页面：两个租户、多版本
            st.execute("""
                    INSERT INTO wf_page_def (id, tenant_id, name, `key`, type, version, status) VALUES
                    ('p-merchant-order-list',   't-merchant', '订单列表', 'order-list',   'PAGE', 1, 'PUBLISHED'),
                    ('p-merchant-order-detail', 't-merchant', '订单详情', 'order-detail', 'PAGE', 1, 'DRAFT'),
                    ('p-buyer-home',            't-buyer',    '买家首页', 'home',         'PAGE', 2, 'PUBLISHED')
                    """);
        }
    }

    @AfterAll
    static void close() throws Exception {
        if (conn != null) {
            conn.close();
        }
    }

    // ------------------------------------------------------------
    // 1. 迁移执行：4 张新表 + wf_page_def.app_id 列
    // ------------------------------------------------------------

    @Test
    @Order(1)
    void migration_executes_and_creates_app_model_tables() throws Exception {
        runV68();
        assertThat(tableExists("wf_app")).as("wf_app 表存在").isTrue();
        assertThat(tableExists("wf_app_client")).as("wf_app_client 表存在").isTrue();
        assertThat(tableExists("wf_app_client_page")).as("wf_app_client_page 表存在").isTrue();
        assertThat(tableExists("wf_app_release")).as("wf_app_release 表存在").isTrue();
        assertThat(columnExists("wf_page_def", "app_id")).as("wf_page_def.app_id 列存在").isTrue();
    }

    // ------------------------------------------------------------
    // 2. 每租户回填一个 code=default 的默认应用
    // ------------------------------------------------------------

    @Test
    @Order(2)
    void backfill_creates_one_default_app_per_tenant() throws Exception {
        assertThat(count("SELECT COUNT(*) FROM wf_app WHERE code = 'default'"))
                .as("每个存量租户恰好一个默认应用").isEqualTo(2);
        assertThat(scalarList("SELECT id FROM wf_app WHERE code = 'default' ORDER BY id"))
                .containsExactly("default-app-t-buyer", "default-app-t-merchant");
        assertThat(count("SELECT COUNT(*) FROM wf_app"))
                .as("除默认应用外不产生其他应用").isEqualTo(2);
    }

    // ------------------------------------------------------------
    // 3. 旧页 app_id 归入默认应用，无 NULL 双轨
    // ------------------------------------------------------------

    @Test
    @Order(3)
    void legacy_pages_assigned_to_default_app_without_null() throws Exception {
        assertThat(count("SELECT COUNT(*) FROM wf_page_def WHERE app_id IS NULL"))
                .as("不留 NULL 双轨（spec：app_id 落真实应用 id）").isZero();
        assertThat(count("SELECT COUNT(*) FROM wf_page_def p "
                + "JOIN wf_app a ON p.app_id = a.id WHERE a.code = 'default'"))
                .as("全部旧页归属默认应用").isEqualTo(3);
        assertThat(scalar("SELECT app_id FROM wf_page_def WHERE id = 'p-buyer-home'"))
                .as("页面归属其租户自己的默认应用").isEqualTo("default-app-t-buyer");
        assertThat(scalar("SELECT app_id FROM wf_page_def WHERE id = 'p-merchant-order-list'"))
                .isEqualTo("default-app-t-merchant");
    }

    // ------------------------------------------------------------
    // 4. 唯一键交换：同 key 页面跨应用共存
    // ------------------------------------------------------------

    @Test
    @Order(4)
    void same_key_page_coexists_across_apps_and_unique_key_swapped() throws Exception {
        // 商户租户追加「买家端」应用
        execute("INSERT INTO wf_app (id, tenant_id, code, name, status, created_at, updated_at) VALUES "
                + "('app-merchant-buyer', 't-merchant', 'buyer', '买家端', 'ACTIVE', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");

        // 同 tenant + key + version、不同 app → 旧键 (tenant_id,key,version) 必须已移除
        execute("INSERT INTO wf_page_def (id, tenant_id, name, `key`, type, version, status, app_id) VALUES "
                + "('p-merchant-order-list-b', 't-merchant', '订单列表(买家)', 'order-list', 'PAGE', 1, "
                + "'DRAFT', 'app-merchant-buyer')");

        // 同 app 内同 key + version → 新键 (tenant_id,app_id,key,version) 拒绝
        assertThatThrownBy(() -> execute("INSERT INTO wf_page_def "
                + "(id, tenant_id, name, `key`, type, version, status, app_id) VALUES "
                + "('p-dup', 't-merchant', '重复', 'order-list', 'PAGE', 1, 'DRAFT', 'app-merchant-buyer')"))
                .as("同应用内同 key+version 仍被唯一键拒绝")
                .isInstanceOf(SQLException.class);
    }

    // ------------------------------------------------------------
    // 5. client / 分配 / 发布 三表唯一键生效
    // ------------------------------------------------------------

    @Test
    @Order(5)
    void client_assignment_release_unique_keys_enforced() throws Exception {
        execute("INSERT INTO wf_app_client (id, tenant_id, app_id, client_type, name, render_mode, status, "
                + "created_at, updated_at) VALUES ('c-mp', 't-merchant', 'default-app-t-merchant', "
                + "'MP_WEIXIN', '主力小程序', 'CODEGEN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");

        assertThatThrownBy(() -> execute("INSERT INTO wf_app_client (id, tenant_id, app_id, client_type, "
                + "name, render_mode, status, created_at, updated_at) VALUES "
                + "('c-mp-dup', 't-merchant', 'default-app-t-merchant', 'MP_WEIXIN', '主力小程序', "
                + "'CODEGEN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
                .as("uk_client(tenant_id,app_id,client_type,name) 拒绝重复")
                .isInstanceOf(SQLException.class);

        // 同端类型、不同名称 → 允许多个 Client（spec：同一端类型允许多个 Client）
        execute("INSERT INTO wf_app_client (id, tenant_id, app_id, client_type, name, render_mode, status, "
                + "created_at, updated_at) VALUES ('c-mp2', 't-merchant', 'default-app-t-merchant', "
                + "'MP_WEIXIN', '备用小程序', 'CODEGEN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");

        execute("INSERT INTO wf_app_client_page (id, tenant_id, client_id, page_id, sort, created_at, "
                + "updated_at) VALUES ('cp1', 't-merchant', 'c-mp', 'p-merchant-order-list', 1, "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        assertThatThrownBy(() -> execute("INSERT INTO wf_app_client_page (id, tenant_id, client_id, page_id, "
                + "sort, created_at, updated_at) VALUES ('cp-dup', 't-merchant', 'c-mp', "
                + "'p-merchant-order-list', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
                .as("uk_client_page(client_id,page_id) 拒绝重复分配")
                .isInstanceOf(SQLException.class);

        execute("INSERT INTO wf_app_release (id, tenant_id, client_id, version, status, created_at, "
                + "updated_at) VALUES ('r1', 't-merchant', 'c-mp', 1, 'CREATED', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        assertThatThrownBy(() -> execute("INSERT INTO wf_app_release (id, tenant_id, client_id, version, "
                + "status, created_at, updated_at) VALUES ('r-dup', 't-merchant', 'c-mp', 1, 'CREATED', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
                .as("uk_release(client_id,version) 拒绝重复版本")
                .isInstanceOf(SQLException.class);
        execute("INSERT INTO wf_app_release (id, tenant_id, client_id, version, status, created_at, "
                + "updated_at) VALUES ('r2', 't-merchant', 'c-mp', 2, 'CREATED', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
    }

    // ------------------------------------------------------------
    // 6. 脚本重放（H2 沙箱口径）：不重复回填、不破坏归属
    // ------------------------------------------------------------

    @Test
    @Order(6)
    void script_replay_does_not_duplicate_or_break_data() throws Exception {
        int appsBefore = count("SELECT COUNT(*) FROM wf_app");
        int pagesBefore = count("SELECT COUNT(*) FROM wf_page_def");
        int defaultsBefore = count("SELECT COUNT(*) FROM wf_app WHERE code = 'default'");

        runV68TolerantOnExistingDdl();

        assertThat(count("SELECT COUNT(*) FROM wf_app")).as("重放不新增应用").isEqualTo(appsBefore);
        assertThat(count("SELECT COUNT(*) FROM wf_page_def")).as("重放不新增页面").isEqualTo(pagesBefore);
        assertThat(count("SELECT COUNT(*) FROM wf_app WHERE code = 'default'"))
                .as("WHERE NOT EXISTS 防重跑重复插入（V32 口径）").isEqualTo(defaultsBefore);
        assertThat(count("SELECT COUNT(*) FROM wf_page_def WHERE app_id IS NULL"))
                .as("重放后仍无 NULL app_id").isZero();
    }

    // ------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------

    /** 严格执行 V68：任何语句失败即抛出（首次迁移路径）。 */
    private static void runV68() throws Exception {
        EncodedResource script = loadV68();
        ScriptUtils.executeSqlScript(conn, script);
    }

    /** 重放路径：DDL 语句失败可跳过（复刻 H2 沙箱重放容忍口径），数据语句必须幂等。 */
    private static void runV68TolerantOnExistingDdl() throws Exception {
        EncodedResource script = loadV68();
        ScriptUtils.executeSqlScript(conn, script, true, false,
                new String[]{"--"}, ";", "/*", "*/");
    }

    private static EncodedResource loadV68() throws Exception {
        try (var in = AppModelMigrationTest.class.getResourceAsStream(V68_RESOURCE)) {
            assertThat(in)
                    .as("V68 迁移脚本不存在：%s（Task 1.1 未实现？）", V68_RESOURCE)
                    .isNotNull();
            String sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return new EncodedResource(
                    new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        }
    }

    private static boolean tableExists(String table) throws Exception {
        return count("SELECT COUNT(*) FROM information_schema.tables "
                + "WHERE lower(table_name) = '" + table.toLowerCase() + "'") > 0;
    }

    private static boolean columnExists(String table, String column) throws Exception {
        return count("SELECT COUNT(*) FROM information_schema.columns "
                + "WHERE lower(table_name) = '" + table.toLowerCase() + "' "
                + "AND lower(column_name) = '" + column.toLowerCase() + "'") > 0;
    }

    private static int count(String sql) throws SQLException {
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static String scalar(String sql) throws SQLException {
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        }
    }

    private static List<String> scalarList(String sql) throws SQLException {
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            List<String> out = new ArrayList<>();
            while (rs.next()) {
                out.add(rs.getString(1));
            }
            return out;
        }
    }

    private static void execute(String sql) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute(sql);
        }
    }
}
