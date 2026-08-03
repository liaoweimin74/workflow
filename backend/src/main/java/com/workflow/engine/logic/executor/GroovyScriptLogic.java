package com.workflow.engine.logic.executor;

import groovy.lang.GroovyShell;
import org.flowable.engine.delegate.DelegateExecution;

import java.util.Map;

public class GroovyScriptLogic {

    public Object execute(String script, DelegateExecution execution, Map<String, Object> vars) {
        GroovyShell shell = new GroovyShell();
        vars.forEach(shell.getContext()::setVariable);
        try {
            return shell.evaluate(script);
        } catch (Exception e) {
            throw new RuntimeException("Groovy script execution failed", e);
        }
    }
}