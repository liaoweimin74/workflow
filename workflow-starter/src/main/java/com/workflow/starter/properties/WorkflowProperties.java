package com.workflow.starter.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "workflow")
public class WorkflowProperties {

    private TenantConfig tenant = new TenantConfig();
    private DataSourceConfig datasource = new DataSourceConfig();

    public TenantConfig getTenant() { return tenant; }
    public void setTenant(TenantConfig tenant) { this.tenant = tenant; }
    public DataSourceConfig getDatasource() { return datasource; }
    public void setDatasource(DataSourceConfig datasource) { this.datasource = datasource; }

    public static class TenantConfig {
        private String headerName = "X-Tenant-Id";

        public String getHeaderName() { return headerName; }
        public void setHeaderName(String headerName) { this.headerName = headerName; }
    }

    public static class DataSourceConfig {
        private String url;
        private String username;
        private String password;
        private String driverClassName;

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getDriverClassName() { return driverClassName; }
        public void setDriverClassName(String driverClassName) { this.driverClassName = driverClassName; }
    }
}