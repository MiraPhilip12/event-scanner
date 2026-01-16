'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function Home() {
  const [scanType, setScanType] = useState('check_in');
  const [recentScans, setRecentScans] = useState([]);
  const [stats, setStats] = useState({ total: 0, checked_in: 0, pending: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const scannerRef = useRef(null);
  const deviceId = useRef(`device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    }, false);
    
    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;
    
    loadStats();
    
    return () => {
      scanner.clear();
    };
  }, []);

  const onScanSuccess = async (decodedText) => {
    if (!decodedText) return;
    
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrPayload: decodedText.trim(),
          scanType,
          deviceId: deviceId.current,
          operator: 'Operator'
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Play beep
        if (typeof window !== 'undefined') {
          const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3');
          audio.play().catch(e => console.log('Audio error:', e));
        }
        
        setRecentScans(prev => [{
          ...data.attendee,
          scanType,
          timestamp: new Date().toISOString()
        }, ...prev.slice(0, 9)]);
        
        loadStats();
        alert(`✅ ${data.attendee.name} ${scanType === 'check_in' ? 'checked in' : 'checked out'}!`);
      } else {
        alert(`❌ ${data.error || 'Not found'}`);
      }
    } catch (error) {
      alert('Network error. Please try again.');
    }
  };

  const onScanError = (error) => {
    console.log('QR error:', error);
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.log('Stats error:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.match(/\.(xlsx|xls)$/)) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Imported ${data.imported} attendees!`);
        loadStats();
      } else {
        alert(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      alert('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Arial' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>🎫 Event QR Scanner</h1>
      
      {/* Upload Section */}
      <div style={{ backgroundColor: '#f0f8ff', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <h2>📁 1. Upload Excel File</h2>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={isUploading}
          style={{ width: '100%', padding: '10px', marginTop: '10px' }}
        />
        {isUploading && <p>Uploading...</p>}
        <p style={{ fontSize: '14px', color: '#666' }}>
          Columns: <strong>Name, Phone, QR Payload, SeatID, Category</strong>
        </p>
      </div>
      
      {/* Scanner Section */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', marginBottom: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
        <h2>📱 2. Scanner</h2>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={() => setScanType('check_in')}
            style={{
              flex: 1,
              padding: '15px',
              backgroundColor: scanType === 'check_in' ? 'green' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px'
            }}
          >
            ✓ Check In
          </button>
          <button
            onClick={() => setScanType('check_out')}
            style={{
              flex: 1,
              padding: '15px',
              backgroundColor: scanType === 'check_out' ? 'blue' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px'
            }}
          >
            ↩ Check Out
          </button>
        </div>
        
        <div id="qr-reader"></div>
        
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <strong>Device ID:</strong> {deviceId.current.substring(0, 15)}...
          <br />
          <strong>Mode:</strong> {scanType === 'check_in' ? 'Check In' : 'Check Out'}
        </div>
      </div>
      
      {/* Stats & Recent Scans */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
        {/* Stats */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <h3>📊 Stats</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total:</span>
              <strong style={{ fontSize: '20px' }}>{stats.total}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'green' }}>
              <span>Checked In:</span>
              <strong style={{ fontSize: '20px' }}>{stats.checked_in}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'orange' }}>
              <span>Pending:</span>
              <strong style={{ fontSize: '20px' }}>{stats.pending}</strong>
            </div>
          </div>
          <button
            onClick={loadStats}
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '15px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Refresh Stats
          </button>
        </div>
        
        {/* Recent Scans */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto' }}>
          <h3>🕐 Recent Scans</h3>
          {recentScans.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center' }}>No scans yet</p>
          ) : (
            <div>
              {recentScans.map((scan, index) => (
                <div key={index} style={{
                  padding: '10px',
                  marginBottom: '10px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '5px',
                  borderLeft: `5px solid ${scan.scanType === 'check_in' ? 'green' : 'blue'}`
                }}>
                  <div style={{ fontWeight: 'bold' }}>{scan.name}</div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {scan.seat_id} • {scan.phone}
                    <br />
                    <span style={{ 
                      color: scan.scanType === 'check_in' ? 'green' : 'blue',
                      fontWeight: 'bold'
                    }}>
                      {scan.scanType === 'check_in' ? 'IN' : 'OUT'}
                    </span>
                    {' '}at {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Instructions */}
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px' }}>
        <h3>ℹ️ How to Use</h3>
        <ol>
          <li>Upload your Excel file</li>
          <li>Allow camera access</li>
          <li>Select Check In or Check Out mode</li>
          <li>Scan QR codes</li>
          <li>Share with others: <strong>https://event-scanner.vercel.app</strong></li>
        </ol>
      </div>
    </div>
  );
}