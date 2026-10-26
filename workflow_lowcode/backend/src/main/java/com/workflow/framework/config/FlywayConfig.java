package com.workflow.framework.config;

import org.flywaydb.core.Flyway;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.BeanFactoryAware;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.beans.factory.config.ConfigurableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;

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

    /**
     * 钉死 Flyway migrate 先于 JPA EntityManagerFactory 初始化。
     *
     * 背景：工程只依赖 flyway-core（无 Boot 的 spring-boot-flyway 自动配置模块），
     * 手工 Flyway bean 与 EMF 之间没有任何创建顺序保证。ddl-auto=update 下 EMF 先初始化时，
     * Hibernate 会按实体抢先建表/加列（丢失 DEFAULT 语义，存量行落 0）并抢建唯一键，
     * 令 V72/V73 的 ADD COLUMN 撞 1060、V75 的 DROP/ADD INDEX 撞 1061，迁移半途失败。
     * 修复：EMF 的 init（Hibernate schema update 在 afterPropertiesSet 里跑）之前，
     * 提前触发 flyway bean 创建——initMethod=migrate 此时已完成，DDL 主导权归 Flyway。
     */
    @Bean
    public static FlywayOrderGuard flywayOrderGuard() {
        return new FlywayOrderGuard();
    }

    static class FlywayOrderGuard implements BeanPostProcessor, BeanFactoryAware {

        private ConfigurableBeanFactory beanFactory;
        private volatile boolean flywayInitialized;

        @Override
        public void setBeanFactory(BeanFactory beanFactory) throws BeansException {
            this.beanFactory = (ConfigurableBeanFactory) beanFactory;
        }

        @Override
        public Object postProcessBeforeInitialization(Object bean, String beanName) {
            if (!flywayInitialized && bean instanceof LocalContainerEntityManagerFactoryBean) {
                synchronized (this) {
                    if (!flywayInitialized) {
                        flywayInitialized = true;
                        // 创建 flyway bean 并执行 initMethod=migrate；migrate 失败即启动失败
                        this.beanFactory.getBean(Flyway.class);
                    }
                }
            }
            return bean;
        }
    }
}
