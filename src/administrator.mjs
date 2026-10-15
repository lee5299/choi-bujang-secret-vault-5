// 이 함수에는 Auth 서버가 getUser로 확인한 사용자만 전달합니다.
// 사용자가 바꿀 수 있는 user_metadata, 요청 본문·헤더, JWT의 오래된 역할은 읽지 않습니다.
export function isAdministrator(authUser) {
  return authUser?.app_metadata?.vault_admin === true;
}
