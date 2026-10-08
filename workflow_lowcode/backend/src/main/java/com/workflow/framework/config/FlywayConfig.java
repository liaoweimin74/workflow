package com.workflow.framework.config;

import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;

@Configuration
@Profile("!test")
public class FlywayConfig {

    @Bean(initMethod = "migrate")
    public Flyway flyway(DataSource dataSource) {
        return Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .outOfOrder(true)
                // V32 通知事件定义里的 ${taskName} 等是**运行时**模板字面量（通知引擎消费），
                // 不是 Flyway 迁移期占位符——全目录无迁移真正需要占位符替换，关闭之
                .placeholderReplacement(false)
                .load();
    }
}