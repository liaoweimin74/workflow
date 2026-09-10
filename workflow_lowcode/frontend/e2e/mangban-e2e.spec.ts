import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:5173';

/** Helper: 登录 */
async function loginAsAdmin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('dashboard')) return;
  await page.waitForSelector('input[placeholder="请输入用户名"]', { timeout: 5000 });
  await page.evaluate(() => {
    const un = document.querySelector('input[placeholder="请输入用户名"]') as HTMLInputElement;
    un.focus(); un.value = ''; document.execCommand('insertText', false, 'admin');
    un.dispatchEvent(new Event('input', { bubbles: true }));
    const pw = document.querySelector('input[placeholder="请输入密码"]') as HTMLInputElement;
    pw.focus(); pw.value = ''; document.execCommand('insertText', false, 'admin123');
    pw.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('button');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

/** Helper: 导航到侧边栏子菜单 */
async function navigateTo(page, menuText: string) {
  await page.evaluate(() => {
    const items = document.querySelectorAll('.el-menu-item,.el-sub-menu__title');
    for (let i = 0; i < items.length; i++) {
      if (items[i].textContent?.includes('系统管理')) { (items[i] as HTMLElement).click(); break; }
    }
  });
  await page.waitForTimeout(500);
  await page.evaluate((text) => {
    const items = document.querySelectorAll('.el-menu-item');
    for (let i = 0; i < items.length; i++) {
      if (items[i].textContent?.trim() === text) { (items[i] as HTMLElement).click(); return; }
    }
  }, menuText);
}

/** Helper: 获取表格单元格文本列表 */
async function getTableRows(page): Promise<string[][]> {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('.el-table__body-wrapper tr.el-table__row');
    return Array.from(rows).map(tr =>
      Array.from(tr.querySelectorAll('td .cell')).map(td => td.textContent?.trim() || '')
    );
  });
}

/** Helper: 点击按钮 by 文本 */
async function clickButton(page, text: string) {
  await page.evaluate((t) => {
    const btns = document.querySelectorAll('button');
    for (let i = 0; i < btns.length; i++) {
      if (btns[i].textContent?.includes(t)) { (btns[i] as HTMLElement).click(); return; }
    }
  }, text);
}

/** Helper: 填写 el-dialog 内 input by label */
async function fillDialogInputs(page, values: Record<string, string>) {
  await page.evaluate((vals) => {
    const dialog = document.querySelector('.el-dialog');
    if (!dialog) return;
    const labels = dialog.querySelectorAll('.el-form-item__label');
    labels.forEach((label) => {
      const text = label.textContent?.trim() || '';
      if (vals[text] !== undefined) {
        const formItem = label.closest('.el-form-item');
        const input = formItem?.querySelector('.el-input__inner') as HTMLInputElement;
        if (input) { input.value = vals[text]; input.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    });
  }, values);
}

// ==================== 认证模块 ====================
test.describe('认证模块', () => {
  test('登录成功跳转首页', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('.el-menu').first()).toBeVisible();
  });

  test('错误密码登录失败', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(() => {
      const un = document.querySelector('input[placeholder="请输入用户名"]') as HTMLInputElement;
      un.focus(); un.value = ''; document.execCommand('insertText', false, 'admin');
      un.dispatchEvent(new Event('input', { bubbles: true }));
      const pw = document.querySelector('input[placeholder="请输入密码"]') as HTMLInputElement;
      pw.focus(); pw.value = ''; document.execCommand('insertText', false, 'wrong');
      pw.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('button');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/login/);
  });
});

