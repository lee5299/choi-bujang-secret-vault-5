import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import handler from '../api/auth.js';

function response() {
  return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(s) { this.statusCode=s; return this; },
    json(data) { this.data=data; return this; }, end() { return this; } };
}

test('Auth proxy restricts routes and never returns upstream diagnostics or keys', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-server-auth-key';
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ code: 'invalid_credentials', message: 'Private upstream diagnostic' }, { status: 400 }); };
    for (const request of [
      { url: '/api/auth?route=rest', method: 'POST' },
      { url: '/api/auth?route=token&grant_type=client_credentials', method: 'POST' },
      { url: '/api/auth?route=logout', method: 'POST' },
      { url: '/api/auth?route=user', method: 'GET' },
      { url: '/api/auth?route=token&grant_type=password', method: 'GET' },
    ]) {
      const res = response(); await handler({ ...request, headers: {} }, res); assert.ok(res.statusCode >= 400);
    }
    assert.equal(calls, 0);
    const res=response();
    await handler({ url:'/api/auth?route=token&grant_type=password', method:'POST',
      headers:{ 'content-type':'application/json' }, body:{ email:'fixture',password:'synthetic-password' } },res);
    assert.equal(res.statusCode,400);
    assert.doesNotMatch(JSON.stringify(res.data),/Private upstream|synthetic-server-auth-key/);
    assert.equal(res.headers['Cache-Control'],'no-store');
  } finally { globalThis.fetch=originalFetch; if(originalKey===undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY=originalKey; }
});

test('real Auth SDK uses server proxy for password, refresh, user and local logout', async () => {
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/sb_publishable_|sb_secret_|eyJ[A-Za-z0-9_-]{12,}\./u);
  const proxyCode=html.match(/const authClient = createClient\([\s\S]*?\n      \}\);/u)[0];
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_PUBLISHABLE_KEY='synthetic-server-auth-key';
  const token=['synthetic','signed','token'].join('.');
  const routes=[];
  const browserFetch=async (url,options)=>{
    assert.match(url,/^\/api\/auth\?/u);
    assert.equal(new Headers(options.headers).has('apikey'),false);
    const headers=Object.fromEntries(new Headers(options.headers));
    const res=response(); await handler({url,method:options.method,headers,body:options.body},res);
    return res.statusCode===204 ? new Response(null,{status:204}) : Response.json(res.data,{status:res.statusCode});
  };
  let client;
  try {
    globalThis.fetch=async (input,options)=>{
      const endpoint=new URL(input); routes.push(endpoint.pathname);
      assert.equal(options.headers.apikey,'synthetic-server-auth-key');
      if(endpoint.pathname.endsWith('/logout')) { assert.equal(endpoint.searchParams.get('scope'),'local'); return new Response(null,{status:204}); }
      if(endpoint.pathname.endsWith('/user')) return Response.json({id:'fixture-user',email:'hidden'});
      return Response.json({access_token:token,refresh_token:'synthetic-refresh',expires_in:3600,
        user:{id:'fixture-user',email:'hidden',user_metadata:{private:'hidden'}}});
    };
    const build=new Function('createClient','fetch',`${proxyCode}\nreturn authClient;`);
    client=build((url,key,options)=>createClient(url,key,{...options,auth:{...options.auth,persistSession:false,autoRefreshToken:false}}),browserFetch);
    const signed=await client.auth.signInWithPassword({email:'fixture',password:'synthetic-password'});
    assert.equal(signed.error,null); assert.equal(signed.data.user.id,'fixture-user'); assert.equal(signed.data.user.email,undefined);
    assert.equal((await client.auth.refreshSession()).error,null);
    assert.equal((await client.auth.getUser()).error,null);
    assert.equal((await client.auth.signOut({scope:'local'})).error,null);
    assert.equal((await client.auth.getSession()).data.session,null);
    assert.deepEqual(routes,['/auth/v1/token','/auth/v1/token','/auth/v1/user','/auth/v1/logout']);
  } finally { client?.auth.stopAutoRefresh(); globalThis.fetch=originalFetch; if(originalKey===undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY=originalKey; }
});
