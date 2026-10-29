# 后端首次真启 live：克隆探针盖不住的启动路径地雷群

## 现象（2026-10-26，J 系列首启 live workflow 库）
连续 4 类独立故障，各烧一轮启动周期：
1. Flyway validate 崩：`Detected applied migration not resolved locally: 68/69/70`
   （live history 含已废弃实验分支记录、本地无文件；`out-of-order:true` 盖不住这个校验）。
2. `mvn -o spring-boot:run` 离线模式报 `No plugin found for prefix 'spring-boot'`
   （插件前缀需要元数据解析，离线只认全限定坐标）。
3. 多窗口 `Tee-Object` 写**同一个** backend-run.log，历史错误与新输出交错，勘查一度被误导。
4. 8080 上驻留 10-22 启动的旧热部署进程（不含新代码），让人误判「新代码已在跑」。

## 根因
- J 系列的探针验证法是「live 结构克隆 + mysql 直放迁移 SQL」——**绕过了应用启动路径**：
  validate、Flyway/JPA 顺序（见姊妹篇）、mvn 插件解析、devtools 驻留进程，全都不在探针覆盖面里。

## 应对
1. 新后端系列合入前，先对克隆库/sandbox profile（`application-sandbox.yml`）**真启动彩排**一次，
   启动命令用全限定插件坐标：
   `mvn -o -f <pom> compile org.springframework.boot:spring-boot-maven-plugin:<ver>:run`。
2. 启动前核对端口驻留进程：`(Get-NetTCPConnection -LocalPort 8080 -State Listen).OwningProcess`
   → `Get-Process StartTime` 与最近提交时刻对比；早于代码的进程必替换，别指望 devtools 会拉起新目录的 classes。
3. 实验分支脏 history 处置：先备份（`mysqldump --no-create-info --where="version IN (...)"`），
   再 `DELETE` history 行，重启即过 validate；分支残留对象（`wf_app*` 表）不动——与主线无命名冲突。
4. fail-fast 启动看护：轮询端口的**同时** grep 日志 `APPLICATION FAILED TO START|BUILD FAILURE`，
   命中即退出勘查，别等满 240s 超时（本次三轮失败各白等一轮）。
5. 每次启动换新日志路径（或关掉旧窗口），杜绝多进程 Tee 同文件的交错。

## 影响面
- 未来任何「后端版本首启 live / 发布库」同样适用：终检清单里标注「待启动验证」的项，
  应在克隆库真启动彩排兑现，而不是拿 live 当首炸点。
