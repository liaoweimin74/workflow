package com.workflow.common.constant;

public class GlobalConstant {
    public static final String TOKEN_HEADER = "Authorization";
    public static final String TOKEN_PREFIX = "Bearer ";
    public static final String ACCESS_TOKEN_KEY = "access_token";
    public static final String REFRESH_TOKEN_KEY = "refresh_token";
    public static final String LOGIN_USER_KEY = "login_user";
    public static final String REDIS_REFRESH_TOKEN_PREFIX = "refresh_token:";
    public static final String REDIS_BLACKLIST_PREFIX = "blacklist:";
    public static final String REDIS_DICT_PREFIX = "dict:";
    public static final long ACCESS_TOKEN_EXPIRE = 30; // minutes
    public static final long REFRESH_TOKEN_EXPIRE = 7; // days
    public static final String DEFAULT_PASSWORD = "123456";
    public static final long SUPER_ADMIN_ROLE_ID = 1L;
    public static final int DELETED_NO = 0;
    public static final int DELETED_YES = 1;
}