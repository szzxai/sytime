const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {fixture,SHOP}=require('./helpers/accounts-fixture.cjs');
test('评价图片私密保存、真实图片校验、发布保留旧版、人数与总价',async t=>{
 const f=await fixture(t),admin=await f.account('image_admin','admin'),student=await f.account('image_student','student');
 const submitted=await f.api('/api/shops',{method:'POST',token:student.token,body:SHOP});const id=(await f.decide(admin,submitted.data.id)).data.published_id;
 const buffer=await sharp({create:{width:12,height:12,channels:3,background:'red'}}).png().toBuffer();
 function form(image=buffer){const b=new FormData();b.set('rating','5');b.set('guests','2');b.set('total_price','66');b.set('content','实拍评价');b.set('image',new Blob([image],{type:'image/png'}),'photo.png');return b;}
 const bad=await f.api(`/api/shops/${id}/reviews`,{method:'POST',token:student.token,body:form(Buffer.from('not an image'))});assert.equal(bad.status,422);
 const request=await f.api(`/api/shops/${id}/reviews`,{method:'POST',token:student.token,body:form()});assert.equal(request.status,202);assert.equal((await f.api(`/api/shops/${id}/reviews`)).data.total,0);
 assert.equal(fs.existsSync(path.join(f.root,'uploads','approved')),false);await f.decide(admin,request.data.id);let published=(await f.api(`/api/shops/${id}/reviews`)).data.reviews[0];assert.equal(published.per_person,33);assert.match(published.image_url,/^\/uploads\/approved\//);assert.ok(fs.existsSync(path.join(f.root,published.image_url)));
 const old=published.image_url;const change=await f.api(`/api/shops/${id}/reviews`,{method:'POST',token:student.token,body:{rating:4,content:'删除图片',remove_image:'1'}});assert.equal((await f.api(`/api/shops/${id}/reviews`)).data.reviews[0].image_url,old);await f.decide(admin,change.data.id);published=(await f.api(`/api/shops/${id}/reviews`)).data.reviews[0];assert.equal(published.image_url,'');
 for(const fields of [{guests:'0'},{total_price:'-1'},{rating:'6'},{content:'字'.repeat(501)}])assert.equal((await f.api(`/api/shops/${id}/reviews`,{method:'POST',token:student.token,body:{rating:5,...fields}})).status,422);
});
