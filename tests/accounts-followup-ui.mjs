import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import database from './helpers/database.cjs';
import { browserFixture } from './helpers/browser-v2.mjs';
const f = await browserFixture('accounts-followup-ui-');
const output = path.join(f.site.root, 'output/playwright/accounts-followup');
fs.mkdirSync(output, { recursive: true });
try {
  const operator = await f.account('follow_operator', 'operator');
  const student = await f.account('follow_student', 'student');
  const user = await f.account('follow_user');
  const dish = (await f.site.api('/api/dishes')).data.dishes[0];
  const shop = f.seedShop(student.user);
  const seed = new database.DatabaseSync(path.join(f.site.directory, 'data.db'));
  seed.prepare('UPDATE users SET display_id=? WHERE id=?').run('secondary_id', user.user.id);
  seed.close();
  const submission = await f.site.api('/api/recipes', {
    method: 'POST',
    token: student.token,
    body: { dish_id: dish.id, rating: 5, comment: '通知点击应定位此评价' },
  });
  assert.equal(submission.status, 202);
  for (const [width, theme] of [
    [1920, 'light'],
    [1280, 'dark'],
    [390, 'light'],
    [390, 'dark'],
  ]) {
    const { ctx, page } = await f.context(operator, { width, theme, cookie: true });
    await page.goto(f.site.base + `/admin.html?request=${submission.data.id}#reviews`);
    await page.locator('#reviewDetail .admin-detail').waitFor();
    f.check(
      await page.locator('.admin-workspace').evaluate((el) => {
        const box = el.getBoundingClientRect(),
          css = getComputedStyle(el);
        return (
          box.x === 0 &&
          Math.abs(box.width - innerWidth) < 1 &&
          css.borderLeftWidth === '0px' &&
          css.borderRightWidth === '0px'
        );
      }),
      'admin fills viewport without outer frame',
    );
    await page.getByRole('button', { name: '审核通过', exact: true }).click();
    f.check((await page.locator('dialog[open]').count()) === 1, 'confirmation uses one dialog');
    f.check(
      await page.getByRole('button', { name: '确认通过', exact: true }).isVisible(),
      'approval has explicit action label',
    );
    f.check(
      (await page.getByRole('button', { name: '删除', exact: true }).count()) === 0,
      'approval does not say delete',
    );
    const close = page.locator('#reviewDetail [data-dialog-close]');
    f.check(
      await close.evaluate((el) => {
        const button = el.getBoundingClientRect(),
          title = el.parentElement.querySelector('h2').getBoundingClientRect();
        return (
          button.left > title.left &&
          Math.abs(button.top + button.height / 2 - (title.top + title.height / 2)) < 2
        );
      }),
      'close button aligns at title right',
    );
    await f.audit(page, `approval confirmation ${width} ${theme}`);
    await page.screenshot({ path: path.join(output, `confirm-${width}-${theme}.png`) });
    await page.keyboard.press('Escape');
    await page.getByLabel('处理说明（拒绝时必填）').fill('请补充实用信息');
    await page.getByRole('button', { name: '拒绝申请', exact: true }).click();
    f.check(
      await page.getByRole('button', { name: '确认不通过', exact: true }).isVisible(),
      'rejection action label',
    );
    f.check(
      await page
        .locator('.dialog--confirm')
        .getByText('请补充实用信息', { exact: true })
        .isVisible(),
      'rejection repeats submitted reason',
    );
    await page.locator('#reviewDetail [data-dialog-close]').click();
    f.check(
      (await page.getByLabel('处理说明（拒绝时必填）').inputValue()) === '请补充实用信息',
      'return preserves review notes',
    );
    await ctx.close();
  }
  // Real oversized PNG uploads exercise canvas compression through all shared review/portrait paths.
  const photo = await sharp(crypto.randomBytes(2000 * 1600 * 3), {
    raw: { width: 2000, height: 1600, channels: 3 },
  })
    .png()
    .toBuffer();
  assert.ok(photo.length > 2 * 1024 * 1024);
  const image = { name: 'large-photo.png', mimeType: 'image/png', buffer: photo };
  const portrait = await f.context(user, { cookie: true });
  await portrait.page.goto(f.site.base + '/profile.html');
  await portrait.page.locator('#heroUsername').waitFor();
  f.check(
    (await portrait.page.locator('#heroUsername').textContent()) === user.username,
    'profile primary is username',
  );
  f.check(
    (await portrait.page.locator('#heroNickname').textContent()).includes('测试'),
    'nickname stays visible',
  );
  f.check(
    (await portrait.page.locator('.profile-hero__id').textContent()) === 'ID：secondary_id',
    'ID is secondary',
  );
  const avatarRequest = portrait.page.waitForRequest(
    (r) => r.url().endsWith('/api/user/avatar') && r.method() === 'POST',
  );
  await portrait.page.locator('#avatarFile').setInputFiles(image);
  const sentAvatar = await avatarRequest;
  await (await sentAvatar.response()).finished();
  f.check(
    (await sentAvatar.sizes()).requestBodySize < 2 * 1024 * 1024,
    'avatar compressed before upload',
  );
  await portrait.page.getByText('已提交审核或保存设置', { exact: true }).waitFor();
  await portrait.page.goto(f.site.base + `/user.html?id=${student.user.id}`);
  f.check(
    (await portrait.page.locator('#heroUsername').textContent()) === student.username,
    'public profile uses username',
  );
  await portrait.page.goto(f.site.base + '/student_verify.html');
  await portrait.page.getByRole('heading', { name: '学生身份', exact: true }).waitFor();
  f.check(
    await portrait.page
      .locator('.student-identity')
      .evaluate((el) => el.getBoundingClientRect().width > 900),
    'student application uses desktop width',
  );
  await f.audit(portrait.page, 'desktop student application');
  await portrait.page.screenshot({
    path: path.join(output, 'student-desktop-light.png'),
    fullPage: true,
  });
  await portrait.ctx.close();
  const learner = await f.context(student, { cookie: true, width: 390 });
  await learner.page.goto(f.site.base + `/dish.html?id=${dish.id}`);
  await learner.page.locator('#writeDishReview').click();
  const dishRequest = learner.page.waitForRequest(
    (r) => r.url().endsWith('/api/recipes') && r.method() === 'POST',
  );
  await learner.page.evaluate(() => {
    const decode = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return decode(...args);
    };
  });
  await learner.page.locator('input[type=file]').setInputFiles(image);
  f.check(
    await learner.page.locator('#recipeSubmit').isDisabled(),
    'cannot submit before compression finishes',
  );
  await learner.page.locator('.upload-preview__img').waitFor();
  f.check(
    await learner.page
      .locator('.upload-preview__size')
      .textContent()
      .then((v) => parseInt(v) <= 2048),
    'review preview shows compressed bytes',
  );
  await learner.page.locator('#comment').fill('手机压缩上传测试');
  await learner.page.locator('dialog button[type=submit]').click();
  const sentDish = await dishRequest;
  await (await sentDish.response()).finished();
  f.check(
    (await sentDish.sizes()).requestBodySize < 2 * 1024 * 1024,
    'dish photo compressed before upload',
  );
  // Compression must reach server validation rather than fail the upload-size check.
  await learner.page.getByRole('alert').filter({ hasText: '已有待审核申请' }).waitFor();
  await learner.page.keyboard.press('Escape');
  await learner.page.goto(f.site.base + '/student_verify.html');
  const smallInputs = await learner.page
    .locator('input:not([type=hidden]),textarea,select')
    .evaluateAll((elements) =>
      elements
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => el.outerHTML),
    );
  assert.deepEqual(smallInputs, []);
  f.check(true, 'mobile certification inputs are at least 16px');
  await learner.page.goto(f.site.base + '/map.html');
  await learner.page.waitForFunction(() => document.body.dataset.guideReady === 'true');
  await learner.page.locator('#placesToggle').click();
  await learner.page.locator('#placesPanel.is-open').waitFor();
  await learner.page
    .locator('.campus-stage')
    .dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 350, clientY: 750 });
  f.check(
    (await learner.page.locator('#placesToggle').getAttribute('aria-expanded')) === 'false',
    'outside map touch closes directory',
  );
  await learner.page.locator('#placesToggle').click();
  await learner.page.locator('#placeSearch').fill('希文');
  f.check(
    (await learner.page.locator('#placesToggle').getAttribute('aria-expanded')) === 'true',
    'directory search stays open',
  );
  await f.audit(learner.page, 'mobile map outside dismissal');
  await learner.page.goto(f.site.base + `/shop.html?id=${shop.id}`);
  await learner.page.locator('label[for="shopRating5"]').click();
  await learner.page.locator('#reviewContent').fill('店铺照片压缩与精确跳转');
  await learner.page.locator('#reviewHasImage').check();
  await learner.page.locator('input[type=file]').setInputFiles(image);
  await learner.page.locator('.upload-preview__img').waitFor();
  const shopResponse = learner.page.waitForResponse(
    (r) => r.url().endsWith(`/api/shops/${shop.id}/reviews`) && r.request().method() === 'POST',
  );
  await learner.page.locator('#reviewSubmit').click();
  const shopSubmitted = await shopResponse;
  f.check(shopSubmitted.status() === 202, 'shop photo compressed and accepted for moderation');
  const shopRequest = await shopSubmitted.json();
  await f.site.api(`/api/admin/reviews/${shopRequest.id}/decision`, {
    method: 'POST',
    token: operator.token,
    body: { decision: 'approve', reason: '' },
  });
  await learner.ctx.close();
  // Approval: keyboard activates the notification, marks it read, and loads the exact review.
  const approved = await f.site.api(`/api/admin/reviews/${submission.data.id}/decision`, {
    method: 'POST',
    token: operator.token,
    body: { decision: 'approve', reason: '' },
  });
  assert.equal(approved.status, 200);
  const reviewId = approved.data.published_id;
  const seedMore = new database.DatabaseSync(path.join(f.site.directory, 'data.db'));
  const insert = seedMore.prepare(
    'INSERT INTO recipes(dish_id,user_id,username,name,rating,comment,is_weekly,created_at) VALUES(?,?,?,?,4,?,0,unixepoch()+1)',
  );
  for (let i = 0; i < 25; i++)
    insert.run(dish.id, student.user.id, student.username, dish.name, '更近的评价' + i);
  seedMore.close();
  const owner = await f.context(student, { cookie: true });
  await owner.page.goto(f.site.base + '/inbox.html');
  await owner.page
    .locator('.msg')
    .filter({ hasText: '店铺评价已通过' })
    .locator('[data-msg-open]')
    .click();
  await owner.page.waitForURL('**/shop.html?**');
  await owner.page.locator('.shop-review-item.is-highlighted').waitFor();
  f.check(
    await owner.page
      .locator('.shop-review-item.is-highlighted')
      .textContent()
      .then((text) => text.includes('店铺照片压缩与精确跳转')),
    'shop notification opens exact review',
  );
  await owner.page.goto(f.site.base + '/inbox.html');
  const notification = owner.page.locator('.msg').filter({ hasText: '菜品评价已通过' });
  await notification.locator('[data-msg-open]').focus();
  await owner.page.keyboard.press('Enter');
  await owner.page.waitForURL('**/dish.html?**');
  await owner.page.locator(`#review-${reviewId}`).waitFor();
  f.check(
    await owner.page.locator(`#review-${reviewId}`).evaluate((el) => document.activeElement === el),
    'linked review loaded and focused past first page',
  );
  f.check(
    await owner.page
      .locator(`#review-${reviewId}`)
      .textContent()
      .then((v) => v.includes('通知点击应定位此评价')),
    'notification opens corresponding comment',
  );
  const inbox = (await f.site.api('/api/messages', { token: student.token })).data.messages;
  f.check(
    inbox.find((m) => m.title === '菜品评价已通过').read,
    'navigation waits for read acknowledgement',
  );
  const rejected = await f.site.api('/api/recipes', {
    method: 'POST',
    token: student.token,
    body: { dish_id: dish.id, rating: 1, comment: '被拒评论的完整原文' },
  });
  await f.site.api(`/api/admin/reviews/${rejected.data.id}/decision`, {
    method: 'POST',
    token: operator.token,
    body: { decision: 'reject', reason: '需要完善内容' },
  });
  await owner.page.goto(f.site.base + '/inbox.html');
  await owner.page
    .locator('.msg')
    .filter({ hasText: '菜品评价未通过' })
    .locator('[data-msg-open]')
    .click();
  await owner.page.waitForURL('**/profile.html?submission=**');
  await owner.page.getByText('被拒评论的完整原文', { exact: true }).waitFor();
  f.check(
    await owner.page.getByText('需要完善内容', { exact: true }).isVisible(),
    'rejected notification shows original private comment and reason',
  );
  await f.audit(owner.page, 'rejected submission detail');
  await owner.ctx.close();
  console.log(
    `${f.checks} account follow-up UI checks passed; image compression, linked comments, desktop/mobile, moderation confirmations and handled notices.`,
  );
} finally {
  await f.close();
}
