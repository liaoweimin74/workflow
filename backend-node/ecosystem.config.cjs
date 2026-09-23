/**
 * pm2 进程守护配置（单实例部署）。
 *
 * 用法（在 `backend-node/` 下）：
 *   npm i -g pm2                     # 只需一次（pm2 刻意不进 dependencies：
 *                                    #   它是部署期工具，不该成为应用的运行时依赖）
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs workflow-backend-node    # 看日志
 *   pm2 restart workflow-backend-node # 重启（改完 src 并 nest build 之后）
 *   pm2 save && pm2 startup           # 开机自启（Linux；Windows 见 README）
 *
 * ## 为什么是 instances: 1（**不要**随手改成 max）
 * 本项目当前只支持**单实例**：
 *   ① SSE 连接表是进程内的（`NotificationSseManager`）——多实例下「A 收到消息、B 持有连接」
 *      推不到，必须上 Redis 广播；
 *   ② 页面发布的**跨进程**按 key 串行锁没有实现（规格 U33）。
 * 引擎本身的并发正确性**已由乐观锁保证**（V37 的 `lock_version` + CAS，规格 U40），
 * 所以想扩到多实例时，剩下的是上面两条基础设施工作。
 *
 * ## 为什么 fork 模式而不是 cluster
 * 与 `instances: 1` 配套：cluster 模式会 fork 多进程，直接踩上面两条限制。
 */
module.exports = {
  apps: [
    {
      name: 'workflow-backend-node',
      script: 'dist/main.js',
      cwd: __dirname,

      // ⚠️ 单实例：见文件头注释（SSE 进程内连接表 + U33 跨进程发布锁）
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PORT: 8081,
        DB_NAME: 'workflow_v6',
        // ⚠️ 其余环境变量（DB_HOST/DB_USER/DB_PASSWORD/JWT_SECRET…）请通过
        //    部署平台的 secret 注入，**不要**写进这个文件（它会进版本库）。
        //     完整清单见 .env.example。
      },

      // 崩溃自动重启；但启动后 10 秒内就退出视为「配置错/依赖没起来」，
      // 不再无限快速重启（避免刷满日志、掩盖真正的启动错误）
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 2000,

      // 给进程留出处理完在途请求的时间（优雅退出；见 DatabaseModule.onApplicationShutdown）
      kill_timeout: 5000,

      // 内存兜底：本项目实例状态全在数据库，进程内存占用应远低于此值；
      // 超过通常意味着泄漏（例如未清理的 SSE 连接），重启比拖垮机器好
      max_memory_restart: '512M',

      // 日志（配 pm2-logrotate 做切割：pm2 install pm2-logrotate）
      output: 'logs/pm2-out.log',
      error: 'logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
