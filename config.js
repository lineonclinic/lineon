// 라인온의원 온라인 시술실 — 설정
// 공개용 키만 들어갑니다 (service_role 키는 절대 넣지 마세요).
window.LINEON_CONFIG = {
  supabaseUrl: "https://smtcttvwifhfkueuwbdc.supabase.co",
  supabaseKey: "sb_publishable_PKWq13WsqbdfnLHWIvyijg_9rcqtbm6",
  kakao: "https://pf.kakao.com/_nxbhaX",
  bgm: "assets/bgm.mp3",     // 파일이 없으면 조용히 무음으로 동작
  roomCapacity: 40            // 한 방 최대 인원. 넘치면 자동으로 다음 방(2실, 3실…)으로 배정
};
