package com.workflow.example.emp;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.BizDataHandler;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 员工档案（emp_profile）业务表单定制逻辑示例。
 *
 * <ul>
 *   <li>查询覆盖：逐行补充「在职天数」（入职日期 → 今天），并按当前登录用户部门（orgId）过滤；</li>
 *   <li>新建校验：手机号须匹配 {@code ^1\d{10}$}，非法抛 400；</li>
 *   <li>删除校验：在职员工（status 非「离职」）禁删，抛 409。</li>
 * </ul>
 */
@Component
public class EmpProfileHandler implements BizDataHandler {

    private static final String FORM_KEY = "emp_profile";
    private static final Pattern PHONE_PATTERN = Pattern.compile("^1\\d{10}$");
    private static final String RESIGNED = "离职";

    private final BizDataSupport support;
    private final UserService userService;

    public EmpProfileHandler(BizDataSupport support, UserService userService) {
        this.support = support;
        this.userService = userService;
    }

    @Override
    public String getFormKey() {
        return FORM_KEY;
    }

    @Override
    public boolean overridesQuery() {
        return true;
    }

    @Override
    public BizDataPageVO query(BizDataQueryRequest req) {
        BizDataPageVO page = support.queryGeneric(FORM_KEY, req);
        Long orgId = currentUserOrgId();
        List<BizDataVO> records = new ArrayList<>();
        for (BizDataVO vo : page.getRecords()) {
            if (orgId != null && !orgIdMatches(vo, orgId)) {
                continue;
            }
            records.add(decorateWorkingDays(vo));
        }
        return new BizDataPageVO(records, records.size(), page.getPage(), page.getSize());
    }

    @Override
    public void beforeCreate(Map<String, Object> data) {
        Object phone = data == null ? null : data.get("phone");
        if (!PHONE_PATTERN.matcher(String.valueOf(phone)).matches()) {
            throw new BusinessException(400, "手机号格式非法: " + phone);
        }
    }

    @Override
    public void beforeDelete(BizDataVO existing) {
        Object status = existing == null || existing.getData() == null
                ? null : existing.getData().get("status");
        if (!RESIGNED.equals(String.valueOf(status == null ? "" : status))) {
            throw new BusinessException(409, "在职员工不可删除");
        }
    }

    /** 当前登录用户部门 id（无登录返回 null，调用方视为不过滤）。 */
    private Long currentUserOrgId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            UserVO user = userService.getById(loginUser.getUserId());
            return user == null ? null : user.orgId();
        }
        return null;
    }

    private boolean orgIdMatches(BizDataVO vo, Long orgId) {
        Object dept = vo.getData() == null ? null : vo.getData().get("dept");
        return dept != null && String.valueOf(orgId).equals(String.valueOf(dept));
    }

    /** 复制记录并补充「在职天数」（hire_date → 今天）；入职日期缺失/非法则跳过补充。 */
    private BizDataVO decorateWorkingDays(BizDataVO vo) {
        Map<String, Object> data = vo.getData() == null
                ? new LinkedHashMap<>() : new LinkedHashMap<>(vo.getData());
        Object hireDate = data.get("hire_date");
        if (hireDate != null) {
            try {
                long days = ChronoUnit.DAYS.between(
                        LocalDate.parse(String.valueOf(hireDate)), LocalDate.now());
                data.put("workingDays", days);
            } catch (RuntimeException ignored) {
                // 入职日期格式非法：不补充在职天数
            }
        }
        return new BizDataVO(vo.getId(), data, vo.getVersion(), vo.getCreatedAt(), vo.getUpdatedAt());
    }
}