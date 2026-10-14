// 이전 UI 회귀의 정상 기기는 이미 승인·인증된 것으로 설정합니다.
// 실제 미승인·서명·WebAuthn 동작은 device-stage11.test.mjs에서 별도로 검사합니다.
export function approvedDeviceUi(fetch) {
  return { create({ getSession, onState }) {
    return { clear: () => onState({ approved: false, status: 'signed_out' }),
      status: async () => onState({ approved: Boolean(getSession()), status: getSession() ? 'approved' : 'signed_out' }),
      verify: async () => onState({ approved: true, status: 'approved' }),
      register: async () => onState({ approved: false, status: 'pending' }),
      protectedFetch: fetch };
  } };
}