// ==================== 角色管理模块 ====================
test.describe('角色管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '角色管理');
    await page.waitForURL('**/system/role');
    await page.waitForTimeout(1000);
  });

  test('角色列表显示 - 有数据且单元格非空', async ({ page }) => {
    const rows = await getTableRows(page);
    expect(rows.length).toBeGreaterThan(0);
    const firstRow = rows[0];
    expect(firstRow[0]).toBeTruthy(); // 角色名称
    expect(firstRow[1]).toBeTruthy(); // 角色编码
  });

  test('创建角色', async ({ page }) => {
    const roleName = `TEST_ROLE_${Date.now()}`;
    const roleCode = `TEST_${Date.now()}`;

    await clickButton(page, '新增角色');
    await page.waitForTimeout(500);
    await fillDialogInputs(page, { '角色名称': roleName, '角色编码': roleCode });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.el-dialog button');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent?.includes('确定')) { (btns[i] as HTMLElement).click(); return; }
      }
    });
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 });
  });

  test('创建角色后列表刷新并显示新数据', async ({ page }) => {
    const roleName = `REFRESH_TEST_${Date.now()}`;
    const roleCode = `REFRESH_${Date.now()}`;

    await clickButton(page, '新增角色');
    await page.waitForTimeout(500);
    await fillDialogInputs(page, { '角色名称': roleName, '角色编码': roleCode });
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.el-dialog button');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent?.includes('确定')) { (btns[i] as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(1000);
    await expect(page.locator('.el-table__body-wrapper')).toContainText(roleName);
  });

  test('编辑角色 - 回显正确', async ({ page }) => {
    await page.waitForSelector('.el-table__body-wrapper tr.el-table__row', { timeout: 5000 });
    const rowsBefore = await getTableRows(page);
    const firstRoleName = rowsBefore[0][0];

    await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body-wrapper tr.el-table__row');
      const btns = rows[0]?.querySelectorAll('button');
      for (let i = 0; i < (btns?.length || 0); i++) {
        if (btns![i].textContent?.includes('编辑')) { (btns![i] as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(500);

    const dialogInputs = await page.evaluate(() => {
      const dialog = document.querySelector('.el-dialog');
      if (!dialog) return [];
      const inputs = dialog.querySelectorAll('.el-input__inner');
      return Array.from(inputs).map(i => (i as HTMLInputElement).value);
    });
    expect(dialogInputs[0]).toBe(firstRoleName);
  });
});

// ==================== 用户管理模块 ====================
test.describe('用户管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '用户管理');
    await page.waitForURL('**/system/user');
    await page.waitForTimeout(1000);
  });

  test('用户列表显示 - 有数据且单元格非空', async ({ page }) => {
    const rows = await getTableRows(page);
    expect(rows.length).toBeGreaterThan(0);
    const firstRow = rows[0];
    expect(firstRow[0]).toBeTruthy(); // 用户名
    expect(firstRow[1]).toBeTruthy(); // 昵称
  });

  test('搜索用户 by 用户名', async ({ page }) => {
    const input = page.locator('input[placeholder="输入用户名"]');
    if (await input.count() > 0) await input.first().fill('admin');
    await clickButton(page, '搜索');
    await page.waitForTimeout(1000);
    await expect(page.locator('.el-table__body-wrapper')).toContainText('admin');
  });

  test('新增用户', async ({ page }) => {
    const uname = `testuser_${Date.now()}`;
    await clickButton(page, '新增用户');
    await page.waitForTimeout(500);
    await fillDialogInputs(page, { '用户名': uname, '昵称': uname, '手机号': '13800138000' });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.el-dialog button');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent?.includes('确定')) { (btns[i] as HTMLElement).click(); return; }
      }
    });
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 });
  });

  test('新增用户后列表刷新并显示新数据', async ({ page }) => {
    const uname = `refresh_user_${Date.now()}`;
    await clickButton(page, '新增用户');
    await page.waitForTimeout(500);
    await fillDialogInputs(page, { '用户名': uname, '昵称': uname, '手机号': '13800138000' });
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.el-dialog button');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent?.includes('确定')) { (btns[i] as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(1000);
    await expect(page.locator('.el-table__body-wrapper')).toContainText(uname);
  });

  test('编辑用户 - 回显正确', async ({ page }) => {
    await page.waitForSelector('.el-table__body-wrapper tr.el-table__row', { timeout: 5000 });
    const rowsBefore = await getTableRows(page);
    const firstUsername = rowsBefore[0][0];

    await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body-wrapper tr.el-table__row');
      const btns = rows[0]?.querySelectorAll('button');
      for (let i = 0; i < (btns?.length || 0); i++) {
        if (btns![i].textContent?.includes('编辑')) { (btns![i] as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(500);

    // 编辑时用户名隐藏，昵称是第一个可见 input
    const dialogInputs = await page.evaluate(() => {
      const dialog = document.querySelector('.el-dialog');
      if (!dialog) return [];
      const inputs = dialog.querySelectorAll('.el-input__inner');
      return Array.from(inputs).map(i => (i as HTMLInputElement).value);
    });
    // 找昵称字段的值
    const nicknameValue = dialogInputs.find(v => v === firstUsername);
    expect(nicknameValue).toBe(firstUsername);
  });

  test('新建用户并分配角色', async ({ page }) => {
    const uname = `role_user_${Date.now()}`;
    await clickButton(page, '新增用户');
    await page.waitForTimeout(500);
    await fillDialogInputs(page, { '用户名': uname, '昵称': uname, '手机号': '13800138000' });
    // 打开角色多选下拉
    await page.evaluate(() => {
      const dialog = document.querySelector('.el-dialog');
      const select = dialog?.querySelector('.el-select .el-select__wrapper') || dialog?.querySelector('.el-select');
      (select as HTMLElement)?.click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const options = document.querySelectorAll('.el-select-dropdown__item');
      if (options.length > 0) (options[0] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.el-dialog button');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent?.includes('确定')) { (btns[i] as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(1500);
    // 清空搜索条件后搜索
    await clickButton(page, '重置');
    await page.waitForTimeout(500);
    const bodyText = await page.locator('.el-table__body-wrapper').textContent();
    expect(bodyText).toContain(uname);
  });

  test('编辑用户 - 分配角色', async ({ page }) => {
    await page.waitForSelector('.el-table__body-wrapper tr.el-table__row', { timeout: 5000 });
    await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body-wrapper tr.el-table__row');
      const btns = rows[0]?.querySelectorAll('button');
      for (let i = 0; i < (btns?.length || 0); i++) {
        if (btns![i].textContent?.includes('编辑')) { (btns![i] as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const dialog = document.querySelector('.el-dialog');
      const select = dialog?.querySelector('.el-select .el-select__wrapper') || dialog?.querySelector('.el-select');
      (select as HTMLElement)?.click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const options = document.querySelectorAll('.el-select-dropdown__item');
      if (options.length > 0) (options[0] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.el-dialog button');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].textContent?.includes('确定')) { (btns[i] as HTMLElement).click(); return; }
      }
    });
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 });
  });
});

// ==================== 菜单 + 组织机构 ====================
test.describe('菜单与组织机构', () => {
  test('菜单树形显示', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '菜单管理');
    await page.waitForURL('**/system/menu');
    await page.waitForTimeout(800);
    await expect(page.locator('.el-table__body-wrapper')).toBeVisible({ timeout: 10000 });
  });

  test('组织机构树形显示', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '组织机构');
    await page.waitForURL('**/system/org');
    await page.waitForTimeout(800);
    await expect(page.locator('.el-table__body-wrapper')).toBeVisible({ timeout: 10000 });
  });
});