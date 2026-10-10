package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.controller.PageDataExcelController;
import com.workflow.api.controller.PageViewQuerySupport;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.PageDataExportRequest;
import com.workflow.api.dto.PageDataImportResultVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.form.bizdata.BizDataContext;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.page.entity.PageDefinition;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PageDataExcelController / PageDataExcelService 单元测试（纯 Mockito + 真实 POI）。
 *
 * <p>覆盖：导出成功（响应头 + 内容非空 + 分页拉全量 + 列白名单）、导出超限截断、
 * 导入成功（内存构造 xlsx，断言插入数据与统计）、导入部分失败（类型错/单行失败收集不中断）、
 * 非法表名被拒、表头未映射被拒、行数/文件/格式上限被拒。
 */
class PageDataExcelControllerTest {

    private static final String VIEW_SCHEMA = """
            {"searchFields":[{"key":"name","label":"姓名","matchType":"like"}],
             "columns":[{"key":"name","label":"姓名"},{"key":"age","label":"年龄"},
                        {"key":"hidden_col","label":"隐藏列","hidden":true},
                        {"key":"calc","label":"计算列","custom":true}],
             "sortableFields":["name"]}
            """;

    private PageDefinitionService pageDefService;
    private BizDataService bizDataService;
    private BizDataSupport bizDataSupport;
    private DataSourceDefinitionService dsService;
    private PageAccessGuard pageAccessGuard;
    private PageDataExcelService service;
    private PageDataExcelController controller;

    @BeforeEach
    void setUp() {
        pageDefService = mock(PageDefinitionService.class);
        bizDataService = mock(BizDataService.class);
        bizDataSupport = mock(BizDataSupport.class);
        dsService = mock(DataSourceDefinitionService.class);
        pageAccessGuard = mock(PageAccessGuard.class);
        service = new PageDataExcelService(bizDataService, bizDataSupport, dsService, new ObjectMapper());
        controller = new PageDataExcelController(pageDefService, pageAccessGuard,
                new PageViewQuerySupport(new ObjectMapper()), service, dsService, new ObjectMapper());

        when(pageDefService.getPublishedByKey("emp_view")).thenReturn(viewPage());
        // 导入目标业务表上下文（列白名单）
        when(bizDataSupport.loadContext("emp_profile")).thenReturn(new BizDataContext(
                "wf_biz_emp_profile", "emp_profile",
                List.of(col("name", "姓名", "VARCHAR", true), col("age", "年龄", "INT", false),
                        col("salary", "薪资", "DECIMAL", false), col("joined_at", "入职日期", "DATE", false)),
                List.of("name", "age", "salary", "joined_at"), Map.of()));
    }

    private static PageDefinition viewPage() {
        PageDefinition page = new PageDefinition();
        page.setType("VIEW");
        page.setFormKey("emp_profile");
        page.setSchema(VIEW_SCHEMA);
        page.setName("员工视图");
        return page;
    }

