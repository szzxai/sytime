const test=require('node:test'),assert=require('node:assert/strict');const shopStore=require('../apps/api/src/domain/shops/store');const {fixture,SHOP}=require('./helpers/accounts-fixture.cjs');
test("已配置覆盖区域多边形后端限制上传坐标（边界点允许）", () => {
  const polygon = [[31.3, 120.61], [31.31, 120.61], [31.31, 120.63], [31.3, 120.63]];
  assert.equal(shopStore.insidePolygon(31.3065, 120.6221, polygon), true);
  assert.equal(shopStore.insidePolygon(31.32, 120.6221, polygon), false);
  assert.equal(shopStore.insidePolygon(31.3, 120.6221, polygon), true);
  assert.throws(() => shopStore.validate({
    name: "区域外店铺", address: "十梓街 1 号", type: "面馆", lat: 31.32, lng: 120.6221,
    campus_distance_m: 100, campus_walk_min: 2,
    metro_station: "乐桥", metro_exit: "1 号口", metro_distance_m: 100, metro_walk_min: 2
  }, polygon), (error) => error.status === 422 && /不在苏州市姑苏区行政范围内/.test(error.fields.lat));
});
test('店铺字段校验与审核发布后列表、筛选、详情、互动',async t=>{
 const f=await fixture(t),admin=await f.account('shop_admin','admin'),student=await f.account('shop_student','student'),user=await f.account('shop_user');
 assert.equal((await f.api('/api/shops')).data.shops.length,0);
 assert.equal((await f.api('/api/shops/meta',{token:user.token})).data.can_create,false);
 for(const fields of [{address:'没有门牌'},{campus_distance_m:-1},{metro_walk_min:-1},{dianping_url:'https://evil.example/'}])assert.equal((await f.api('/api/shops',{method:'POST',token:student.token,body:{...SHOP,...fields}})).status,422);
 const submitted=await f.api('/api/shops',{method:'POST',token:student.token,body:SHOP});assert.equal(submitted.status,202);assert.equal((await f.api('/api/shops')).data.total,0);
 const approved=await f.decide(admin,submitted.data.id);assert.equal(approved.status,200);const id=approved.data.published_id;
 assert.equal((await f.api('/api/shops/'+id)).data.shop.name,SHOP.name);
 for(const name of ['阿婆面馆','Blue Cup咖啡']){const s=await f.api('/api/shops',{method:'POST',token:student.token,body:{...SHOP,name,type:name.startsWith('Blue')?'饮品':'面馆'}});assert.equal((await f.decide(admin,s.data.id)).status,200);}
 assert.equal((await f.api('/api/shops?type='+encodeURIComponent('饮品'))).data.shops.length,1);
 const duplicate=await f.api('/api/shops',{method:'POST',token:student.token,body:SHOP});assert.equal(duplicate.status,409);assert.equal(duplicate.data.existing_id,id);
 assert.equal((await f.api('/api/shops/'+id+'/like',{method:'POST',token:user.token})).status,403);
 assert.equal((await f.api('/api/shops/'+id+'/like',{method:'POST',token:student.token})).data.liked,true);
 assert.equal((await f.api('/api/shops/'+id+'/like',{method:'POST',token:student.token})).data.liked,false);
 for(const value of ['no-id','99999999','-1'])assert.equal((await f.api('/api/shops/'+value)).status,404);
});
