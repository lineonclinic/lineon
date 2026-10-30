// 라인온의원 온라인 시술실 — 설정
// 공개용 키만 들어갑니다 (service_role 키는 절대 넣지 마세요).
window.LINEON_CONFIG = {
  supabaseUrl: "https://smtcttvwifhfkueuwbdc.supabase.co",
  supabaseKey: "sb_publishable_PKWq13WsqbdfnLHWIvyijg_9rcqtbm6",
  kakao: "https://pf.kakao.com/_nxbhaX",
  // BGM 후보 (위에서부터 재생 시도, 실패하면 다음으로). 직접 파일을 넣으려면 assets/bgm.mp3 로 저장하면 가장 먼저 시도합니다.
  bgm: [
    { src: "assets/bgm.mp3", credit: "" },
    { src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/68/Kevin_MacLeod_-_Erik_Satie_Gymnopedie_No_1.ogg/Kevin_MacLeod_-_Erik_Satie_Gymnopedie_No_1.ogg.mp3", credit: "Gymnopédie No.1 · Kevin MacLeod (CC BY 3.0)" },
    { src: "https://upload.wikimedia.org/wikipedia/commons/6/68/Kevin_MacLeod_-_Erik_Satie_Gymnopedie_No_1.ogg", credit: "Gymnopédie No.1 · Kevin MacLeod (CC BY 3.0)" },
    { src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/Gymnopedie_No._1..ogg/Gymnopedie_No._1..ogg.mp3", credit: "Gymnopédie No.1 · Wikimedia Commons" },
    { src: "https://upload.wikimedia.org/wikipedia/commons/b/b7/Gymnopedie_No._1..ogg", credit: "Gymnopédie No.1 · Wikimedia Commons" }
  ],
  roomCapacity: 40            // 한 방 최대 인원. 넘치면 자동으로 다음 방(2실, 3실…)으로 배정
};
