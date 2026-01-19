'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Toaster, toast } from 'react-hot-toast';

export default function Home() {
  // =========================
  // STATE & REFS
  // =========================
  const [mode, setMode] = useState('check_in');
  const modeRef = useRef('check_in'); // 🔥 FIXES CLOSURE BUG

  const [recentScans, setRecentScans] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    checked_in: 0,
    checked_out: 0,
    pending: 0
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const scannerRef = useRef(null);
  const scanTimestamps = useRef({});

  const deviceId = useRef(
    typeof window !== 'undefined'
      ? localStorage.getItem('event_scanner_device_id') ||
        `device_${Date.now()}_${Math.random().toString(36).slice(2)}`
      : ''
  );

  // =========================
  // KEEP REF IN SYNC
  // =========================
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('event_scanner_device_id', deviceId.current);
    }

    loadStats();

    setTimeout(() => {
      initializeScanner();
    }, 500);

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  // =========================
  // SCANNER INIT
  // =========================
  const initializeScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
    }

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 5,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true
      },
      false
    );

    scanner.render(onScanSuccess, () => {});
    scannerRef.current = scanner;
  };

  // =========================
  // SCAN HANDLER
  // =========================
  const onScanSuccess = async (decodedText) => {
    if (!decodedText) return;

    const now = Date.now();
    if (
      scanTimestamps.current[decodedText] &&
      now - scanTimestamps.current[decodedText] < 3000
    ) {
      return;
    }
    scanTimestamps.current[decodedText] = now;

    try {
      setIsLoading(true);

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrPayload: decodedText.trim(),
          mode: modeRef.current, // 🔥 ALWAYS CORRECT
          deviceId: deviceId.current,
          operatorName: 'Operator'
        })
      });

      const data = await response.json();

      if (!data.success) {
        playBeep('error');
        toast.error(data.error);
        return;
      }

      playBeep(data.action === 'check_in' ? 'checkin' : 'checkout');

      const newScan = {
        id: data.attendee.id,
        name: data.attendee.name,
        phone: data.attendee.phone,
        seat_id: data.attendee.seat_id,
        category: data.attendee.category,
        status: data.attendee.status,
        scanType: data.action, // FROM BACKEND
        timestamp: new Date().toISOString(),
        last_scanned_by: data.attendee.last_scanned_by
      };

      setRecentScans(prev => {
        const updated = [newScan, ...prev.slice(0, 9)];
        localStorage.setItem('event_recent_scans', JSON.stringify(updated));
        return updated;
      });

      loadStats();

      toast.success(
        `${data.attendee.name} ${
          data.action === 'check_in' ? 'checked in' : 'checked out'
        } successfully`
      );
    } catch (error) {
      playBeep('error');
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================
  // STATS
  // =========================
  const loadStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch {}
  };

  // =========================
  // SOUND
  // =========================
  const playBeep = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.frequency.value =
        type === 'checkin' ? 1000 : type === 'checkout' ? 600 : 300;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 20 }}>
      <Toaster position="top-right" />

      {/* MODE BUTTONS */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => {
            setMode('check_in');
            modeRef.current = 'check_in';
          }}
          style={{
            padding: 16,
            marginRight: 10,
            background: mode === 'check_in' ? '#27ae60' : '#ccc',
            color: 'white',
            fontWeight: 'bold'
          }}
        >
          CHECK IN
        </button>

        <button
          onClick={() => {
            setMode('check_out');
            modeRef.current = 'check_out';
          }}
          style={{
            padding: 16,
            background: mode === 'check_out' ? '#e74c3c' : '#ccc',
            color: 'white',
            fontWeight: 'bold'
          }}
        >
          CHECK OUT
        </button>
      </div>

      {/* SCANNER */}
      <div id="qr-reader" style={{ width: 320, marginBottom: 20 }} />

      {/* LOADING */}
      {isLoading && <div>Processing scan...</div>}

      {/* RECENT SCANS */}
      <h3>Recent Scans</h3>
      {recentScans.length === 0 ? (
        <div>No scans yet</div>
      ) : (
        recentScans.map((scan, i) => (
          <div key={i}>
            {scan.name} —{' '}
            <strong>
              {scan.scanType === 'check_in' ? 'IN' : 'OUT'}
            </strong>
          </div>
        ))
      )}

      {/* STATS */}
      <h3 style={{ marginTop: 30 }}>Stats</h3>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </div>
  );
}
