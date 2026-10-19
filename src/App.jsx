import React, { useState, useEffect, useRef } from 'react';
import { registerPlugin } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Radio } from 'lucide-react';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// 사용자 제공 Firebase 설정 반영완료
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

const INITIAL_MEMBERS = {
  m1: { id: 'm1', name: '현일', emoji: '😎', color: '#3b82f6', lat: 35.6938, lng: 139.7034, status: '이동 중 🏃', updatedAt: Date.now() },
  m2: { id: 'm2', name: '일행 2', emoji: '🍺', color: '#10b981', lat: 35.6984, lng: 139.7731, status: '자유시간 🛍️', updatedAt: Date.now() },
  m3: { id: 'm3', name: '일행 3', emoji: '🍣', color: '#f59e0b', lat: 35.6580, lng: 139.7016, status: '식사 중 🍜', updatedAt: Date.now() },
  m4: { id: 'm4', name: '일행 4', emoji: '🎮', color: '#ec4899', lat: 35.7148, lng: 139.7967, status: '대기 중 ☕', updatedAt: Date.now() },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeMember, setActiveMember] = useState(() => localStorage.getItem('my_member_id') || 'm1');
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [isBgTracking, setIsBgTracking] = useState(false);
  const [bgLog, setBgLog] = useState('대기 중 (백그라운드 GPS 대기)');
  const watcherIdRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const selectMember = (id) => {
    setActiveMember(id);
    localStorage.setItem('my_member_id', id);
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
      await setDoc(TRIP_DOC_REF, {
        members: {
          ...members,
          [activeMember]: {
            ...members[activeMember],
            lat,
            lng,
            updatedAt: Date.now()
          }
        }
      }, { merge: true });
      setBgLog(`전송 완료: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setBgLog(`전송 오류: ${err.message}`);
    }
  };

  const toggleBackgroundTracking = async () => {
    if (isBgTracking) {
      if (watcherIdRef.current) {
        await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        watcherIdRef.current = null;
      }
      setIsBgTracking(false);
      setBgLog('추적 중지됨');
      return;
    }

    try {
      setBgLog('백그라운드 추적 시작 중...');
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "🗼 도쿄 4인 실시간 위치 공유",
          backgroundMessage: "화면이 꺼져 있어도 위치를 동기화합니다.",
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
      setBgLog('웹 모드 GPS 작동 중');
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
    mapRef.current = L.map('map-container').setView([35.6938, 139.7034], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(mapRef.current);
  };

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    Object.values(members).forEach((m) => {
      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:${m.color};color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:bold;white-space:nowrap;">
            ${m.emoji} ${m.name}
          </div>
          <div style="width:14px;height:14px;border-radius:50%;background:${m.color};border:2px solid #fff;margin-top:2px;"></div>
        </div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [60, 40], iconAnchor: [30, 35] });
      if (markersRef.current[m.id]) {
        markersRef.current[m.id].setLatLng([m.lat, m.lng]).setIcon(icon);
      } else {
        markersRef.current[m.id] = L.marker([m.lat, m.lng], { icon }).addTo(mapRef.current);
      }
    });
  }, [members]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white select-none">
      <header className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-sm">🗼 도쿄 4인 백그라운드 트래커</h1>
          <p className="text-[11px] text-slate-400">{bgLog}</p>
        </div>
        <button
          onClick={toggleBackgroundTracking}
          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg ${
            isBgTracking ? 'bg-emerald-600 text-white animate-pulse' : 'bg-rose-600 text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          {isBgTracking ? '백그라운드 ON' : '추적 시작'}
        </button>
      </header>

      <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-900/60 border-b border-slate-800">
        {Object.values(members).map((m) => (
          <button
            key={m.id}
            onClick={() => selectMember(m.id)}
            className={`p-2 rounded-lg text-xs font-bold border transition-all ${
              activeMember === m.id ? 'border-blue-500 bg-blue-950/60 text-white' : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <div>{m.emoji} {m.name}</div>
          </button>
        ))}
      </div>

      <div id="map-container" className="flex-1 w-full bg-slate-900" />
    </div>
  );
}
