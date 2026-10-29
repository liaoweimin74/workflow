# 手工 Flyway 配置与 JPA ddl-auto 竞态：Hibernate 抢跑建表炸掉加列迁移

## 现象（2026-10-26 live 库首跑）
- J 系列新代码首启 live，V72 `ADD COLUMN client_id` 撞 **1060 Duplicate column**。
- 勘查发现 Flyway 尚未跑到 V72，但 `sys_menu`/`sys_role`/`sys_user_openid` 已有 `client_id` 列
  （**无 DEFAULT 1，存量行落 0**——与 V72/V73「零破坏回填」语义冲突），
  `sys_user_device`/`sys_bind_code` 空表与 `uk_user_openid_client_*` 唯一键也被按实体预建
  （V75 的 RENAME/DROP INDEX 将撞 exists/1061）。

## 根因
- 工程只依赖 `flyway-core`（Boot 4.0.7 模块化后**无 `spring-boot-flyway` 自动配置模块**，本地仓库不存在），
  `FlywayConfig` 用 `Flyway.configure()` 手工建 bean——它与 EMF 之间没有任何创建顺序保证。
- `ddl-auto=update` 下 EMF 的 init（`afterPropertiesSet`）会先跑 Hibernate schema update。
  谁先创建谁先改库：Hibernate 抢跑即按实体预建结构，非幂等迁移必炸。
- 为何 V67 时代从未显形：旧实体与现网列一致、无新列可抢，Flyway 怎么走都不撞；J1 首批加列才触发。

## 应对（已落地 f58f6191）
1. `FlywayConfig` 加静态 `BeanPostProcessor` 守卫：`postProcessBeforeInitialization` 中遇到
   `LocalContainerEntityManagerFactoryBean` 先 `beanFactory.getBean(Flyway.class)`
   （`initMethod=migrate` 随之完成）——把 migrate 钉死在 Hibernate schema update 之前。
2. 若再遇到半途炸：恢复三件套 = 删 history `success=0` 行 → 删 Hibernate 预建的列/表/唯一键 →
   重启让 Flyway 以正统形状重放。判型信号：**「列存在但无 DEFAULT」「空表+实体名 uk」的混合形状**。
3. 已尝试失败的方案（勿再走）：给 EMF bean 定义 `setDependsOn("flyway")` 的
   BeanFactoryPostProcessor 启动报 `No bean named '&entityManagerFactory'`
   （FactoryBean 语义 + dependsOn，未深究），换 BeanPostProcessor 守卫才成立。

## 影响面
- 手工 Flyway 配置 + `ddl-auto=update` 组合下，一切新增加列/建表/改索引的迁移。
- 若移除 FlywayConfig 守卫、或改走 Boot 自动配置（需加 spring-boot-flyway 依赖），需重新保证该顺序。
