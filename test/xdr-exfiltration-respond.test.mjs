import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { decide } from '../xdr/exfiltration/decide.mjs';
import { decide as baseDecide } from '../src/decider.mjs';
import { buildFixtureRules, matchDenyRule, withXdrCheck, replayFixture, applyRun, loadFixtureRules } from '../xdr/exfiltration/respond.mjs';

const fixtureUrl = new URL('../xdr/fixtures/exfiltration.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl,'utf8'));
const resultFor = alerts => ({ schema:'aleph.xdr.result.v1',moduleKey:'exfiltration',
  decisions:alerts.map(alert=>({alertId:alert?.id,...decide(alert)})) });
const storeFor = alerts => buildFixtureRules(alerts,resultFor(alerts).decisions);
const fixtureOptions = {mode:'fixture'};

 test('X06-R9: runner writes destination rules, preserves old logs and never changes source or judgment', async () => {
  const root=await mkdtemp(join(tmpdir(),'xdr-exfiltration-run-'));
  const protectedPaths=[fixtureUrl,new URL('../src/decider.mjs',import.meta.url),new URL('../xdr/exfiltration/decide.mjs',import.meta.url)];
  const before=await Promise.all(protectedPaths.map(path=>readFile(path)));
  try {
    await mkdir(join(root,'scripts'),{recursive:true});await mkdir(join(root,'xdr','fixtures'),{recursive:true});
    await cp(fileURLToPath(new URL('../scripts/xdr-run.mjs',import.meta.url)),join(root,'scripts','xdr-run.mjs'));
    await cp(fileURLToPath(new URL('../xdr/exfiltration/',import.meta.url)),join(root,'xdr','exfiltration'),{recursive:true});
    await cp(fileURLToPath(fixtureUrl),join(root,'xdr','fixtures','exfiltration.json'));
    const previous='{"moduleKey":"privilege","action":"alert"}\n';await writeFile(join(root,'xdr','alerts.log'),previous);
    let first;
    for(const round of [1,2]) {
      execFileSync(process.execPath,['scripts/xdr-run.mjs','exfiltration'],{cwd:root,stdio:'pipe'});
      const result=JSON.parse(await readFile(join(root,'xdr','exfiltration','result.json'),'utf8'));
      assert.deepEqual(result.counts,{block:10,alert:10,record:10});
      const store=await loadFixtureRules(join(root,'xdr','exfiltration','deny-rules.json'));
      assert.equal(store.scope,'fixture_destination');assert.equal(store.rules.length,10);
      if(!first)first=store;else assert.deepEqual(store,first);
      const check=JSON.parse(await readFile(join(root,'xdr','exfiltration','check.json'),'utf8'));
      assert.equal(check.normalBlocked,0);assert.equal(check.normalAddressBlocked,0);assert.equal(check.liveZtnaConnected,false);
      assert.deepEqual(check.fixtureReplay,{scope:'fixture',base:'simulated_allow',clearAttackCount:10,clearAttackDenied:10,
        ambiguousCount:10,ambiguousPassed:10,normalCount:10,normalPassed:10,normalDenied:0,expiredRuleCount:10,expiredRulesPassed:10,baseResponsesPreserved:true});
      assert.deepEqual(store.rules.flatMap(rule=>rule.evidenceAlertIds),fixture.alerts.slice(0,10).map(alert=>alert.id));
      const log=await readFile(join(root,'xdr','alerts.log'),'utf8');assert.ok(log.startsWith(previous));
      const lines=log.trim().split('\n');assert.equal(lines.length,1+20*round);
      for(const line of lines.slice(1)) {const row=JSON.parse(line);assert.equal(row.moduleKey,'exfiltration');assert.ok(['alert','block'].includes(row.action));assert.doesNotMatch(line,/description|user\d|\d+\.\d+\.\d+\.\d+/);}
    }
    for(let i=0;i<protectedPaths.length;i++)assert.deepEqual(await readFile(protectedPaths[i]),before[i]);
  } finally {assert.ok(root.startsWith(join(tmpdir(),'xdr-exfiltration-run-')));await rm(root,{recursive:true,force:true});}
});

test('X06-R9: forged and duplicate results, unsafe metadata and shared normal or ambiguous destinations cannot create unsafe rules', async () => {
  const original=storeFor(fixture.alerts);assert.equal(original.rules.length,10);
  const decisions=resultFor(fixture.alerts).decisions;
  const forged=structuredClone(decisions);forged[20]={...forged[0],alertId:'ex-21'};
  assert.ok(!buildFixtureRules(fixture.alerts,forged).rules.some(rule=>rule.evidenceAlertIds.includes('ex-21')));
  const altered=structuredClone(decisions);altered[0].confidence=1;
  assert.ok(!buildFixtureRules(fixture.alerts,altered).rules.some(rule=>rule.evidenceAlertIds.includes('ex-01')));
  assert.ok(!buildFixtureRules(fixture.alerts,[...decisions,decisions[0]]).rules.some(rule=>rule.evidenceAlertIds.includes('ex-01')));
  assert.ok(!storeFor([...fixture.alerts,fixture.alerts[0]]).rules.some(rule=>rule.evidenceAlertIds.includes('ex-01')));
  for(const template of [fixture.alerts[20],fixture.alerts[10]]) {
    const other=structuredClone(template);other.id='ex-900';other.timestamp=fixture.alerts[0].timestamp;other.data.dstip=fixture.alerts[0].data.dstip;
    for(const timestamp of [other.timestamp,'invalid']) {
      other.timestamp=timestamp;
      const alerts=[...fixture.alerts,other];const protectedStore=storeFor(alerts);
      assert.ok(!protectedStore.rules.some(rule=>rule.evidenceAlertIds.includes('ex-01')));
      assert.equal((await replayFixture(alerts,protectedStore)).normalDenied,0);
    }
  }
  for(const patch of [{timestamp:'invalid'},{data:{...fixture.alerts[0].data,dstip:'127.0.0.1'}},{data:{...fixture.alerts[0].data,dstip:'203.0.113.999'}}]) {
    const alert={...structuredClone(fixture.alerts[0]),...patch};assert.equal(storeFor([alert]).rules.length,0);
  }
});

test('X06-R9: only the exact verified destination matches during its evidence interval; fixture rules never apply live', () => {
  const store=storeFor(fixture.alerts);const rule=store.rules[0];
  assert.equal(matchDenyRule(store,rule.destinationIp,rule.startsAt,fixtureOptions),rule);
  assert.equal(matchDenyRule(store,rule.destinationIp,rule.startsAt),null);
  assert.equal(matchDenyRule({...store,mode:'live'},rule.destinationIp,rule.startsAt,{mode:'live'}),null);
  assert.equal(matchDenyRule(store,'203.0.113.99',rule.startsAt,fixtureOptions),null);
  assert.equal(matchDenyRule(store,null,rule.startsAt,fixtureOptions),null);
  const single={...store,rules:[rule]};
  assert.equal(matchDenyRule(single,rule.destinationIp,rule.expiresAt,fixtureOptions),null);
  assert.equal(matchDenyRule(single,rule.destinationIp,new Date(Date.parse(rule.startsAt)-1).toISOString(),fixtureOptions),null);
  for(const patch of [{expiresAt:new Date(Date.parse(rule.expiresAt)+1).toISOString()},{evidenceAlertIds:[]},{evidenceAlertIds:['ex-01\nFORGED']},{patterns:['unknown']},{destinationIp:'203.0.113.999'}]) {
    assert.equal(matchDenyRule({...store,rules:[{...rule,...patch}]},rule.destinationIp,rule.startsAt,fixtureOptions),null);
  }
});

test('X06-R9: added destination check preserves real ZTNA denial, step-up, response rules and request fields', async () => {
  const store=storeFor(fixture.alerts);const rule=store.rules[0];
  const request={schema:'aleph.decision.v1',requestId:'fixture-xdr-request',subjectId:'fixture_subject',deviceId:'0123456789abcdef',
    classId:'fixture_class',projectId:'fixture_project',service:'notes',method:'GET',path:'/notes/n1',route:'GET /notes/:id',
    queryLength:0,querySha256:'fixture_hash',at:rule.startsAt,policyRevision:1,deviceRegistered:true,
    signals:{source:'none',region:'unknown',network:'unknown',hour:null},recentEvents:[],stepUp:{verified:false,authAgeSeconds:null}};
  const before=structuredClone(request);const base=await baseDecide(request);assert.equal(base.decision,'allow');
  const options={mode:'fixture',verifiedDestination:()=>rule.destinationIp,loadRules:()=>store,
    denyResponse:(_request,_rule,prior)=>({...prior,decision:'deny',reasonCode:'fixture_xdr_denied',ruleIds:[...prior.ruleIds,'xdr.exfiltration']})};
  const blocked=await withXdrCheck(baseDecide,options)(request);assert.equal(blocked.decision,'deny');
  assert.ok(base.ruleIds.every(id=>blocked.ruleIds.includes(id)));assert.deepEqual(request,before);
  for(const input of [{...request,deviceRegistered:false},{...request,signals:{}}]) {
    const existing=await baseDecide(input);assert.ok(['deny','step_up'].includes(existing.decision));
    const gate=withXdrCheck(()=>existing,{...options,loadRules:()=>{throw new Error('must not load');}});assert.equal(await gate(input),existing);
  }
  const noLookup=()=>{throw new Error('must not use fixture mapping live');};
  assert.deepEqual(await withXdrCheck(baseDecide,{...options,mode:'live',loadRules:noLookup,verifiedDestination:noLookup})(request),base);
  assert.deepEqual(await withXdrCheck(baseDecide,{...options,verifiedDestination:()=>null})(request),base);
  for(const denyResponse of [()=>({...base,decision:'allow'}),()=>({...base,decision:'deny',ruleIds:['xdr.exfiltration']}),()=>({...base,decision:'deny',requestId:'wrong'})]) {
    await assert.rejects(withXdrCheck(baseDecide,{...options,denyResponse})(request),/거부 응답 계약/);
  }
});

test('X06-R9: overlapping evidence expires individually and does not widen destination scope', () => {
  const first=structuredClone(fixture.alerts[0]);const next=structuredClone(first);next.id='ex-901';next.timestamp=new Date(Date.parse(first.timestamp)+60_000).toISOString();
  const store=storeFor([first,next]);assert.equal(store.rules.length,2);
  assert.equal(matchDenyRule(store,first.data.dstip,store.rules[0].expiresAt,fixtureOptions),store.rules[1]);
  assert.equal(matchDenyRule(store,first.data.dstip,store.rules[1].expiresAt,fixtureOptions),null);
});

test('X06-R9: log appends only verified safe fields and rejects wrong module results before writing', async () => {
  const root=await mkdtemp(join(tmpdir(),'xdr-exfiltration-log-'));
  try {
    const alerts=[structuredClone(fixture.alerts[0]),structuredClone(fixture.alerts[10])];
    for(const alert of alerts) {alert.extra='DUMMY_PRIVATE_VALUE';alert.data.password='DUMMY_PRIVATE_VALUE';}
    await applyRun({root,alerts,result:resultFor(alerts)});
    const log=await readFile(join(root,'xdr','alerts.log'),'utf8');assert.equal(log.trim().split('\n').length,2);
    assert.doesNotMatch(log,/DUMMY|password|description|user\d|\d+\.\d+\.\d+\.\d+/);
    await assert.rejects(applyRun({root,alerts,result:{...resultFor(alerts),moduleKey:'privilege'}}),/실행 결과 형식/);
    assert.equal(await readFile(join(root,'xdr','alerts.log'),'utf8'),log);
  } finally {assert.ok(root.startsWith(join(tmpdir(),'xdr-exfiltration-log-')));await rm(root,{recursive:true,force:true});}
});
