import patterns from './patterns.json' with { type: 'json' };
import { projectAlert } from './read-alerts.mjs';

export const guessing = patterns.patterns.find(item => item.name === 'password_guessing');
export const spraying = patterns.patterns.find(item => item.name === 'password_spraying');

export function isNormalEvent(e) {
  return !e.failure || !e.mitre && e.level <= 3 && e.count <= 1;
}

export function correlatedIds(alerts, evidence, index) {
  const current = evidence[index];
  if (!current.valid || !current.failure || current.afterSuccess || current.count > 1
      || current.level < guessing.condition.minLevel) return [];
  const at = Date.parse(current.timestamp);
  const ids = new Set();
  evidence.forEach((e, i) => {
    if (e.valid && e.failure && !e.afterSuccess && e.count <= 1
        && e.sourceIp === current.sourceIp && e.account === current.account
        && Date.parse(e.timestamp) <= at
        && Date.parse(e.timestamp) >= at - guessing.condition.windowSeconds * 1000
        && typeof alerts[i]?.id === 'string') ids.add(alerts[i].id);
  });
  return ids.size >= guessing.condition.minFailures ? [...ids] : [];
}

function positiveCount(value) {
  if (!/^[1-9]\d{0,5}$/u.test(String(value ?? ''))) return 0;
  return Number(value);
}

export function evidenceFor(alert) {
  const row = projectAlert(alert);
  const text = row.description;
  const count = positiveCount(alert?.data?.count)
    || positiveCount(text.match(/(?:로그인\s*)?실패(?:가)?\s*(\d+)건/u)?.[1]);
  const accountList = typeof alert?.data?.accounts === 'string'
    ? alert.data.accounts.split(',').filter(value => /^user\d{2,4}$/u.test(value)) : [];
  const accountCount = Math.max(new Set(accountList).size,
    positiveCount(text.match(/계정\s*(\d+)개/u)?.[1]),
    positiveCount(text.match(/계정에?\s*(\d+)개/u)?.[1]));
  const time = text.match(/(\d+)\s*(분|초)\s*(?:안|동안)/u);
  const windowSeconds = time ? Number(time[1]) * (time[2] === '분' ? 60 : 1) : null;
  const samePassword = /같은 비밀번호/u.test(text);
  const noSuccess = /성공은? 없/u.test(text);
  const afterSuccess = /성공/u.test(text) && !noSuccess;
  const failure = /실패/u.test(text)
    || samePassword && /여러 계정/u.test(text) && /연속/u.test(text);
  const isLogin = /로그인|계정/u.test(text) || /비밀번호를 한 글자씩/u.test(text);
  const mitre = Array.isArray(alert?.rule?.mitre)
    && alert.rule.mitre.some(value => /^T1110(?:\.00[1-4])?$/u.test(value));
  const repeated = /이어|연속|한 글자씩|같은 간격|계정 이름을 바꿔/u.test(text);
  const valid = Boolean(row.timestamp && row.sourceIp && row.account && text !== '[설명 제외]');
  const clearGuessing = valid && failure && isLogin && !afterSuccess
    && row.level >= guessing.condition.minLevel && count >= guessing.condition.minFailures
    && (windowSeconds !== null ? windowSeconds <= guessing.condition.windowSeconds
      : repeated || noSuccess);
  const clearSpraying = valid && failure && !afterSuccess && samePassword
    && row.level >= spraying.condition.minLevel && accountCount >= spraying.condition.minAccounts;
  return {
    ...row, count, accountCount, windowSeconds, samePassword, noSuccess, afterSuccess,
    failure, mitre, valid, clear: clearGuessing || clearSpraying,
    pattern: samePassword ? spraying.name : guessing.name,
  };
}
