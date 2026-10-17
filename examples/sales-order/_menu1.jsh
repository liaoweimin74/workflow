import java.sql.*;
var c = DriverManager.getConnection("jdbc:mysql://localhost:3306/workflow?serverTimezone=Asia/Shanghai", "root", "740130");
var st = c.createStatement();
try {
  var rs = st.executeQuery("SHOW TABLES LIKE '%menu%'");
  while (rs.next()) System.out.println(rs.getString(1));
} finally { c.close(); }
/exit
