import java.sql.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * H2 → JSON dump（Task 13-8 前置：历史数据导出）
 * 用法：java H2Dump.java <outputDir>
 * 输出：每表一个 JSON 行流文件 <table>.jsonl + _summary.txt
 * 必须在 H2 文件锁空闲窗口内执行（先 pkill java）。
 */
public class H2Dump {
    public static void main(String[] args) throws Exception {
        String outDir = args.length > 0 ? args[0] : "/tmp/h2-dump";
        Files.createDirectories(Paths.get(outDir));
        String dbPath = "/home/z/my-project/workflow_lowcode/backend/data/workflow";
        Connection c = DriverManager.getConnection("jdbc:h2:file:" + dbPath + ";MODE=MySQL;IFEXISTS=TRUE;OPEN_NEW=TRUE", "sa", "");
        DatabaseMetaData md = c.getMetaData();
        List<String[]> tables = new ArrayList<>();
        try (ResultSet rs = md.getTables(null, "PUBLIC", "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                tables.add(new String[]{rs.getString("TABLE_NAME"), rs.getString("TABLE_TYPE")});
            }
        }
        StringBuilder summary = new StringBuilder();
        int total = 0;
        for (String[] t : tables) {
            String table = t[0];
            if (table.startsWith("FLW_") || table.startsWith("ACT_") || table.equalsIgnoreCase("flyway_schema_history")) {
                summary.append("SKIP(engine) ").append(table).append('\n');
                continue;
            }
            List<String> cols = new ArrayList<>();
            try (ResultSet rs = md.getColumns(null, "PUBLIC", table, "%")) {
                while (rs.next()) cols.add(rs.getString("COLUMN_NAME"));
            }
            Path f = Paths.get(outDir, table + ".jsonl");
            long rowCount = 0;
            try (BufferedWriter w = Files.newBufferedWriter(f);
                 Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT * FROM \"" + table + "\"")) {
                w.write("{\"table\":\"" + table + "\",\"columns\":" + jsonList(cols) + "}\n");
                ResultSetMetaData rm = rs.getMetaData();
                int n = rm.getColumnCount();
                while (rs.next()) {
                    StringBuilder row = new StringBuilder("[");
                    for (int i = 1; i <= n; i++) {
                        if (i > 1) row.append(',');
                        int type = rm.getColumnType(i);
                        Object v = rs.getObject(i);
                        if (v == null) { row.append("null"); }
                        else if (type == Types.BIGINT || type == Types.INTEGER || type == Types.SMALLINT || type == Types.TINYINT
                              || type == Types.DECIMAL || type == Types.NUMERIC || type == Types.DOUBLE || type == Types.FLOAT
                              || type == Types.REAL || type == Types.BOOLEAN) {
                            row.append(v.toString());
                        } else if (v instanceof byte[] b) {
                            row.append('"').append(Base64.getEncoder().encodeToString(b)).append('"');
                        } else {
                            row.append(jsonEsc(v.toString()));
                        }
                    }
                    row.append(']');
                    w.write(row.toString()); w.write('\n');
                    rowCount++;
                }
            }
            summary.append(table).append('=').append(rowCount).append(" cols=").append(cols.size()).append('\n');
            total += rowCount;
        }
        summary.append("TOTAL=").append(total).append(" tables=").append(tables.size()).append('\n');
        Files.writeString(Paths.get(outDir, "_summary.txt"), summary.toString());
        System.out.println(summary);
        c.close();
    }

    static String jsonList(List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(jsonEsc(items.get(i)));
        }
        return sb.append(']').toString();
    }

    static String jsonEsc(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
                }
            }
        }
        return sb.append('"').toString();
    }
}
