package com.workflow.framework.config;

import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * Flyway 迁移配置。
 *
 * 通用规则（MySQL / H2 均生效）：
 * - Flyway 迁移必须在 JPA ddl-auto 建表之后执行（V2 等脚本直接向 sys_user/sys_menu 插入种子数据）。
 *   通过将本 Bean 显式依赖 entityManagerFactory 实现该时序。
 *
 * 沙箱 H2 适配（仅当 JDBC URL 为 H2 时激活，MySQL 行为完全不变）：
 * - Flowable 的建表依赖entityManagerFactory 之后的时序，由 FlowableEngineConfig 的
 *   {@code @DependsOn("flyway")} 保证。
 * - 部分迁移脚本使用 MySQL 过程式语法（SET @var / PREPARE），H2 无法执行。
 *   这些脚本对全新数据库而言是幂等维护操作（Hibernate ddl-auto 已自动建列，数据回填无行可更），
 *   处理方式：
 *     1) MYSQL_ONLY_VERSIONS：直接预置 flyway_schema_history 成功记录，跳过执行；
 *     2) H2_REPLAY_VERSIONS（V29）：剥离过程式语句块后逐句执行（含必需的菜单种子数据），
 *        同样预置历史记录。逐句执行时容忍失败（列已存在等幂等场景）。
 * - validateOnMigrate(false)：预置记录的 checksum 与脚本不匹配，沙箱关闭校验。
 */
@Configuration
@Profile("!test")
public class FlywayConfig {

    /** 纯 MySQL 过程式维护脚本（对全新库为无操作），沙箱 H2 下预置历史后跳过 */
    private static final List<String> MYSQL_ONLY_VERSIONS =
            List.of("8", "18", "19", "22", "23", "27", "28", "30");

    /** 含必需种子数据、需剥离过程式语法后在 H2 上重放的脚本 */
    private static final List<String> H2_REPLAY_VERSIONS = List.of("29", "32");

    @Bean(initMethod = "migrate")
    @DependsOn("entityManagerFactory")
    public Flyway flyway(DataSource dataSource) {
        boolean h2 = isH2(dataSource);
        if (h2) {
            prepareSandboxH2(dataSource);
        }
        return Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(!h2)
                .outOfOrder(true)
                .validateOnMigrate(!h2)
                // V32 种子模板正文含 ${taskName} 等 TemplateService 渲染占位符，
                // 与 Flyway 默认占位符语法冲突，全局关闭（V2-V31 均未使用占位符）
                .placeholderReplacement(false)
                .load();
    }

    private boolean isH2(DataSource dataSource) {
        try (Connection c = dataSource.getConnection()) {
            return c.getMetaData().getDatabaseProductName().toLowerCase().contains("h2");
        } catch (SQLException e) {
            return false;
        }
    }

    /** 沙箱 H2 初始化：重放含种子数据的脚本 + 预置 MySQL 专属迁移的历史记录 */
    private void prepareSandboxH2(DataSource dataSource) {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            ensureHistoryTable(st);
            // 清理历史失败记录（此前启动失败可能残留）
            st.execute("DELETE FROM \"flyway_schema_history\" WHERE success = FALSE");
            // 重放含种子数据的脚本（剥离过程式语句块）
            for (String version : H2_REPLAY_VERSIONS) {
                replayStripped(version, st);
            }
            // 预置跳过迁移的成功历史
            for (String version : union(MYSQL_ONLY_VERSIONS, H2_REPLAY_VERSIONS)) {
                seedHistory(st, version);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("沙箱 H2 Flyway 预处理失败", e);
        }
    }

    private static List<String> union(List<String> a, List<String> b) {
        List<String> all = new ArrayList<>(a);
        all.addAll(b);
        return all;
    }

    private void ensureHistoryTable(Statement st) throws SQLException {
        try {
            st.execute("CREATE TABLE IF NOT EXISTS \"flyway_schema_history\" (" +
                    "installed_rank INT NOT NULL, version VARCHAR(50), description VARCHAR(200), " +
                    "type VARCHAR(20) NOT NULL, script VARCHAR(1000) NOT NULL, checksum INT, " +
                    "installed_by VARCHAR(100) NOT NULL, installed_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                    "execution_time INT NOT NULL, success BOOLEAN NOT NULL)");
        } catch (SQLException ignore) {
            return; // 表已存在
        }
        try {
            st.execute("ALTER TABLE \"flyway_schema_history\" ADD CONSTRAINT flyway_schema_history_pk " +
                    "PRIMARY KEY (installed_rank)");
        } catch (SQLException ignore) {
            // 约束已存在
        }
    }

