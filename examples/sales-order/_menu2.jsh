import java.sql.*;
var c = DriverManager.getConnection("jdbc:mysql://localhost:3306/workflow?serverTimezone=Asia/Shanghai", "root", "740130");
var st = c.createStatement();
var rs = st.executeQuery("SHOW COLUMNS FROM sys_menu");
while (rs.next()) System.out.println(rs.getString(1) + " " + rs.getString(2));
c.close();
/exit
