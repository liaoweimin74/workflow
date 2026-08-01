package com.workflow.app;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Disabled("Integration test requires MySQL - skip in CI")
class WorkflowApplicationTests {

    @Test
    void contextLoads() {
        // Verify Spring context loads successfully
    }
}