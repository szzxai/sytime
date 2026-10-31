import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserFixture, PASSWORD } from './helpers/browser-v2.mjs';
const f = await browserFixture('accounts-ui-v2-');
const output = path.join(f.site.root, 'output/playwright/accounts-v2');
fs.mkdirSync(output, { recursive: true });
try {
  const operator = await f.account('ui_operator', 'operator'),
    admin = await f.account('ui_admin', 'admin'),
    user = await f.account('ui_user');
  const request = await f.site.api('/api/user/display_id', {
    method: 'PUT',
    token: user.token,
    body: { display_id: 'campus_ui' },
  });
  assert.equal(request.status, 202);
  for (const [width, theme] of [
    [1280, 'light'],
    [390, 'light'],
    [1280, 'dark'],
    [390, 'dark'],
  ]) {
    const { ctx, page } = await f.context(null, { width, theme });
    await page.goto(f.site.base + '/register.html');
    await page.locator('#password').fill('abc');
    f.check(
      (await page.locator('.password-checks li.is-met').count()) === 2,
      'partial password checklist',
    );
    await page.locator('#password').fill(PASSWORD);
    f.check(
      (await page.locator('.password-checks li.is-met').count()) === 5,
      'all password requirements',
    );
    await page.screenshot({ path: path.join(output, `password-${width}-${theme}.png`) });
    await f.audit(page, 'registration ' + width + theme);
    await page.goto(f.site.base + '/login.html');
    f.check((await page.locator('.password-checks').count()) === 0, 'login has no strength checks');
    await page.locator('#password').fill(PASSWORD);
    await f.audit(page, 'login ' + width + theme);
    await page.locator('#username').fill(operator.username);
    await page.locator('#submitBtn').click();
    await page.waitForURL('**/index.html');
    f.check(
      (await page.evaluate(() => localStorage.getItem('token'))) === 'session',
      'JWT is not stored in localStorage',
    );
    const cookies = await ctx.cookies();
    f.check(
      cookies.some((c) => c.name === 'sytime_session' && c.httpOnly && c.sameSite === 'Strict'),
      'HttpOnly SameSite session',
    );
    await page.goto(f.site.base + '/admin.html');
    await page.locator('.admin-welcome').waitFor();
    await f.audit(page, 'admin overview ' + width + theme);
    await page.screenshot({
      path: path.join(output, `admin-${width}-${theme}.png`),
      fullPage: true,
    });
    for (const panel of ['审核中心', '用户管理', '工单处理', '站点内容', '头衔管理', '操作记录']) {
      await page.getByRole('button', { name: panel, exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.loading'));
      await page.waitForTimeout(100);
      await f.audit(page, panel + width + theme);
    }
    await page.getByRole('button', { name: '审核中心', exact: true }).click();
    await page.getByRole('button', { name: '查看详情', exact: true }).first().waitFor();
    await page.getByRole('button', { name: '查看详情', exact: true }).first().click();
    await page.locator('#reviewDetail .admin-detail').waitFor();
    await f.audit(page, 'review dialog ' + width + theme);
    await page.keyboard.press('Escape');
    f.check((await page.locator('#reviewDetail').count()) === 0, 'Escape closes review details');
    await ctx.close();
  }
  const { ctx, page } = await f.context(operator, { cookie: true });
  await page.goto(f.site.base + '/admin.html#reviews');
  await page.getByRole('combobox', { name: '类型', exact: true }).selectOption('display_id');
  await page.getByRole('button', { name: '查看详情', exact: true }).click();
  await page.getByRole('button', { name: '审核通过', exact: true }).click();
  await page.locator('.dialog--confirm button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#reviewDetail'));
  f.check(
    (await f.site.api('/api/users/' + user.user.id + '/profile')).data.user.display_id ===
      'campus_ui',
    'approval publishes display ID',
  );
  await ctx.close();
  const regular = await f.context(user, { cookie: true, width: 390 });
  await regular.page.goto(f.site.base + '/profile.html');
  await regular.page.getByRole('heading', { name: '我的申请', exact: true }).waitFor();
  f.check(
    await regular.page.getByText('已通过', { exact: true }).isVisible(),
    'owner sees approved history',
  );
  await f.audit(regular.page, 'profile applications');
  await regular.page.goto(f.site.base + '/student_verify.html');
  await f.audit(regular.page, 'student application');
  await regular.page.goto(f.site.base + '/admin.html');
  f.check(
    await regular.page.getByText('暂无权限访问管理后台', { exact: true }).isVisible(),
    'user cannot open admin',
  );
  await regular.ctx.close();
  const staff = await f.context(admin, { cookie: true });
  await staff.page.goto(f.site.base + '/admin.html#users');
  await staff.page.getByPlaceholder('用户名、昵称或展示 ID').fill('ui_operator');
  await staff.page.getByText('受保护账号', { exact: true }).waitFor();
  f.check(
    (await staff.page.getByRole('button', { name: '封禁', exact: true }).count()) === 0,
    'admin cannot manage operator',
  );
  await staff.ctx.close();
  const banned = await f.site.api('/api/admin/users/ban', {
    method: 'PUT',
    token: operator.token,
    body: { userId: user.user.id, ban_reason: '浏览器申诉测试', allow_appeal: false },
  });
  assert.equal(banned.status, 200);
  const ban = await f.context(null);
  await ban.page.goto(f.site.base + '/login.html');
  await ban.page.locator('#username').fill(user.username);
  await ban.page.locator('#password').fill(PASSWORD);
  await ban.page.locator('#submitBtn').click();
  await ban.page.getByText('账号已被封禁', { exact: true }).waitFor();
  f.check(!(await ban.page.locator('#appealBox').isVisible()), 'disabled appeal hidden');
  await ban.ctx.close();
  console.log(
    `${f.checks} account/admin browser checks passed; keyboard, private approval, cookies, 390/1280px light/dark, axe and overflow.`,
  );
} finally {
  await f.close();
}