    /** 读取 classpath 迁移脚本，剥离 SET @/PREPARE/EXECUTE/DEALLOCATE 语句块后逐句执行 */
    private void replayStripped(String version, Statement st) {
        String resource = classpathLocation(version);
        if (resource == null) return;
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            if (in == null) return;
            String sql = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
                    .lines()
                    .reduce(new StringBuilder(), FlywayConfig::stripProceduralLine,
                            StringBuilder::append)
                    .toString();
            for (String statement : splitStatements(sql)) {
                try {
                    st.execute(statement);
                } catch (SQLException e) {
                    // 幂等维护语句在 H2 上可能因列已存在等失败：记录后继续
                    System.err.println("[FlywayH2] 跳过失败语句(" + version + "): "
                            + firstLine(statement) + " -> " + e.getMessage());
                }
            }
        } catch (Exception e) {
            throw new IllegalStateException("沙箱 H2 重放脚本失败: " + version, e);
        }
    }

    /** 逐行剥离 MySQL 过程式语句块：从 SET @ 行起跳过，直到 DEALLOCATE 行（含） */
    private static StringBuilder stripProceduralLine(StringBuilder sb, String line) {
        String t = line.trim();
        boolean inSkipBlock = sb.length() > 0 && sb.charAt(sb.length() - 1) == '\u0000';
        if (inSkipBlock) {
            // 跳过块内行；DEALLOCATE 行结束跳过块
            if (t.startsWith("DEALLOCATE")) {
                sb.setLength(sb.length() - 1); // 移除块标记字符
            }
            return sb;
        }
        if (t.startsWith("SET @")) {
            // 开始跳过块：先暂不输出，写入哨兵标记（若 SET 行本身即 DEALLOCATE 则不会发生）
            sb.append('\u0000');
            return sb;
        }
        if (t.startsWith("PREPARE ") || t.startsWith("EXECUTE ") || t.startsWith("DEALLOCATE")) {
            return sb;
        }
        return sb.append(line).append('\n');
    }

    private String classpathLocation(String version) {
        return "db/migration/V" + version + "__" + scriptSlug(version) + ".sql";
    }

    /** 由版本号推导 db/migration 下的脚本文件名（扫描方式，避免硬编码描述） */
    private String scriptSlug(String version) {
        // 从 classpath 枚举匹配 V{version}__*.sql
        try {
            var dir = new java.io.File("src/main/resources/db/migration");
            if (dir.isDirectory()) {
                java.io.File[] files = dir.listFiles((d, n) -> n.startsWith("V" + version + "__"));
                if (files != null && files.length > 0) {
                    return files[0].getName().substring(("V" + version + "__").length(),
                            files[0].getName().length() - ".sql".length());
                }
            }
        } catch (Exception ignore) {
            // 打包环境走不到这里
        }
        // jar 内无法列目录，退回已知描述
        if ("29".equals(version)) return "add_notification_event_definitions";
        if ("32".equals(version)) return "seed_workflow_notification";
        return "";
    }

    private List<String> splitStatements(String sql) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : sql.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("--") || trimmed.isEmpty()) continue;
            current.append(line).append('\n');
            if (trimmed.endsWith(";")) {
                String s = current.toString().trim();
                if (s.length() > 1) statements.add(s.substring(0, s.length() - 1));
                current.setLength(0);
            }
        }
        String rest = current.toString().trim();
        if (!rest.isEmpty()) statements.add(rest);
        return statements;
    }

    private String firstLine(String s) {
        int i = s.indexOf('\n');
        return i > 0 ? s.substring(0, i) : s;
    }

    private void seedHistory(Statement st, String version) throws SQLException {
        String description = scriptSlug(version).replace('_', ' ');
        String script = "V" + version + "__" + scriptSlug(version) + ".sql";
        ResultSet rs = st.executeQuery(
                "SELECT COUNT(*) FROM \"flyway_schema_history\" WHERE version = '" + version + "'");
        rs.next();
        if (rs.getLong(1) > 0) return;
        st.execute("INSERT INTO \"flyway_schema_history\" " +
                "(installed_rank, version, description, type, script, checksum, installed_by, " +
                " installed_on, execution_time, success) " +
                "SELECT COALESCE(MAX(installed_rank), 0) + 1, '" + version + "', '" + description
                + "', 'SQL', '" + script + "', NULL, 'sandbox', CURRENT_TIMESTAMP, 0, TRUE " +
                "FROM \"flyway_schema_history\"");
    }
}
