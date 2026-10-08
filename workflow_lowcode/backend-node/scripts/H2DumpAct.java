import java.sql.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** 补充 dump Flowable 引擎历史/运行时/部署表（历史实例转换输入） */
public class H2DumpAct {
    static final String[] TABLES = {
        "ACT_RE_PROCDEF", "ACT_RE_DEPLOYMENT", "ACT_GE_BYTEARRAY",
        "ACT_HI_PROCINST", "ACT_HI_TASKINST", "ACT_HI_ACTINST", "ACT_HI_VARINST",
        "ACT_HI_IDENTITYLINK", "ACT_HI_COMMENT", "ACT_RU_TASK", "ACT_RU_IDENTITYLINK", "ACT_RU_EXECUTION", "ACT_RU_VARIABLE"
    };
    public static void main(String[] args) throws Exception {
        String outDir = "/tmp/h2-dump";
        Files.createDirectories(Paths.get(outDir));
        Connection c = DriverManager.getConnection("jdbc:h2:file:/home/z/my-project/workflow_lowcode/backend/data/workflow;MODE=MySQL;IFEXISTS=TRUE;OPEN_NEW=TRUE", "sa", "");
        StringBuilder summary = new StringBuilder();
        for (String table : TABLES) {
            List<String> cols = new ArrayList<>();
            DatabaseMetaData md = c.getMetaData();
            try (ResultSet rs = md.getColumns(null, "PUBLIC", table, "%")) {
                while (rs.next()) cols.add(rs.getString("COLUMN_NAME"));
            }
            if (cols.isEmpty()) { summary.append("MISSING ").append(table).append('\n'); continue; }
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
                        if (v == null) row.append("null");
                        else if (v instanceof byte[] b) row.append('"').append(Base64.getEncoder().encodeToString(b)).append('"');
                        else if (type == Types.BIGINT || type == Types.INTEGER || type == Types.SMALLINT || type == Types.TINYINT
                              || type == Types.DECIMAL || type == Types.NUMERIC || type == Types.DOUBLE || type == Types.FLOAT
                              || type == Types.REAL || type == Types.BOOLEAN) row.append(v);
                        else row.append(jsonEsc(v.toString()));
                    }
                    row.append(']');
                    w.write(row.toString()); w.write('\n');
                    rowCount++;
                }
            }
            summary.append(table).append('=').append(rowCount).append('\n');
        }
        Files.writeString(Paths.get(outDir, "_summary_act.txt"), summary.toString());
        System.out.println(summary);
        c.close();
    }
    static String jsonList(List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) { if (i > 0) sb.append(','); sb.append(jsonEsc(items.get(i))); }
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
                default -> { if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch); }
            }
        }
        return sb.append('"').toString();
    }
}
