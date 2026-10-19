import React, { useState, useEffect, useRef } from 'react';
import { registerPlugin } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Radio, Settings, Navigation, Shield, Zap, Terminal, X, UserCheck } from 'lucide-react';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const firebaseConfig = {
  apiKey: "AIzaSyCF_wZ_PaIg4cm_5hQkRQMcXGF8grfYIck",
  authDomain: "dokyo-92942.firebaseapp.com",
  projectId: "dokyo-92942",
  storageBucket: "dokyo-92942.firebasestorage.app",
  messagingSenderId: "461707894791",
  appId: "1:461707894791:web:2a3e20aab5944d7f8b0aa2",
  measurementId: "G-8W0MC48TFW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const TRIP_DOC_REF = doc(db, 'trips', 'tokyo_2026_1031');

// 명조 캐릭터 10종 리스트 (SD 아이콘 및 기본 설정)
const WUTHERING_CHARACTERS = [
  { name: '금희', emoji: '👑', status: '금장 공명자 ⚡' },
  { name: '음림', emoji: '🦊', status: '잔향 주파수 스캔 🔍' },
  { name: '장리', emoji: '🔥', status: '홍련의 심판 대기 🌸' },
  { name: '금장', emoji: '⚔️', status: '전술 지휘 중 🎯' },
  { name: '카카루', emoji: '⚡', status: '뇌전뢰격 모드 ⚡' },
  { name: '엔코', emoji: '🐾', status: '간식 탐색 중 🍎' },
  { name: '양양', emoji: '🍃', status: '바람의 인도 🍃' },
  { name: '치샤', emoji: '🔫', status: '권총 사격 훈련 🎯' },
  { name: '도기', emoji: '🛡️', status: '방어선 구축 🛡️' },
  { name: '방랑자', emoji: '✨', status: '차원 경계 탐색 🌀' },
];

const INITIAL_MEMBERS = {
  m1: { id: 'm1', name: '김현일', emoji: '👑', color: '#eab308', lat: 35.6938, lng: 139.7034, status: '금장 공명자 ⚡', updatedAt: Date.now() },
  m2: { id: 'm2', name: '손민호', emoji: '🦊', color: '#38bdf8', lat: 35.6984, lng: 139.7731, status: '잔향 주파수 스캔 🔍', updatedAt: Date.now() },
  m3: { id: 'm3', name: '김현태', emoji: '🔥', color: '#f43f5e', lat: 35.6580, lng: 139.7016, status: '홍련의 심판 대기 🌸', updatedAt: Date.now() },
  m4: { id: 'm4', name: '김세진', emoji: '⚔️', color: '#a855f7', lat: 35.7148, lng: 139.7967, status: '전술 지휘 중 🎯', updatedAt: Date.now() },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeMemberId, setActiveMemberId] = useState(() => localStorage.getItem('my_member_id') || 'm1');
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [isBgTracking, setIsBgTracking] = useState(false);
  const [bgLog, setBgLog] = useState('백그라운드 GPS 대기 중...');
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const watcherIdRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const activeMember = members[activeMemberId] || members.m1;

  const handleSelectMember = (id) => {
    setActiveMemberId(id);
    localStorage.setItem('my_member_id', id);
    if (members[id]) {
      setEditName(members[id].name);
      setEditEmoji(members[id].emoji);
      setEditStatus(members[id].status);
    }
  };

  const openProfileModal = () => {
    setEditName(activeMember.name);
    setEditEmoji(activeMember.emoji);
    setEditStatus(activeMember.status);
    setShowProfileModal(true);
  };

  const handleSelectCharacter = (char) => {
    setEditName(char.name);
    setEditEmoji(char.emoji);
    setEditStatus(char.status);
  };

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    const updated = {
      ...members,
      [activeMemberId]: {
        ...activeMember,
        name: editName,
        emoji: editEmoji,
        status: editStatus,
        updatedAt: Date.now()
      }
    };
    setMembers(updated);
    setDoc(TRIP_DOC_REF, { members: updated }, { merge: true });
    setShowProfileModal(false);
  };

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        onSnapshot(TRIP_DOC_REF, (snap) => {
          if (snap.exists() && snap.data().members) {
            setMembers(snap.data().members);
          } else {
            setDoc(TRIP_DOC_REF, { members: INITIAL_MEMBERS }, { merge: true });
          }
        });
      }
    });
    return () => unsubAuth();
  }, []);

  const updateMyLocationToCloud = async (lat, lng) => {
    try {
      const updated = {
        ...members,
        [activeMemberId]: {
          ...members[activeMemberId],
          lat,
          lng,
          updatedAt: Date.now()
        }
      };
      setMembers(updated);
      await setDoc(TRIP_DOC_REF, { members: updated }, { merge: true });
      setBgLog(`위치 동기화 완료 [${new Date().toLocaleTimeString()}]`);
    } catch (err) {
      setBgLog(`동기화 오류: ${err.message}`);
    }
  };

  const toggleBackgroundTracking = async () => {
    if (isBgTracking) {
      if (watcherIdRef.current) {
        await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        watcherIdRef.current = null;
      }
      setIsBgTracking(false);
      setBgLog('위치 추적 일시중지됨');
      return;
    }

    try {
      setBgLog('백그라운드 주파수 링크 가동 중...');
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "⚡ TOKYO RESONANCE TRACKER",
          backgroundMessage: `${activeMember.name} 위치 동기화 활성화`,
          requestPermissions: true,
          stale: false,
          distanceFilter: 15
        },
        (location, error) => {
          if (error) {
            if (error.code === "NOT_AUTHORIZED") {
              if (window.confirm("위치 권한을 '항상 허용'으로 설정해주세요.")) {
                BackgroundGeolocation.openSettings();
              }
            }
            setBgLog(`GPS 에러: ${error.message}`);
            return;
          }
          if (location) {
            updateMyLocationToCloud(location.latitude, location.longitude);
          }
        }
      );
      watcherIdRef.current = id;
      setIsBgTracking(true);
    } catch (e) {
      setBgLog('웹 모드 백그라운드 GPS 작동 중');
      navigator.geolocation.watchPosition(
        (pos) => updateMyLocationToCloud(pos.coords.latitude, pos.coords.longitude),
        (err) => setBgLog(`웹 GPS 오류: ${err.message}`),
        { enableHighAccuracy: true }
      );
      setIsBgTracking(true);
    }
  };

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.body.appendChild(script);
    } else {
      initMap();
    }
  }, []);

  const initMap = () => {
    if (mapRef.current || !window.L) return;
    const L = window.L;
    mapRef.current = L.map('map-container', { zoomControl: false }).setView([35.6938, 139.7034], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapRef.current);
  };

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    Object.values(members).forEach((m) => {
      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;font-family:monospace;">
          <div style="background:#090d16;color:#fbbf24;border:1px solid #fbbf24;padding:3px 8px;font-size:10px;font-weight:bold;white-space:nowrap;box-shadow:0 0 10px rgba(251,191,36,0.3);letter-spacing:1px;">
            [${m.emoji} ${m.name}] ${m.status}
          </div>
          <div style="width:12px;height:12px;background:#fbbf24;transform:rotate(45deg);border:2px solid #fff;margin-top:2px;box-shadow:0 0 8px #fbbf24;"></div>
        </div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [120, 45], iconAnchor: [60, 40] });
      if (markersRef.current[m.id]) {
        markersRef.current[m.id].setLatLng([m.lat, m.lng]).setIcon(icon);
      } else {
        markersRef.current[m.id] = L.marker([m.lat, m.lng], { icon }).addTo(mapRef.current);
      }
    });
  }, [members]);

  return (
    <div className="flex flex-col h-screen bg-[#07090e] text-slate-100 font-sans select-none overflow-hidden">
      
      {/* 상단 헤더 */}
      <header className="px-4 py-3 bg-[#0d121f] border-b border-amber-500/30 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 bg-amber-400 rotate-45 animate-pulse shadow-[0_0_8px_#fbbf24]"></div>
          <div>
            <h1 className="font-extrabold text-xs tracking-widest text-amber-400 uppercase">TOKYO 2026 3박4일</h1>
            <p className="text-[9px] text-slate-400 font-mono">{bgLog}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openProfileModal}
            className="px-2.5 py-1 bg-[#151c2e] hover:bg-[#1e2740] text-amber-300 rounded text-[11px] font-bold border border-amber-500/40 flex items-center gap-1 transition shadow"
          >
            <Settings className="w-3 h-3 text-amber-400" />
            프로필 설정
          </button>

          <button
            onClick={toggleBackgroundTracking}
            className={`px-3 py-1 rounded text-[11px] font-extrabold flex items-center gap-1 shadow-lg transition tracking-wider ${
              isBgTracking ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.6)] animate-pulse' : 'bg-[#1b2438] text-slate-300 border border-slate-700'
            }`}
          >
            <Zap className="w-3 h-3" />
            {isBgTracking ? '추적중' : '대기중'}
          </button>
        </div>
      </header>

      {/* 4인 멤버 선택 바 */}
      <div className="grid grid-cols-4 gap-1 p-2 bg-[#0a0e17] border-b border-amber-500/20">
        {Object.values(members).map((m) => {
          const isMe = activeMemberId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => handleSelectMember(m.id)}
              className={`p-2 text-left transition-all border relative overflow-hidden ${
                isMe 
                  ? 'bg-[#161f33] border-amber-400/80 shadow-[inset_0_0_10px_rgba(251,191,36,0.2)]' 
                  : 'bg-[#0d121f]/70 border-slate-800 opacity-70 hover:opacity-100'
              }`}
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-200">{m.emoji} {m.name}</span>
                {isMe && <span className="text-[8px] bg-amber-400 text-slate-950 px-1 font-mono font-bold">나</span>}
              </div>
              <div className="text-[9px] text-amber-300/80 truncate mt-0.5 font-mono">{m.status}</div>
            </button>
          );
        })}
      </div>

      {/* 지도 영역 */}
      <div id="map-container" className="flex-1 w-full bg-[#07090e]" />

      {/* 프로필 설정 모달 (명조 캐릭터 선택 지원) */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-3">
          <div className="bg-[#0d121f] border border-amber-500/50 w-full max-w-sm p-4 shadow-2xl max-h-[90vh] overflow-y-auto"
               style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}>
            <div className="flex items-center justify-between mb-3 border-b border-amber-500/30 pb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-extrabold text-amber-400 tracking-widest uppercase">공명자 프로필 설정</h2>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">설정할 멤버 선택</label>
                <div className="grid grid-cols-4 gap-1">
                  {Object.values(members).map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => handleSelectMember(m.id)}
                      className={`py-1 text-[10px] font-bold border ${
                        activeMemberId === m.id ? 'bg-amber-400 text-slate-950 border-amber-300' : 'bg-[#151c2e] text-slate-300 border-slate-700'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 명조 캐릭터 10종 선택 슬롯 */}
              <div>
                <label className="block text-[10px] font-bold text-amber-400/90 mb-1">⚡ 명조 캐릭터 10종 선택 (탭하면 적용)</label>
                <div className="grid grid-cols-5 gap-1 bg-[#07090e] p-1.5 border border-amber-500/30 rounded">
                  {WUTHERING_CHARACTERS.map((char, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => handleSelectCharacter(char)}
                      className="p-1 bg-[#151c2e] hover:bg-amber-400/20 border border-slate-700 hover:border-amber-400 text-center transition flex flex-col items-center justify-center"
                    >
                      <span className="text-sm">{char.emoji}</span>
                      <span className="text-[9px] text-slate-300 truncate w-full mt-0.5">{char.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">코드네임 (이름)</label>
                <input 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#07090e] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">상징 이모지</label>
                <input 
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  className="w-full bg-[#07090e] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">주파수 상태 메시지</label>
                <input 
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  placeholder="예: 아키하바라 탐색 중 ⚡" 
                  className="w-full bg-[#07090e] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded py-2 text-xs font-bold transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded py-2 text-xs font-extrabold transition shadow-lg"
                >
                  조율 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
