import { initializeOperations } from './operations-controller.mjs';
try {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
  await initializeOperations({ document, createClient });
} catch {
  document.querySelector('#auth-status').textContent = '작전실 로그인 기능을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.';
}
