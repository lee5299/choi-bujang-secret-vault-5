import { evidenceFor, guessing, isNormalEvent } from './evidence.mjs';
import { createJevClient } from './jev.mjs';

function actionFor(confidence) {
  return confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
}

// 패턴으로 구분할 수 없는 경보만 Jev에 전달합니다.
function createDecider({ jev, timeoutMs = 5000 }) {
  const history = new Map();
  return async function decide(alert) {
    const e = evidenceFor(alert);
    if (!e.valid) return { action: 'alert', confidence: 0.5, reason: e.pattern };
    if (isNormalEvent(e)) {
      return { action: 'record', confidence: 0.1, reason: '패턴 없음' };
    }

    // 가상 단일 실패도 같은 주소·같은 계정으로만 합산합니다.
    // Wazuh 요약 count>1은 이미 합산된 경보이므로 다시 더하지 않습니다.
    let accumulated = false;
    if (e.count <= 1 && !e.afterSuccess) {
      const key = `${e.sourceIp}/${e.account}`;
      const at = Date.parse(e.timestamp);
      const windowMs = guessing.condition.windowSeconds * 1000;
      for (const [entryKey, entries] of history) {
        const live = entries.filter(item => item.at >= at - windowMs);
        if (live.length) history.set(entryKey, live); else history.delete(entryKey);
      }
      const entries = history.get(key) ?? [];
      const id = typeof alert?.id === 'string' ? alert.id : e.timestamp;
      if (!entries.some(item => item.id === id)) entries.push({ id, at });
      history.set(key, entries);
      accumulated = entries.filter(item => item.at <= at && item.at >= at - windowMs).length
        >= guessing.condition.minFailures && e.level >= guessing.condition.minLevel;
    }
    if (e.clear || accumulated) return { action: 'block', confidence: 0.95, reason: e.pattern };

    let timer;
    const controller = new AbortController();
    try {
      if (typeof jev !== 'function') throw new Error('Jev unavailable');
      // 식별자·설명 대신 패턴과 수치·불리언 신호만 전달합니다.
      const input = Object.freeze({
        pattern: e.pattern, level: e.level, failureCount: e.count,
        accountCount: e.accountCount, windowSeconds: e.windowSeconds,
        samePasswordSignal: e.samePassword, successAfterFailures: e.afterSuccess,
      });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Jev timeout')); }, timeoutMs);
      });
      const reply = await Promise.race([
        Promise.resolve().then(() => jev(input, { signal: controller.signal })), timeout,
      ]);
      const confidence = reply?.confidence;
      if (typeof confidence !== 'number' || !Number.isFinite(confidence)
          || confidence < 0 || confidence > 1) throw new Error('Jev invalid response');
      return { action: actionFor(confidence), confidence, reason: e.pattern };
    } catch {
      return { action: 'alert', confidence: 0.5, reason: e.pattern };
    } finally {
      clearTimeout(timer);
    }
  };
}

// 키의 기본값은 비어 있습니다. 실제 값은 실행 환경의 비밀 설정에서만 받습니다.
const apiKey = process.env.TYPESAFE_API_KEY ?? '';
let jevClient;
const askJev = (input, options) => {
  jevClient ??= createJevClient({ apiKey });
  return jevClient(input, options);
};

export const decide = createDecider({ jev: askJev });
// 실행 기록용 수치만 제공합니다. 키·원문 요청·원문 응답은 포함하지 않습니다.
decide.getJevStats = () => jevClient?.getStats() ?? { attempted: 0, succeeded: 0, failed: 0 };
