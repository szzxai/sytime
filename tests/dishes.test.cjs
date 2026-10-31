"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("./helpers/database.cjs");
const store = require("../apps/api/src/domain/dishes/store");
const { nameFields } = require("../apps/api/src/domain/menu/schema");
const { startApp } = require("./helpers/app-fixture.cjs");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6h0AAAAASUVORK5CYII=", "base64");

function database(context) {
  const db = new DatabaseSync(":memory:");
  context.after(() => db.close());
  db.exec(`CREATE TABLE dishes (id INTEGER PRIMARY KEY, name TEXT, name_key TEXT UNIQUE, initial TEXT, pinyin TEXT, pinyin_initials TEXT, sort_key TEXT);
    CREATE TABLE menu_records (dish_id INTEGER);
    CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER, username TEXT, name TEXT, rating INTEGER, comment TEXT,
      image_url TEXT, is_weekly INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 1);`);
  for (const [index, name] of ["红烧牛肉面", "A 套餐", "未发布菜品"].entries()) {
    const fields = nameFields(name);
    db.prepare("INSERT INTO dishes VALUES (?, ?, ?, ?, ?, ?, ?)").run(index + 1, fields.name, fields.name_key,
      fields.initial, fields.pinyin, fields.pinyin_initials, fields.sort_key);
  }
  db.exec("INSERT INTO menu_records VALUES (1), (2)");
  return db;
}

test("historical review migration normalizes names without rewriting or dropping old reviews", context => {
  const db = database(context);
  db.exec(`INSERT INTO recipes (id, name, rating, comment, is_weekly) VALUES
    (1, '  红烧牛肉面  ', 4, '保留原文', 0), (2, 'a   套餐', 3, '大小写与空白', 0),
    (3, '目录外旧菜名', 5, '继续显示在评价栏', 0), (4, '红烧牛肉面', 5, '历史每周记录', 1)`);
  store.migrate(db);
  assert.deepEqual(db.prepare("SELECT dish_id FROM recipes ORDER BY id").all().map(row => row.dish_id), [1, 2, null, null]);
  assert.equal(db.prepare("SELECT name FROM recipes WHERE id = 1").get().name, "  红烧牛肉面  ");
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM recipes").get().total, 4);
  assert.ok(db.prepare("PRAGMA foreign_key_list(recipes)").all().some(row => row.table === "dishes" && row.from === "dish_id"));
  db.exec("UPDATE recipes SET dish_id = 2 WHERE id = 1");
  store.migrate(db);
  assert.equal(db.prepare("SELECT dish_id FROM recipes WHERE id = 1").get().dish_id, 2);
});

test("dish details isolate reviews and preserve newest-first pagination and averages", context => {
  const db = database(context);
  store.migrate(db);
  const insert = db.prepare("INSERT INTO recipes (dish_id, name, rating, is_weekly, created_at) VALUES (?, ?, ?, ?, ?)");
  let sum = 0;
  for (let position = 0; position < 27; position++) {
    const rating = position % 5 + 1;
    sum += rating;
    insert.run(1, "红烧牛肉面", rating, 0, 100);
  }
  insert.run(1, "红烧牛肉面", 0, 1, 101);
  insert.run(2, "A 套餐", 1, 0, 102);
  const dish = store.detail(db, 1);
  assert.equal(dish.reviews_count, 27);
  assert.equal(dish.rating_avg, Number((sum / 27).toFixed(1)));
  const first = store.reviews(db, 1, 0), second = store.reviews(db, 1, 20);
  assert.equal(first.reviews.length, 20);
  assert.equal(first.reviews[0].id, 27);
  assert.equal(first.has_more, true);
  assert.equal(second.reviews.length, 7);
  assert.equal(second.has_more, false);
  assert.equal(new Set([...first.reviews, ...second.reviews].map(review => review.id)).size, 27);
  assert.equal(store.detail(db, 2).reviews_count, 1);
  db.exec("DELETE FROM recipes WHERE dish_id = 2");
  assert.equal(store.detail(db, 2).rating_avg, null);
});

test("malformed, oversized, nonexistent dish identities cannot resolve", context => {
  const db = database(context);
  store.migrate(db);
  for (const value of [null, undefined, [], {}, "", "01", 0, -1, 1.5, "1e0", "1 OR 1=1", "9007199254740992", 999999]) {
    assert.equal(store.findDish(db, value), null, String(value));
  }
  assert.equal(store.findDish(db, "1").name, "红烧牛肉面");
  assert.equal(store.findDish(db, 3).name, "未发布菜品");
});
test('菜品 HTTP：公开详情、严格身份/评分校验、学生提交与审核发布',async t=>{
 const {fixture}=require('./helpers/accounts-fixture.cjs');const f=await fixture(t);const admin=await f.account('dish_admin','admin'),student=await f.account('dish_student','student'),user=await f.account('dish_user');
 const {publishSource}=require('../apps/api/src/domain/menu/store');const {sha256}=require('../apps/api/src/domain/menu/schema');publishSource(f.db,{article_id:11427,title:'菜品测试',content_hash:sha256('dishes')},['红烧牛肉面','A套餐'].map(name=>({date:'2026-10-31',weekday:null,time:['noon'],place:'希文楼',group:'面档',name,price:12,spicy:null})));
 const catalog=(await f.api('/api/dishes')).data.dishes;const target=catalog[0];assert.equal((await f.api('/api/dishes/'+target.id)).data.dish.rating_avg,null);
 assert.equal((await f.api('/api/recipes',{method:'POST',token:user.token,body:{dish_id:target.id,rating:5}})).status,403);
 for(const dishId of [undefined,'',0,-1,'1e0',{},999999])assert.equal((await f.api('/api/recipes',{method:'POST',token:student.token,body:{dish_id:dishId,rating:5}})).status,422);
 for(const rating of [undefined,null,'',false,0,6,-1,4.5,'4invalid'])assert.equal((await f.api('/api/recipes',{method:'POST',token:student.token,body:{dish_id:target.id,rating}})).status,422);
 for(const comment of [{text:'invalid'},'长'.repeat(501)])assert.equal((await f.api('/api/recipes',{method:'POST',token:student.token,body:{dish_id:target.id,rating:5,comment}})).status,422);
 const submitted=await f.api('/api/recipes',{method:'POST',token:student.token,body:{dish_id:target.id,name:'不能伪造菜名',rating:4,comment:'牛肉面评价'}});assert.equal(submitted.status,202);assert.equal((await f.api('/api/dishes/'+target.id+'/reviews')).data.total,0);assert.equal((await f.decide(admin,submitted.data.id)).status,200);const published=(await f.api('/api/dishes/'+target.id+'/reviews')).data;assert.equal(published.reviews[0].name,target.name);assert.equal((await f.api('/api/dishes/'+catalog[1].id+'/reviews')).data.total,0);
 for(const offset of ['-1','1.5','1e2','NaN','1000001','0&offset=20'])assert.equal((await f.api('/api/dishes/'+target.id+'/reviews?offset='+offset)).status,400);
});
