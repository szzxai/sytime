import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import fixture from './helpers/app-fixture.cjs';
import database from './helpers/database.cjs';
import menuStore from '../apps/api/src/domain/menu/store.js';
import schema from '../apps/api/src/domain/menu/schema.js';
const site=await fixture.startApp('szzx-weekly-ui-');
const output=path.join(site.root,'output/playwright/menu');
fs.mkdirSync(output,{recursive:true});
const axe=fs.readFileSync(path.join(site.root,'node_modules/axe-core/axe.min.js'),'utf8');
let browser, checks=0;
const errors=[];
try {
  const db=new database.DatabaseSync(path.join(site.directory,'data.db'));
  menuStore.publishSource(db,{article_id:11427,title:'2026年10月26日到10月31日菜单',content_hash:schema.sha256('ui')},[
    {date:'2026-10-26',weekday:null,time:['noon','evening'],place:'希文楼',group:'面档',name:'红烧牛肉面',price:17,spicy:true},
    {date:'2026-10-26',weekday:null,time:['noon'],place:'正谊校区',group:'免费汤',name:'番茄蛋汤',price:0,spicy:false},
    {date:'2026-10-27',weekday:null,time:['morning'],place:'希文楼',group:'早餐',name:'茶叶蛋',price:2,spicy:false},
  ]);
  db.close();
  await site.api('/api/register',{method:'POST',body:{username:'menu-ui',nickname:'食谱测试',password:'test-password'}});
  const login=(await site.api('/api/login',{method:'POST',body:{username:'menu-ui',password:'test-password'}})).data;
  browser=await chromium.launch({headless:true});
  for(const [width,theme] of [[360,'light'],[1280,'dark']]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.addInitScript(({login,theme})=>{
      localStorage.setItem('theme',theme);localStorage.setItem('token',login.token);
      localStorage.setItem('user',JSON.stringify(login.user));
    },{login,theme});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(site.base+'/recipe.html?view=weekly&date=2026-10-26');
    await page.getByRole('heading',{name:'菜品与食谱'}).waitFor();
    await page.locator('.menu-dish').first().waitFor();
    assert.equal(await page.locator('.menu-dish').count(),2);checks++;
    assert.match(await page.locator('main').innerText(),/免费/);checks++;
    assert.equal(await page.locator('main a[target="_blank"]').count(),0);checks++;
    await page.getByLabel('找一道菜').fill('hsnrm');
    await page.waitForFunction(()=>document.querySelectorAll('.menu-dish').length===1);
    assert.match(await page.locator('.menu-dish').innerText(),/红烧牛肉面/);checks++;
    await page.getByLabel('找一道菜').fill('');
    await page.getByLabel('供应地点').selectOption('正谊校区');
    await page.waitForFunction(()=>document.querySelectorAll('.menu-dish').length===1);
    assert.match(await page.locator('.menu-dish').innerText(),/番茄蛋汤/);checks++;
    await page.getByLabel('供应地点').selectOption('');
    await page.getByRole('button',{name:/周二/}).click();
    await page.getByRole('link',{name:'茶叶蛋',exact:true}).waitFor();checks++;
    await page.getByRole('button',{name:/周一/}).focus();await page.keyboard.press('Enter');
    await page.getByRole('link',{name:'红烧牛肉面',exact:true}).waitFor();checks++;
    await page.getByRole('link',{name:'红烧牛肉面',exact:true}).click();
    await page.getByRole('heading',{name:'近期供应'}).waitFor();
    assert.match(await page.locator('#dishSummary').innerText(),width===360?/暂无评分/:/5.0/);checks++;
    await page.getByRole('button',{name:'写评价',exact:true}).click();
    await page.locator('#reviewDialog').waitFor();
    const review=page.locator('#reviewDialog');
    await review.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
    assert.doesNotMatch(await review.innerText(),/输入菜名、拼音或首字母，再从下拉列表选择已有菜品。|默认 5 分可改/);checks++;
    assert.equal(await review.locator('[aria-describedby="dishPickerHint"]').count(),0);checks++;
    assert.equal(await review.locator('#r5').isChecked(),true);checks++;
    await review.getByRole('radio',{name:'4 分',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await review.locator('#r4').isChecked(),true);checks++;
    await review.getByRole('radio',{name:'5 分',exact:true}).focus();await page.keyboard.press('Space');
    const spacing=await review.evaluate(el=>{const body=el.querySelector('.dialog__body');const fields=[...body.children].map(e=>e.getBoundingClientRect());const stars=[...el.querySelectorAll('.rating-input label')].map(e=>e.getBoundingClientRect());return {gaps:fields.slice(1).map((b,i)=>b.y-fields[i].bottom),stars:stars.map(b=>[b.width,b.height]),width:el.getBoundingClientRect().width,scroll:body.scrollWidth>body.clientWidth};});
    assert.ok(spacing.gaps.every(g=>g>=(width===360?20:24)),JSON.stringify(spacing));checks++;
    assert.ok(spacing.stars.every(([w,h])=>w>=44&&h>=44));checks++;
    assert.equal(spacing.scroll,false);checks++;
    assert.ok(width===360?spacing.width===360:spacing.width<=544);checks++;
    await page.evaluate(axe);
    assert.deepEqual(await page.evaluate(async()=> (await axe.run(document.getElementById('reviewDialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[]);checks++;
    await page.screenshot({path:path.join(output,'review-'+width+'-'+theme+'.png')});
    await page.locator('#comment').fill('真实评价与菜单评分联动');
    await page.locator('#recipeForm button[type="submit"]').click();
    await page.locator('#reviewDialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('#dishSummary')?.textContent.includes('5.0'));checks++;
    await page.locator('.back-link').click();
    await page.locator('.menu-dish').first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.menu-dish')].some(e=>e.textContent.includes('5.0')));checks++;
    await page.evaluate(axe);
    const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
    assert.deepEqual(violations,[]);checks++;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks++;
    await page.screenshot({path:path.join(output,`${width}-${theme}.png`),fullPage:true});
    await page.goto(site.base+'/admin.html#menu');
    await page.locator('#menuSettingsForm').waitFor();
    assert.match(await page.locator('#menuSettingsForm').innerText(),/Gemini/);checks++;
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`Weekly menu UI: ${checks} checks passed; mobile/light, desktop/dark, keyboard, review/star refresh, source links and axe.`);
} finally {await browser?.close();await site.stop();}
