import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import fixture from './helpers/app-fixture.cjs';
import database from './helpers/database.cjs';
import store from '../apps/api/src/domain/menu/store.js';
import schema from '../apps/api/src/domain/menu/schema.js';
const site=await fixture.startApp('szzx-daily-');let browser;let checks=0;const errors=[];
const output=path.join(site.root,'output/playwright/menu-daily');fs.mkdirSync(output,{recursive:true});
try{
 const db=new database.DatabaseSync(path.join(site.directory,'data.db'));
 const row=(date,name,group,place='泮水居',time=['noon'])=>({date,name,group,place,time,weekday:null,price:12,spicy:false});
 store.publishSource(db,{article_id:11427,title:'新周',content_hash:schema.sha256('daily')},[
 row('2026-10-26','风味甲','紫阳楼风味','紫阳楼'),row('2026-10-26','普通菜','大荤'),row('2026-10-26','风味甲','泮水居三楼风味','泮水居三楼'),row('2026-10-26','小食乙','小食'),
 row('2026-10-26','正谊风味','正谊楼风味','正谊楼'),row('2026-10-26','晚餐丙','大荤','泮水居',['evening']),
 row('2026-10-26','早餐丁','早餐','泮水居',['morning']),row('2026-10-27','明天午餐','大荤'),row('2026-10-27','明天晚餐','大荤','泮水居',['evening'])]);
 store.publishSource(db,{article_id:11415,title:'旧周',content_hash:schema.sha256('old-daily')},[row('2026-10-25','前周菜','大荤')]);db.close();
 browser=await chromium.launch();
 for(const [width,theme] of [[360,'light'],[1280,'dark'],[2048,'light']]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await context.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.base+'/recipe.html?date=2026-10-26');
 const left=p.getByRole('region',{name:'今天我吃了…',exact:true}),right=p.getByRole('region',{name:'明天吃什么？',exact:true});
 await left.locator('.menu-dish').first().waitFor();assert.equal(await left.locator('.menu-dish').count(),3);checks++;
 assert.deepEqual(await left.locator('.menu-dish__name').allTextContents(),['风味甲','小食乙','普通菜']);checks++;
 assert.match(await left.locator('.menu-dish').first().innerText(),/泮水居三楼和紫阳楼/);checks++;
 assert.equal(await left.locator('.menu-dish').first().locator('small').count(),0);checks++;
 assert.equal(await left.locator('h2').evaluate(e=>getComputedStyle(e).fontWeight),'400');checks++;
 assert.equal(await left.locator('.daily-column__date').count(),0);checks++;
 assert.equal(await p.locator('main a[target="_blank"]').count(),0);checks++;
 const sizes=await p.locator('.menu-view-switch button').evaluateAll(es=>es.map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height]));assert.deepEqual(sizes,[sizes[0],sizes[0],sizes[0]]);checks++;
 const anchor=await p.locator('.menu-view-switch').boundingBox();
 const content=await p.locator('main').boundingBox();
 const toolbar=await p.locator('.menu-topline').boundingBox();
 for(const label of ['每周食谱','全部菜品','今日与明日']) {
   await p.getByRole('button',{name:label,exact:true}).click();
   await p.getByRole('button',{name:label,exact:true}).and(p.locator('[aria-pressed="true"]')).waitFor();
   const box=await p.locator('.menu-view-switch').boundingBox();
   for(const dimension of ['x','y','width','height']) {assert.ok(Math.abs(box[dimension]-anchor[dimension])<1, label+' switch '+dimension+' remains fixed');checks++;}
   const frame=await p.locator('main').boundingBox();
   for(const dimension of ['x','y','width']) {assert.ok(Math.abs(frame[dimension]-content[dimension])<1,label+' content '+dimension+' matches');checks++;}
   const top=await p.locator('.menu-topline').boundingBox();assert.ok(Math.abs(top.height-toolbar.height)<1,label+' toolbar height matches '+JSON.stringify({width,toolbar,top}));checks++;
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks++;
   await p.screenshot({path:path.join(output,width+'-'+theme+'-'+label+'.png'),fullPage:true});
 }
 assert.equal(await right.getByRole('button',{name:'午餐',exact:true}).getAttribute('aria-pressed'),'true');checks++;
 await left.getByRole('button',{name:'晚餐',exact:true}).click();await left.getByRole('link',{name:'晚餐丙'}).waitFor();assert.match(await right.innerText(),/明天午餐/);checks++;
 await p.getByRole('button',{name:'切换校区'}).click();await p.waitForURL(/campus=zhengyi/);await left.getByRole('button',{name:'午餐',exact:true}).click();await left.getByRole('link',{name:'正谊风味'}).waitFor();checks++;
 await p.getByRole('button',{name:'切换校区'}).click();await p.getByLabel('选择日期').fill('2026-10-25');await left.getByRole('link',{name:'前周菜'}).waitFor();await right.getByRole('link',{name:'风味甲'}).waitFor();checks++;
 await p.getByRole('button',{name:'星期日 ▾',exact:true}).click();assert.equal(await p.locator('#weekday-options button').count(),7);checks++;
 await p.locator('#weekday-options button').first().click();await p.waitForURL(/date=2026-10-19/);assert.match(await left.innerText(),/暂无已公布/);checks++;
 await p.getByLabel('选择日期').fill('2026-10-26');await left.locator('.menu-dish').first().waitFor();
 await p.getByRole('button',{name:'全部菜品',exact:true}).click();await p.locator('.advanced-filters select').nth(4).selectOption('小食');await p.waitForFunction(()=>document.querySelectorAll('.menu-dish').length===1);assert.match(await p.locator('.menu-dish').innerText(),/小食乙/);checks++;
 await p.getByRole('button',{name:'今日与明日',exact:true}).focus();await p.keyboard.press('Enter');await left.locator('.menu-dish').first().waitFor();checks++;
 const boxes=await p.locator('.daily-column').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));assert.equal(width>600?boxes[0].y===boxes[1].y:boxes[0].y<boxes[1].y,true);checks++;
 await p.evaluate(fs.readFileSync(path.join(site.root,'node_modules/axe-core/axe.min.js'),'utf8'));
 const violations=await p.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);checks++;
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks++;
 if(width===2048) {
 const layout=await p.evaluate(()=>({main:document.querySelector('main').getBoundingClientRect().toJSON(),top:document.querySelector('.daily-context').getBoundingClientRect().top,nav:document.getElementById('siteHeader').getBoundingClientRect().bottom,heads:[...document.querySelectorAll('.daily-column h2')].map(e=>e.getBoundingClientRect().toJSON())}));
 assert.equal(layout.main.width,2048);checks++;
 assert.ok((layout.heads[0].x+layout.heads[0].width/2)/width < .28);checks++;
 assert.ok((layout.heads[1].x+layout.heads[1].width/2)/width > .72);checks++;
 assert.ok(layout.top-layout.nav<40);checks++;
 assert.ok(layout.heads[0].y-layout.nav<180);checks++;
 }
 await p.screenshot({path:path.join(output,width+'-'+theme+'.png'),fullPage:true});await p.goto(site.base+'/recipe.html?date=2026-99-99');await p.getByRole('heading',{name:'今天我吃了…'}).waitFor();checks++;
 await context.close();
 }assert.deepEqual(errors,[]);console.log(checks+' daily menu checks passed');
}finally{await browser?.close();await site.stop()}
