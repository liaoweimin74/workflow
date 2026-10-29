import java.sql.*;
var c = DriverManager.getConnection("jdbc:mysql://localhost:3306/workflow?serverTimezone=Asia/Shanghai", "root", "740130");
var st = c.createStatement();
var rs = st.executeQuery("SELECT id, parent_id, menu_name, path, sort_order, menu_type, status FROM sys_menu WHERE is_deleted = 0 ORDER BY parent_id, sort_order");
while (rs.next()) {
  System.out.println(rs.getLong(1) + " | p=" + rs.getLong(2) + " | " + rs.getString(3)
    + " | " + rs.getString(4) + " | sort=" + rs.getInt(5) + " | type=" + rs.getInt(6)
    + " | status=" + rs.getInt(7));
}
c.close();
/exit
