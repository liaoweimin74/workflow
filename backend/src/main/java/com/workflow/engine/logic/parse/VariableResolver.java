package com.workflow.engine.logic.parse;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class VariableResolver {

    private static final Pattern PLACEHOLDER_PATTERN = Pattern.compile("\\{\\{\\s*(\\w+)\\s*}}");

    public String resolve(String text, Map<String, Object> vars) {
        Matcher matcher = PLACEHOLDER_PATTERN.matcher(text);
        StringBuilder sb = new StringBuilder();
        int last = 0;
        while (matcher.find()) {
            sb.append(text, last, matcher.start());
            String varName = matcher.group(1);
            Object value = vars.get(varName);
            sb.append(value != null ? value.toString() : "");
            last = matcher.end();
        }
        sb.append(text.substring(last));
        return sb.toString();
    }
}