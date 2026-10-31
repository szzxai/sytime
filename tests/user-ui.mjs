/* 用户主页、头像入口、展示 ID 与统一账号管理入口。 */
import assert from 'node:assert/strict';
import { browserFixture } from './helpers/browser-v2.mjs';
const f = await browserFixture('szzx-user-ui-v2-');
try {
  const operator = await f.account('profile_operator', 'operator');
  const user = await f.account('profile_user', 'student');
  const nickname = '校园同学';
  const signature = '个人签名经审核后展示';
  for (const [field, value] of [
    ['nickname', nickname],
    ['signature', signature],
    ['display_id', 'campus_student'],
  ]) {
    if (field === 'nickname') {
      const pending = (
        await f.site.api('/api/admin/reviews?kind=nickname', { token: operator.token })
      ).data.requests.find((r) => r.user_id === user.user.id);
      assert.equal(
        (
          await f.site.api(`/api/admin/reviews/${pending.id}/decision`, {
            method: 'POST',
            token: operator.token,
            body: { decision: 'reject', reason: '以新昵称为准' },
          })
        ).status,
        200,
      );
    }
    const request = await f.site.api('/api/user/' + field, {
      method: 'PUT',
      token: user.token,
      body: { [field]: value },
    });
    assert.equal(request.status, 202);
    assert.equal(
      (
        await f.site.api(`/api/admin/reviews/${request.data.id}/decision`, {
          method: 'POST',
          token: operator.token,
          body: { decision: 'approve' },
        })
      ).status,
      200,
    );
  }
  for (const [width, theme] of [
    [360, 'light'],
    [1280, 'dark'],
  ]) {
    const other = await f.context(operator, { width, theme });
    await other.page.goto(f.site.base + `/user.html?id=${user.user.id}`, {
      waitUntil: 'networkidle',
    });
    f.check(
      (await other.page.locator('#heroUsername').innerText()) === user.username,
      'public heading uses username',
    );
    f.check(
      (await other.page.locator('.profile-hero__id').innerText()) === 'ID：campus_student',
      'approved display ID is secondary',
    );
    f.check(
      (await other.page.locator('#heroNickname').innerText()) === nickname,
      'approved nickname',
    );
    f.check(
      (await other.page.locator('#heroSignature').innerText()) === signature,
      'approved signature',
    );
    f.check(await other.page.locator('#manageNav').isVisible(), 'staff management entry');
    await other.page.locator('[data-panel=titles]').click();
    f.check((await other.page.locator('#wearSubmit').count()) === 0, 'other titles read only');
    await other.page.locator('[data-panel=manage]').click();
    f.check(
      (await other.page.getByRole('link', { name: '前往用户管理' }).getAttribute('href')) ===
        '/admin.html#users',
      'unified account management',
    );
    await f.audit(other.page, 'user profile ' + width + theme);
    await other.ctx.close();
    const guest = await f.context(null, { width, theme });
    await guest.page.goto(f.site.base + `/user.html?id=${user.user.id}`, {
      waitUntil: 'networkidle',
    });
    f.check(
      !(await guest.page.locator('#manageNav').isVisible()),
      'anonymous profile is read only',
    );
    await f.audit(guest.page, 'anonymous profile ' + width + theme);
    await guest.ctx.close();
  }
  const self = await f.context(user);
  await self.page.goto(f.site.base + `/user.html?id=${user.user.id}`);
  await self.page.waitForURL('**/profile.html');
  f.check(true, 'own public profile redirects to personal centre');
  for (const panel of ['home', 'favorites', 'titles']) {
    await self.page.locator(`[data-panel=${panel}]`).click();
    await self.page.waitForTimeout(100);
    await f.audit(self.page, 'profile ' + panel);
  }
  await self.ctx.close();
  await f.site.api('/api/user/settings', {
    token: user.token,
    method: 'PUT',
    body: { show_role: 0 },
  });
  const hidden = await f.context(operator);
  await hidden.page.goto(f.site.base + `/user.html?id=${user.user.id}`, {
    waitUntil: 'networkidle',
  });
  f.check(
    (await hidden.page.locator('#heroRole').innerText()).trim() === '',
    'role privacy setting',
  );
  await hidden.ctx.close();
  console.log(`${f.checks} user profile browser checks passed.`);
} finally {
  await f.close();
}