    private static ColumnConfig col(String key, String label, String columnType, boolean required) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(label);
        c.setColumnType(columnType);
        c.setRequired(required);
        return c;
    }

    private static BizDataVO bizRow(Object... kv) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            data.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return new BizDataVO("id-" + data.hashCode(), data, 1, null, null);
    }

    /** 内存构造 xlsx */
    private static byte[] xlsx(Consumer<Sheet> writer) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("data");
            writer.accept(sheet);
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Row headerRow(Sheet sheet, String... headers) {
        Row row = sheet.createRow(0);
        for (int i = 0; i < headers.length; i++) {
            row.createCell(i).setCellValue(headers[i]);
        }
        return row;
    }

    // ==================== 导出：Controller ====================

    @Test
    void export_returnsXlsxWithHeadersAndBody() {
        byte[] bytes = "fake-xlsx-bytes".getBytes(StandardCharsets.UTF_8);
        PageDataExcelService spyService = mock(PageDataExcelService.class);
        when(spyService.export(any(), any(), any()))
                .thenReturn(new PageDataExcelService.ExportResult(bytes, 3, false));
        PageDataExcelController withSpy = new PageDataExcelController(pageDefService, pageAccessGuard,
                new PageViewQuerySupport(new ObjectMapper()), spyService, dsService, new ObjectMapper());

        PageDataExportRequest req = new PageDataExportRequest();
        req.setFilename("员工/名单"); // 含非法路径字符 → 清洗
        ResponseEntity<byte[]> resp = withSpy.export("emp_view", req);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        HttpHeaders headers = resp.getHeaders();
        assertThat(headers.getContentType())
                .isEqualTo(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        ContentDisposition disposition = headers.getContentDisposition();
        assertThat(disposition.getType()).isEqualTo("attachment");
        assertThat(headers.getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("filename*=UTF-8''");
        assertThat(disposition.getFilename()).isEqualTo("员工_名单.xlsx");
        assertThat(resp.getBody()).isNotEmpty().isSameAs(bytes);
        assertThat(headers.get("X-Export-Truncated")).isNull();
    }

    @Test
    void export_truncated_setsWarningHeader() {
        PageDataExcelService spyService = mock(PageDataExcelService.class);
        when(spyService.export(any(), any(), any()))
                .thenReturn(new PageDataExcelService.ExportResult(new byte[]{1}, 10000, true));
        PageDataExcelController withSpy = new PageDataExcelController(pageDefService, pageAccessGuard,
                new PageViewQuerySupport(new ObjectMapper()), spyService, dsService, new ObjectMapper());

        ResponseEntity<byte[]> resp = withSpy.export("emp_view", new PageDataExportRequest());

        assertThat(resp.getHeaders().getFirst("X-Export-Truncated")).isEqualTo("true");
    }

    @Test
    void export_onPageWithoutTableComponent_rejected400() {
        PageDefinition page = new PageDefinition();
        page.setType("PAGE");
        page.setSchema("{}");
        when(pageDefService.getPublishedByKey("custom_page")).thenReturn(page);

        assertThatThrownBy(() -> controller.export("custom_page", new PageDataExportRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未包含数据表格组件");
    }

    @Test
    void export_onPageWithoutBinding_rejected400() {
        PageDefinition page = new PageDefinition();
        page.setType("VIEW");
        page.setSchema(VIEW_SCHEMA);
        when(pageDefService.getPublishedByKey("naked_view")).thenReturn(page);

        assertThatThrownBy(() -> controller.export("naked_view", new PageDataExportRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未绑定数据源");
    }

    @Test
    void export_filterOutsideWhitelist_rejected400() {
        PageDataExportRequest req = new PageDataExportRequest();
        req.setFilter("{\"hack\":\"x\"}");

        assertThatThrownBy(() -> controller.export("emp_view", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("筛选字段不在页面声明白名单: hack");
    }

    @Test
    void export_sortOutsideWhitelist_rejected400() {
        PageDataExportRequest req = new PageDataExportRequest();
        req.setSort("salary");

        assertThatThrownBy(() -> controller.export("emp_view", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("排序字段不在页面声明的可排序字段中: salary");
    }

    // ==================== 导出：Service ====================

    @Test
    void exportService_pullsAllPages_writesWorkbookWithDeclaredColumns() throws IOException {
        List<Integer> pages = new ArrayList<>();
        List<Integer> sizes = new ArrayList<>();
        when(bizDataService.query(anyString(), any(BizDataQueryRequest.class))).thenAnswer(inv -> {
            BizDataQueryRequest q = inv.getArgument(1);
            pages.add(q.getPage());
            sizes.add(q.getSize());
            BizDataPageVO vo = new BizDataPageVO();
            vo.setTotal(3);
            vo.setPage(q.getPage());
            vo.setSize(q.getSize());
            if (q.getPage() == 1) {
                vo.setRecords(List.of(
                        bizRow("name", "张三", "age", 30, "hidden_col", "h", "calc", "c"),
                        bizRow("name", "李四", "age", 28)));
            } else {
                vo.setRecords(List.of(bizRow("name", "王五", "age", 25)));
            }
            return vo;
        });

        PageDataExcelService.ExportResult result =
                service.export(viewPage(), new BizDataQueryRequest(), null);

        // 分页拉全量：page 1 → 2（size=500；请求对象被循环复用，以应答内记录为准）
        verify(dsService, never()).queryData(anyString(), any());
        org.mockito.Mockito.verify(bizDataService, org.mockito.Mockito.times(2))
                .query(eq("emp_profile"), any(BizDataQueryRequest.class));
        assertThat(pages).containsExactly(1, 2);
        assertThat(sizes).containsExactly(PageDataExcelService.EXPORT_PAGE_SIZE, PageDataExcelService.EXPORT_PAGE_SIZE);

        assertThat(result.rows()).isEqualTo(3);
        assertThat(result.truncated()).isFalse();

        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(result.xlsx()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("姓名");
            assertThat(sheet.getRow(0).getCell(1).getStringCellValue()).isEqualTo("年龄");
            assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short) 2); // hidden/custom 列缺省不导出
            assertThat(sheet.getRow(1).getCell(0).getStringCellValue()).isEqualTo("张三");
            assertThat(sheet.getRow(1).getCell(1).getNumericCellValue()).isEqualTo(30.0);
            assertThat(sheet.getLastRowNum()).isEqualTo(3);
        }
    }

    @Test
    void exportService_requestedColumnSubset_includesHiddenDeclaredColumn() throws IOException {
        when(bizDataService.query(anyString(), any(BizDataQueryRequest.class))).thenAnswer(inv -> {
            BizDataPageVO vo = new BizDataPageVO();
            vo.setTotal(1);
            vo.setRecords(List.of(bizRow("name", "张三", "hidden_col", "secret")));
            return vo;
        });

        PageDataExcelService.ExportResult result =
                service.export(viewPage(), new BizDataQueryRequest(), List.of("hidden_col", "name"));

        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(result.xlsx()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("隐藏列");
            assertThat(sheet.getRow(1).getCell(0).getStringCellValue()).isEqualTo("secret");
            assertThat(sheet.getRow(1).getCell(1).getStringCellValue()).isEqualTo("张三");
        }
    }

    @Test
    void exportService_unknownRequestedColumn_rejected400() {
        assertThatThrownBy(() -> service.export(viewPage(), new BizDataQueryRequest(), List.of("evil_col")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("导出列不在页面声明的展示列中: evil_col");
    }

    @Test
    void exportService_dataSourceBoundView_usesDataSourceSpi() {
        PageDefinition page = viewPage();
        page.setDataSourceId("ds_workflow_001");
        when(dsService.queryData(eq("ds_workflow_001"), any(BizDataQueryRequest.class))).thenAnswer(inv -> {
            BizDataPageVO vo = new BizDataPageVO();
            vo.setTotal(1);
            vo.setRecords(List.of(bizRow("name", "张三", "age", 30)));
            return vo;
        });

        PageDataExcelService.ExportResult result = service.export(page, new BizDataQueryRequest(), null);

        assertThat(result.rows()).isEqualTo(1);
        verify(dsService).queryData(eq("ds_workflow_001"), any(BizDataQueryRequest.class));
        verify(bizDataService, never()).query(anyString(), any());
    }

    @Test
    void exportService_exceedsMaxRows_truncated() throws IOException {
        when(bizDataService.query(anyString(), any(BizDataQueryRequest.class))).thenAnswer(inv -> {
            BizDataQueryRequest q = inv.getArgument(1);
            BizDataPageVO vo = new BizDataPageVO();
            vo.setTotal(PageDataExcelService.MAX_EXPORT_ROWS + 1L);
            vo.setPage(q.getPage());
            vo.setSize(q.getSize());
            List<BizDataVO> records = new ArrayList<>();
            for (int i = 0; i < PageDataExcelService.EXPORT_PAGE_SIZE; i++) {
                records.add(bizRow("name", "user-" + q.getPage() + "-" + i, "age", i));
            }
            vo.setRecords(records);
            return vo;
        });

        PageDataExcelService.ExportResult result =
                service.export(viewPage(), new BizDataQueryRequest(), null);

        assertThat(result.rows()).isEqualTo(PageDataExcelService.MAX_EXPORT_ROWS);
        assertThat(result.truncated()).isTrue();
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(result.xlsx()))) {
            assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(PageDataExcelService.MAX_EXPORT_ROWS);
        }
    }

    // ==================== 导入：Controller ====================

    @Test
    void import_success_returnsStatistics() {
        MockMultipartFile file = new MockMultipartFile("file", "名单.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                xlsx(sheet -> {
                    headerRow(sheet, "姓名", "age");
                    Row r1 = sheet.createRow(1);
                    r1.createCell(0).setCellValue("张三");
                    r1.createCell(1).setCellValue(30);
                    Row r2 = sheet.createRow(2);
                    r2.createCell(0).setCellValue("李四");
                    r2.createCell(1).setCellValue(28);
                }));

        PageDataImportResultVO result = controller.importExcel("emp_view", file, null).getData();

        assertThat(result.getTotal()).isEqualTo(2);
        assertThat(result.getSuccess()).isEqualTo(2);
        assertThat(result.getFailed()).isZero();
        assertThat(result.getErrors()).isEmpty();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        org.mockito.Mockito.verify(bizDataService, org.mockito.Mockito.times(2))
                .create(eq("emp_profile"), captor.capture());
        assertThat(captor.getAllValues().get(0))
                .containsEntry("name", "张三")
                .containsEntry("age", 30L);
        assertThat(captor.getAllValues().get(1))
                .containsEntry("name", "李四")
                .containsEntry("age", 28L);
    }

    @Test
    void import_onViewWithoutFormKey_rejected400() {
        PageDefinition page = new PageDefinition();
        page.setType("VIEW");
        page.setDataSourceId("ds_workflow_001");
        page.setSchema(VIEW_SCHEMA);
        when(pageDefService.getPublishedByKey("ds_view")).thenReturn(page);
        MockMultipartFile file = new MockMultipartFile("file", "a.xlsx", null, new byte[]{1});

        assertThatThrownBy(() -> controller.importExcel("ds_view", file, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面未绑定业务表单，无法导入");
    }

    @Test
    void import_rejectsEmptyFile() {
        MockMultipartFile file = new MockMultipartFile("file", "a.xlsx", null, new byte[0]);

        assertThatThrownBy(() -> controller.importExcel("emp_view", file, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未上传文件");
    }

    @Test
    void import_rejectsNonXlsxExtension() {
        MockMultipartFile file = new MockMultipartFile("file", "a.csv", null, new byte[]{1, 2});

        assertThatThrownBy(() -> controller.importExcel("emp_view", file, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("仅支持 .xlsx");
    }

    @Test
    void import_rejectsOversizeFile() {
        MockMultipartFile file = new MockMultipartFile("file", "a.xlsx", null, new byte[1]) {
            @Override
            public long getSize() {
                return 21L * 1024 * 1024;
            }
        };

        assertThatThrownBy(() -> controller.importExcel("emp_view", file, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("20MB");
    }

    @Test
    void import_invalidMappingJson_rejected400() {
        MockMultipartFile file = new MockMultipartFile("file", "a.xlsx", null, new byte[]{1});

        assertThatThrownBy(() -> controller.importExcel("emp_view", file, "not-json"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("mapping 参数非法");
    }

    // ==================== 导入：Service ====================

    @Test
    void importService_mapsHeaderByLabelAndKey_convertsDateAndDecimal() {
        byte[] bytes;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("data");
            headerRow(sheet, "姓名", "age", "薪资", "入职日期");
            org.apache.poi.ss.usermodel.CellStyle dateStyle = wb.createCellStyle();
            dateStyle.setDataFormat(wb.createDataFormat().getFormat("yyyy-mm-dd"));
            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue("张三");
            r1.createCell(1).setCellValue(30);
            r1.createCell(2).setCellValue(8500.5);
            var dateCell = r1.createCell(3);
            dateCell.setCellValue(java.time.LocalDateTime.of(2026, 1, 2, 0, 0));
            dateCell.setCellStyle(dateStyle);
            wb.write(out);
            bytes = out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        PageDataImportResultVO result = service.importRows("emp_profile", null, new ByteArrayInputStream(bytes));

        assertThat(result.getTotal()).isEqualTo(1);
        assertThat(result.getSuccess()).isEqualTo(1);
        assertThat(result.getFailed()).isZero();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(bizDataService).create(eq("emp_profile"), captor.capture());
        Map<String, Object> inserted = captor.getValue();
        assertThat(inserted)
                .containsEntry("name", "张三")
                .containsEntry("age", 30L)
                .containsEntry("salary", java.math.BigDecimal.valueOf(8500.5))
                .containsEntry("joined_at", "2026-01-02");
    }

    @Test
    void importService_explicitMapping_applied() {
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "全名");
            sheet.createRow(1).createCell(0).setCellValue("张三");
        });

        PageDataImportResultVO result = service.importRows("emp_profile",
                Map.of("全名", "name"), new ByteArrayInputStream(bytes));

        assertThat(result.getSuccess()).isEqualTo(1);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(bizDataService).create(eq("emp_profile"), captor.capture());
        assertThat(captor.getValue()).containsEntry("name", "张三");
    }

    @Test
    void importService_typeErrorRow_collectedOthersContinue() {
        // 第 2 行年龄为小数（类型错），第 3 行正常 → 单行失败收集不中断
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名", "age");
            Row bad = sheet.createRow(1);
            bad.createCell(0).setCellValue("张三");
            bad.createCell(1).setCellValue(3.5);
            Row good = sheet.createRow(2);
            good.createCell(0).setCellValue("李四");
            good.createCell(1).setCellValue(28);
        });

        PageDataImportResultVO result = service.importRows("emp_profile", null, new ByteArrayInputStream(bytes));

        assertThat(result.getTotal()).isEqualTo(2);
        assertThat(result.getSuccess()).isEqualTo(1);
        assertThat(result.getFailed()).isEqualTo(1);
        assertThat(result.getErrors()).hasSize(1);
        assertThat(result.getErrors().get(0).getRow()).isEqualTo(2); // Excel 行号
        assertThat(result.getErrors().get(0).getMessage()).contains("须为整数");
        // 好行仍被插入
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        org.mockito.Mockito.verify(bizDataService, org.mockito.Mockito.times(1))
                .create(eq("emp_profile"), captor.capture());
        assertThat(captor.getValue()).containsEntry("name", "李四");
    }

    @Test
    void importService_uniqueKeyConflict_collectedWithRowNumber() {
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名");
            sheet.createRow(1).createCell(0).setCellValue("重复名");
        });
        doThrow(new RuntimeException("Duplicate entry '张三' for key 'uk_name'"))
                .when(bizDataService).create(eq("emp_profile"), anyMap());

        PageDataImportResultVO result = service.importRows("emp_profile", null, new ByteArrayInputStream(bytes));

        assertThat(result.getFailed()).isEqualTo(1);
        assertThat(result.getSuccess()).isZero();
        assertThat(result.getErrors()).hasSize(1);
        assertThat(result.getErrors().get(0).getRow()).isEqualTo(2);
        assertThat(result.getErrors().get(0).getMessage()).contains("Duplicate entry");
    }

    @Test
    void importService_businessRuleFailure_collected() {
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名");
            sheet.createRow(1).createCell(0).setCellValue("坏行");
            sheet.createRow(2).createCell(0).setCellValue("好行");
        });
        AtomicInteger n = new AtomicInteger();
        when(bizDataService.create(anyString(), anyMap())).thenAnswer(inv -> {
            Map<String, Object> data = inv.getArgument(1);
            if ("坏行".equals(data.get("name"))) {
                throw new BusinessException(400, "必填字段不能为空: 年龄");
            }
            n.incrementAndGet();
            return null;
        });

        PageDataImportResultVO result = service.importRows("emp_profile", null, new ByteArrayInputStream(bytes));

        assertThat(result.getSuccess()).isEqualTo(1);
        assertThat(result.getFailed()).isEqualTo(1);
        assertThat(result.getErrors()).hasSize(1);
        assertThat(result.getErrors().get(0).getRow()).isEqualTo(2);
        assertThat(result.getErrors().get(0).getMessage()).contains("必填字段不能为空");
    }

    @Test
    void importService_blankRow_skipped() {
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名", "age");
            sheet.createRow(1).createCell(0).setCellValue("张三");
            sheet.createRow(2); // 全空行
        });

        PageDataImportResultVO result = service.importRows("emp_profile", null, new ByteArrayInputStream(bytes));

        assertThat(result.getTotal()).isEqualTo(1);
        assertThat(result.getSuccess()).isEqualTo(1);
        assertThat(result.getSkipped()).isEqualTo(1);
        verify(bizDataService, org.mockito.Mockito.times(1)).create(anyString(), anyMap());
    }

    @Test
    void importService_unknownHeader_rejected400() {
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名", "未知列");
            sheet.createRow(1).createCell(0).setCellValue("张三");
        });

        assertThatThrownBy(() -> service.importRows("emp_profile", null, new ByteArrayInputStream(bytes)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("表头无法映射到业务字段: 未知列");
    }

    @Test
    void importService_illegalFormKey_rejected400() {
        when(bizDataSupport.loadContext("1bad key")).thenThrow(new BusinessException(400, "非法表单 key: 1bad key"));
        byte[] bytes = xlsx(sheet -> headerRow(sheet, "姓名"));

        assertThatThrownBy(() -> service.importRows("1bad key", null, new ByteArrayInputStream(bytes)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("非法表单 key");
        verify(bizDataService, never()).create(anyString(), anyMap());
    }

    @Test
    void importService_rowLimitExceeded_rejected400() {
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名");
            for (int i = 1; i <= PageDataExcelService.MAX_IMPORT_ROWS + 1; i++) {
                sheet.createRow(i).createCell(0).setCellValue("u" + i);
            }
        });

        assertThatThrownBy(() -> service.importRows("emp_profile", null, new ByteArrayInputStream(bytes)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("超过单次导入上限 5000 行");
        verify(bizDataService, never()).create(anyString(), anyMap());
    }

    @Test
    void importService_notXlsxContent_rejected400() {
        byte[] fake = "this is not an excel file".getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> service.importRows("emp_profile", null, new ByteArrayInputStream(fake)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Excel 文件解析失败");
    }

    @Test
    void importService_numericCellOnTextColumn_staysText() {
        // 手机号列（VARCHAR）填数值单元格 → 文本保留完整数字，避免科学计数/精度丢失
        when(bizDataSupport.loadContext("emp_profile")).thenReturn(new BizDataContext(
                "wf_biz_emp_profile", "emp_profile",
                List.of(col("name", "姓名", "VARCHAR", true), col("phone", "手机号", "VARCHAR", false)),
                List.of("name", "phone"), Map.of()));
        byte[] bytes = xlsx(sheet -> {
            headerRow(sheet, "姓名", "phone");
            Row r = sheet.createRow(1);
            r.createCell(0).setCellValue("张三");
            r.createCell(1).setCellValue(13800138000L);
        });

        PageDataImportResultVO result = service.importRows("emp_profile", null, new ByteArrayInputStream(bytes));

        assertThat(result.getSuccess()).isEqualTo(1);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(bizDataService).create(eq("emp_profile"), captor.capture());
        assertThat(captor.getValue()).containsEntry("phone", "13800138000");
    }
}
