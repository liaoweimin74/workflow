package com.workflow.engine.page;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.PageDataImportResultVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.form.bizdata.BizDataContext;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.page.entity.PageDefinition;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 页面数据视图 Excel 导入导出服务。
 *
 * <p><b>导出</b>：按视图列声明（schema.columns，默认取非 hidden 非 custom 列）构建表头，
 * 复用页面查询同款取数链路（dataSourceId → DataSourceDefinitionService.queryData /
 * formKey → BizDataService.query）分页拉全量，上限 {@link #MAX_EXPORT_ROWS} 行防 OOM，
 * 超限截断并由调用方在响应头标记；POI SXSSF 流式写出 .xlsx。
 *
 * <p><b>导入</b>：解析 .xlsx 表头 → 目标业务表单字段（显式 mapping → 字段 key → 字段 label），
 * 逐行经 {@link BizDataService#create}（与 DATA_INSERT 节点同款通用写入：
 * 必填校验 / JSON 列 / 日期归一 / data-picker 冗余 / 租户注入）插入，单行失败收集不中断；
 * 每行独立事务（本方法不开启事务），上限 {@link #MAX_IMPORT_ROWS} 行。
 */
@Service
public class PageDataExcelService {

    /** 单次导出行数上限（防 OOM；超出截断） */
    public static final int MAX_EXPORT_ROWS = 10_000;
    /** 导出分页拉取页大小 */
    public static final int EXPORT_PAGE_SIZE = 500;
    /** 单次导入数据行上限 */
    public static final int MAX_IMPORT_ROWS = 5_000;
    /** 导入/导出列数上限 */
    public static final int MAX_COLUMNS = 200;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final BizDataService bizDataService;
    private final BizDataSupport bizDataSupport;
    private final DataSourceDefinitionService dsService;
    private final ObjectMapper objectMapper;

    public PageDataExcelService(BizDataService bizDataService,
                                BizDataSupport bizDataSupport,
                                DataSourceDefinitionService dsService,
                                ObjectMapper objectMapper) {
        this.bizDataService = bizDataService;
        this.bizDataSupport = bizDataSupport;
        this.dsService = dsService;
        this.objectMapper = objectMapper;
    }

    /** 导出产物（xlsx 字节 + 实际行数 + 是否被上限截断） */
    public record ExportResult(byte[] xlsx, int rows, boolean truncated) {}

    // ==================== 导出 ====================

    /**
     * 导出视图当前查询结果为 .xlsx。
     *
     * @param page             已发布 VIEW 页面（含数据源绑定与 schema 列声明）
     * @param query            已过白名单的查询上下文（本方法仅接管分页参数）
     * @param requestedColumns 导出列 key 子集（可空 = 全部可见列）
     */
    public ExportResult export(PageDefinition page, BizDataQueryRequest query, List<String> requestedColumns) {
        List<ExportColumn> columns = resolveExportColumns(page, requestedColumns);
        if (columns.size() > MAX_COLUMNS) {
            throw new BusinessException(400, "导出列数超过上限 " + MAX_COLUMNS + " 列");
        }

        // 分页拉全量（上限 MAX_EXPORT_ROWS，超出截断防 OOM）
        List<BizDataVO> collected = new ArrayList<>();
        long total = -1;
        int pageNo = 1;
        while (collected.size() < MAX_EXPORT_ROWS) {
            query.setPage(pageNo);
            query.setSize(EXPORT_PAGE_SIZE);
            BizDataPageVO vo = queryOnce(page, query);
            if (vo.getRecords() == null || vo.getRecords().isEmpty()) {
                break;
            }
            collected.addAll(vo.getRecords());
            if (total < 0) {
                total = vo.getTotal();
            }
            if (collected.size() >= total) {
                break;
            }
            pageNo++;
        }
        boolean truncated = total > MAX_EXPORT_ROWS;
        if (collected.size() > MAX_EXPORT_ROWS) {
            collected = collected.subList(0, MAX_EXPORT_ROWS);
            truncated = true;
        }

        byte[] xlsx = writeWorkbook(columns, collected);
        return new ExportResult(xlsx, collected.size(), truncated);
    }

    /** 取数分支：dataSourceId（新协议）优先，formKey（兼容）回落 —— 与 PageQueryController.query 一致 */
    private BizDataPageVO queryOnce(PageDefinition page, BizDataQueryRequest query) {
        if (page.getDataSourceId() != null && !page.getDataSourceId().isBlank()) {
            return dsService.queryData(page.getDataSourceId(), query);
        }
        return bizDataService.query(page.getFormKey(), query);
    }

    /**
     * 解析导出列（列头 = label 缺省 key）：
     * 1. schema.columns 声明 → 候选 = 非 custom 列（含 hidden，显式指定可导），缺省取非 hidden；
     * 2. 未声明 columns 且绑定 formKey → 回落业务表单列（非 hidden 非子表列）；
     * 3. 皆无 → 400。
     * requestedColumns 非空时按其顺序过滤，未命中候选 → 400（防注入/越权取列）。
     */
    private List<ExportColumn> resolveExportColumns(PageDefinition page, List<String> requestedColumns) {
        LinkedHashSet<String> orderedKeys = new LinkedHashSet<>();
        Map<String, String> labelByKey = new LinkedHashMap<>();
        Set<String> defaultKeys = new LinkedHashSet<>();
        boolean declared = false;

        JsonNode columnsNode = schemaNode(page.getSchema(), "columns");
        if (columnsNode.isArray() && !columnsNode.isEmpty()) {
            declared = true;
            for (JsonNode column : columnsNode) {
                String key = column.path("key").asText("");
                if (key.isBlank() || column.path("custom").asBoolean(false)) {
                    continue;
                }
                orderedKeys.add(key);
                labelByKey.put(key, column.path("label").asText(key));
                if (!column.path("hidden").asBoolean(false)) {
                    defaultKeys.add(key);
                }
            }
        }
        if (!declared && page.getFormKey() != null && !page.getFormKey().isBlank()) {
            // 回落：业务表单列（动态表列白名单，天然防注入）
            BizDataContext ctx = bizDataSupport.loadContext(page.getFormKey());
            for (ColumnConfig c : ctx.columns()) {
                if (c.getKey() == null || c.isHidden()) {
                    continue;
                }
                orderedKeys.add(c.getKey());
                labelByKey.put(c.getKey(), c.getLabel() == null || c.getLabel().isBlank() ? c.getKey() : c.getLabel());
                defaultKeys.add(c.getKey());
            }
        }
        if (orderedKeys.isEmpty()) {
            throw new BusinessException(400, "页面未声明展示列，无法导出");
        }

        Set<String> chosen = new LinkedHashSet<>();
        if (requestedColumns != null && !requestedColumns.isEmpty()) {
            for (String key : requestedColumns) {
                if (key == null || key.isBlank()) {
                    continue;
                }
                if (!orderedKeys.contains(key)) {
                    throw new BusinessException(400, "导出列不在页面声明的展示列中: " + key);
                }
                chosen.add(key.trim());
            }
        } else {
            chosen.addAll(defaultKeys);
        }
        if (chosen.isEmpty()) {
            throw new BusinessException(400, "无可导出的展示列");
        }

        List<ExportColumn> out = new ArrayList<>(chosen.size());
        for (String key : chosen) {
            out.add(new ExportColumn(key, labelByKey.getOrDefault(key, key)));
        }
        return out;
    }

    /** 解析 schema 顶层节点（容错：空/非法 schema → missing node） */
    private JsonNode schemaNode(String schema, String field) {
        try {
            return objectMapper.readTree(schema == null || schema.isBlank() ? "{}" : schema).path(field);
        } catch (Exception e) {
            throw new BusinessException(400, "页面 schema 解析失败");
        }
    }

    /** SXSSF 流式写 xlsx（表头加粗灰底；行窗口 100 常驻内存） */
    private byte[] writeWorkbook(List<ExportColumn> columns, List<BizDataVO> rows) {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(100)) {
            SXSSFSheet sheet = wb.createSheet("data");

            CellStyle headerStyle = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            headerStyle.setFont(bold);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle dateStyle = wb.createCellStyle();
            dateStyle.setDataFormat(wb.createDataFormat().getFormat("yyyy-mm-dd hh:mm:ss"));
            CellStyle dateOnlyStyle = wb.createCellStyle();
            dateOnlyStyle.setDataFormat(wb.createDataFormat().getFormat("yyyy-mm-dd"));

            Row header = sheet.createRow(0);
            for (int i = 0; i < columns.size(); i++) {
                Cell cell = header.createCell(i);
                cell.setCellValue(columns.get(i).label());
                cell.setCellStyle(headerStyle);
            }
            for (int r = 0; r < rows.size(); r++) {
                Row row = sheet.createRow(r + 1);
                Map<String, Object> data = rows.get(r).getData();
                for (int c = 0; c < columns.size(); c++) {
                    writeCellValue(row.createCell(c), data == null ? null : data.get(columns.get(c).key()),
                            dateStyle, dateOnlyStyle);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BusinessException(500, "导出 Excel 生成失败: " + e.getMessage());
        }
    }

    /** 行值 → 单元格（保留类型；JSON/结构化值序列化为文本） */
    private void writeCellValue(Cell cell, Object value, CellStyle dateStyle, CellStyle dateOnlyStyle) {
        if (value == null) {
            return;
        }
        if (value instanceof String s) {
            cell.setCellValue(s);
        } else if (value instanceof LocalDateTime ldt) {
            cell.setCellValue(ldt);
            cell.setCellStyle(dateStyle);
        } else if (value instanceof LocalDate ld) {
            cell.setCellValue(ld);
            cell.setCellStyle(dateOnlyStyle);
        } else if (value instanceof Boolean b) {
            cell.setCellValue(b);
        } else if (value instanceof BigDecimal bd) {
            cell.setCellValue(bd.doubleValue());
        } else if (value instanceof Number n) {
            cell.setCellValue(n.doubleValue());
        } else if (value instanceof Map || value instanceof List || value instanceof Object[] objects) {
            cell.setCellValue(toJsonText(value));
        } else {
            cell.setCellValue(String.valueOf(value));
        }
    }

    private String toJsonText(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    // ==================== 导入 ====================

    /**
     * 批量导入 .xlsx 到目标业务表单（逐行独立事务，单行失败收集不中断）。
     *
     * @param formKey 目标业务表单 key（页面绑定；表/列经 loadContext 白名单校验，防注入）
     * @param mapping 显式表头映射 {表头文本 → 字段 key}（可空）
     * @param in      xlsx 输入流
     */
    public PageDataImportResultVO importRows(String formKey, Map<String, String> mapping, InputStream in) {
        BizDataContext ctx = bizDataSupport.loadContext(formKey);
        Map<String, ColumnConfig> colByKey = new LinkedHashMap<>();
        Map<String, String> keyByLabel = new LinkedHashMap<>();
        for (ColumnConfig c : ctx.columns()) {
            if (c.getKey() == null || (c.getSubColumns() != null && !c.getSubColumns().isEmpty())) {
                continue;
            }
            colByKey.put(c.getKey(), c);
            if (c.getLabel() != null && !c.getLabel().isBlank() && !keyByLabel.containsKey(c.getLabel())) {
                keyByLabel.put(c.getLabel(), c.getKey());
            }
        }

        PageDataImportResultVO result = new PageDataImportResultVO();
        DataFormatter formatter = new DataFormatter();
        try (Workbook wb = WorkbookFactory.create(in)) {
            if (wb instanceof HSSFWorkbook) {
                throw new BusinessException(400, "仅支持 .xlsx 格式，不接受旧版 .xls");
            }
            Sheet sheet = wb.getSheetAt(0);
            if (sheet == null || sheet.getRow(0) == null) {
                throw new BusinessException(400, "缺少表头行（首行）");
            }

            // 表头 → 目标字段映射（显式 mapping → 字段 key → 字段 label）
            Map<Integer, String> cellToKey = new LinkedHashMap<>();
            Row headerRow = sheet.getRow(0);
            int headerCount = Math.min(headerRow.getLastCellNum(), MAX_COLUMNS);
            for (int i = 0; i < headerCount; i++) {
                String header = formatter.formatCellValue(headerRow.getCell(i)).trim();
                if (header.isEmpty()) {
                    continue;
                }
                String key = resolveHeaderKey(header, mapping, colByKey, keyByLabel);
                if (cellToKey.containsValue(key)) {
                    throw new BusinessException(400, "表头映射到重复字段: " + key);
                }
                cellToKey.put(i, key);
            }
            if (cellToKey.isEmpty()) {
                throw new BusinessException(400, "无可导入列（表头均未映射到业务字段）");
            }

            int lastRowNum = sheet.getLastRowNum(); // 0-based；数据行区间 [1, lastRowNum]
            if (lastRowNum > MAX_IMPORT_ROWS) {
                throw new BusinessException(400, "数据行超过单次导入上限 " + MAX_IMPORT_ROWS
                        + " 行（当前 " + lastRowNum + " 行），请拆分文件");
            }

            FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();
            for (int r = 1; r <= lastRowNum; r++) {
                // 行解析（含单元格类型转换）与写入同置一个 try：单行任何失败收集后继续，不中断整批
                try {
                    Map<String, Object> data = readRowData(sheet.getRow(r), cellToKey, colByKey, formatter, evaluator);
                    if (data == null) {
                        result.setSkipped(result.getSkipped() + 1);
                        continue;
                    }
                    bizDataService.create(formKey, data);
                    result.setSuccess(result.getSuccess() + 1);
                } catch (Exception e) {
                    result.setFailed(result.getFailed() + 1);
                    result.getErrors().add(new PageDataImportResultVO.RowError(r + 1, errorMessage(e)));
                }
            }
            result.setTotal(result.getSuccess() + result.getFailed());
            return result;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, "Excel 文件解析失败: " + errorMessage(e));
        }
    }

    /** 表头解析到字段 key：显式 mapping → 字段 key 直等 → 字段 label 等价；未命中 → 400 */
    private String resolveHeaderKey(String header, Map<String, String> mapping,
                                    Map<String, ColumnConfig> colByKey, Map<String, String> keyByLabel) {
        String key = mapping != null ? mapping.get(header) : null;
        if (key != null && !key.isBlank()) {
            key = key.trim();
            if (!colByKey.containsKey(key)) {
                throw new BusinessException(400, "映射目标字段不存在: " + header + " → " + key);
            }
            return key;
        }
        if (colByKey.containsKey(header)) {
            return header;
        }
        String byLabel = keyByLabel.get(header);
        if (byLabel != null) {
            return byLabel;
        }
        throw new BusinessException(400, "表头无法映射到业务字段: " + header
                + "（可用 mapping 参数显式映射）");
    }

    /** 单行 → {字段: 值}；全空行返回 null（跳过）；单元格值按目标列类型转换 */
    private Map<String, Object> readRowData(Row row, Map<Integer, String> cellToKey,
                                            Map<String, ColumnConfig> colByKey,
                                            DataFormatter formatter, FormulaEvaluator evaluator) {
        Map<String, Object> data = new LinkedHashMap<>();
        if (row == null) {
            return null;
        }
        for (Map.Entry<Integer, String> e : cellToKey.entrySet()) {
            Object v = cellValue(row.getCell(e.getKey()), colByKey.get(e.getValue()), formatter, evaluator);
            if (v != null) {
                data.put(e.getValue(), v);
            }
        }
        return data.isEmpty() ? null : data;
    }

    /**
     * 单元格值转换（对齐 BizDataService.create 的写入语义）：
     * - 文本/布尔：原样（trim，空→null）；JSON 列传 JSON 文本由 createGeneric 校验；
     * - 日期格式数值：DATE → yyyy-MM-dd / 其余 → yyyy-MM-dd HH:mm:ss（createGeneric 日期归一兼容）；
     * - 普通数值：INT/TINYINT 取整（非整数拒绝）、DECIMAL 取 BigDecimal、其余列走格式化文本
     *   （保留手机号/编码等长数字字符串形态）；
     * - 公式：按求值结果类型递归。
     */
    private Object cellValue(Cell cell, ColumnConfig column, DataFormatter formatter, FormulaEvaluator evaluator) {
        if (cell == null) {
            return null;
        }
        CellType type = cell.getCellType();
        if (type == CellType.FORMULA) {
            type = evaluator.evaluateFormulaCell(cell);
        }
        String columnType = column == null ? "" : (column.getColumnType() == null ? "" : column.getColumnType().toUpperCase());
        return switch (type) {
            case BLANK -> null;
            case STRING -> blankToNull(formatter.formatCellValue(cell));
            case BOOLEAN -> cell.getBooleanCellValue();
            case ERROR -> throw new BusinessException(400,
                    "第 " + (cell.getRowIndex() + 1) + " 行第 " + (cell.getColumnIndex() + 1) + " 列为错误值");
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    LocalDateTime ldt = cell.getLocalDateTimeCellValue();
                    yield "DATE".equals(columnType) ? ldt.format(DATE_FMT) : ldt.format(DATETIME_FMT);
                }
                double d = cell.getNumericCellValue();
                if ("INT".equals(columnType) || "TINYINT".equals(columnType)) {
                    if (d != Math.rint(d)) {
                        throw new BusinessException(400, "字段 " + (column.getLabel() == null ? column.getKey() : column.getLabel())
                                + " 须为整数: " + d);
                    }
                    yield (long) d;
                }
                if ("DECIMAL".equals(columnType)) {
                    yield BigDecimal.valueOf(d);
                }
                yield blankToNull(formatter.formatCellValue(cell));
            }
            default -> null;
        };
    }

    private String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private String errorMessage(Exception e) {
        String msg = e.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = e.getClass().getSimpleName();
        }
        msg = msg.replaceAll("\\s+", " ").trim();
        return msg.length() > 300 ? msg.substring(0, 300) + "..." : msg;
    }

    /** 导出列（key + 表头文本） */
    private record ExportColumn(String key, String label) {}
}
