-- 对比两个库的表与列结构差异，只列出「两边不一致」的部分。
-- 用法：mysql ... -t < tools/schema-diff.sql
SET @a = 'workflow_node_schema_probe';   -- 迁移-only 干净库
SET @b = 'workflow_v6';                  -- Java 启动过（Hibernate ddl-auto=update）的库

SELECT '仅存在于 B（Java 自动补的）' AS 差异类型, t.TABLE_NAME, t.COLUMN_NAME,
       t.COLUMN_TYPE, t.IS_NULLABLE, IFNULL(t.COLUMN_DEFAULT, 'NULL') AS 默认值
FROM information_schema.COLUMNS t
LEFT JOIN information_schema.COLUMNS s
  ON s.TABLE_SCHEMA = @a AND s.TABLE_NAME = t.TABLE_NAME AND s.COLUMN_NAME = t.COLUMN_NAME
WHERE t.TABLE_SCHEMA = @b AND s.COLUMN_NAME IS NULL
ORDER BY t.TABLE_NAME, t.COLUMN_NAME;

SELECT '仅存在于 A（迁移建、B 没有）' AS 差异类型, s.TABLE_NAME, s.COLUMN_NAME,
       s.COLUMN_TYPE, s.IS_NULLABLE, IFNULL(s.COLUMN_DEFAULT, 'NULL') AS 默认值
FROM information_schema.COLUMNS s
LEFT JOIN information_schema.COLUMNS t
  ON t.TABLE_SCHEMA = @b AND t.TABLE_NAME = s.TABLE_NAME AND t.COLUMN_NAME = s.COLUMN_NAME
WHERE s.TABLE_SCHEMA = @a AND t.COLUMN_NAME IS NULL
ORDER BY s.TABLE_NAME, s.COLUMN_NAME;

SELECT '类型/可空性不一致' AS 差异类型, s.TABLE_NAME, s.COLUMN_NAME,
       CONCAT(s.COLUMN_TYPE, ' / ', s.IS_NULLABLE) AS A侧,
       CONCAT(t.COLUMN_TYPE, ' / ', t.IS_NULLABLE) AS B侧
FROM information_schema.COLUMNS s
JOIN information_schema.COLUMNS t
  ON t.TABLE_SCHEMA = @b AND t.TABLE_NAME = s.TABLE_NAME AND t.COLUMN_NAME = s.COLUMN_NAME
WHERE s.TABLE_SCHEMA = @a
  AND (s.COLUMN_TYPE <> t.COLUMN_TYPE OR s.IS_NULLABLE <> t.IS_NULLABLE)
ORDER BY s.TABLE_NAME, s.COLUMN_NAME;

SELECT '仅存在于 B 的表' AS 差异类型, t.TABLE_NAME
FROM information_schema.TABLES t
LEFT JOIN information_schema.TABLES s ON s.TABLE_SCHEMA = @a AND s.TABLE_NAME = t.TABLE_NAME
WHERE t.TABLE_SCHEMA = @b AND s.TABLE_NAME IS NULL
ORDER BY t.TABLE_NAME;

SELECT '仅存在于 A 的表' AS 差异类型, s.TABLE_NAME
FROM information_schema.TABLES s
LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = @b AND t.TABLE_NAME = s.TABLE_NAME
WHERE s.TABLE_SCHEMA = @a AND t.TABLE_NAME IS NULL
ORDER BY s.TABLE_NAME;
