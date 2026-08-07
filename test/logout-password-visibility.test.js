const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..'),authPath=require.resolve('../netlify/functions/auth-session'),sharedPath=require.resolve('../netlify/functions/_shared');

test('logout revokes the Supabase session server-side without exposing credentials',async()=>{
  const saved={url:process.env.SUPABASE_URL,anon:process.env.SUPABASE_ANON_KEY,fetch:global.fetch};
  process.env.SUPABASE_URL='https://project.supabase.co';process.env.SUPABASE_ANON_KEY='public-key';
  const calls=[];global.fetch=async(url,options={})=>{calls.push({url:String(url),method:options.method||'GET',body:options.body});return new Response(null,{status:204});};
  delete require.cache[authPath];delete require.cache[sharedPath];
  try{const result=await require(authPath).handler({httpMethod:'POST',headers:{authorization:'Bearer session-token'},body:JSON.stringify({action:'logout'})});assert.equal(result.statusCode,200);assert.deepEqual(calls.map(({url,method})=>({url,method})),[{url:'https://project.supabase.co/auth/v1/logout',method:'POST'}]);assert.equal(calls[0].body,undefined);}
  finally{global.fetch=saved.fetch;for(const[key,value]of[['SUPABASE_URL',saved.url],['SUPABASE_ANON_KEY',saved.anon]])value===undefined?delete process.env[key]:process.env[key]=value;delete require.cache[authPath];delete require.cache[sharedPath];}
});

test('UI provides labeled logout and temporary password visibility controls',()=>{
  const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
  assert.match(html,/data-signout>Log Out<\/button>/);
  assert.match(app,/action:'logout'/);
  assert.match(app,/async function signOut\(\)/);
  assert.match(html,/data-password-visibility="loginForm"/);
  assert.match(html,/data-password-visibility="invitationSetupForm"/);
  assert.match(html,/data-password-visibility="passwordResetForm"/);
  assert.match(app,/function setPasswordVisibility\(form,visible\)/);
  assert.match(app,/field\.type=visible\?'text':'password'/);
});
