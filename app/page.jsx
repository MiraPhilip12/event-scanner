'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Toaster, toast } from 'react-hot-toast';

export default function Home() {
  const [scanType, setScanType] = useState('check_in');
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
  const deviceId = useRef(`device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    // Initialize scanner
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 5,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
    }, false);
    
    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;
    
    // Load stats
    loadStats();
    
    // Load recent scans from localStorage
    const storedScans = localStorage.getItem('event_recent_scans');
    if (storedScans) {
      try {
        setRecentScans(JSON.parse(storedScans).slice(0, 10));
      } catch (e) {
        console.log('Error loading scans:', e);
      }
    }
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  const onScanSuccess = async (decodedText) => {
    if (!decodedText) return;
    
    try {
      setIsLoading(true);
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
        toast.success(`${data.attendee.name} ${scanType === 'check_in' ? 'checked in' : 'checked out'}!`);
        
        // Add to recent scans
        const newScan = {
          ...data.attendee,
          scanType,
          timestamp: new Date().toISOString()
        };
        
        setRecentScans(prev => {
          const updated = [newScan, ...prev.slice(0, 9)];
          localStorage.setItem('event_recent_scans', JSON.stringify(updated));
          return updated;
        });
        
        // Update stats
        loadStats();
        
      } else {
        toast.error(data.error || 'Scan failed');
      }
    } catch (error) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
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
      toast.error('Please select an Excel file');
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
        toast.success(`Imported ${data.imported} attendees!`);
        loadStats();
      } else {
        toast.error(data.error || 'Import failed');
      }
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
    }
  };

  const handleStartScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
    }
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 5,
      qrbox: { width: 250, height: 250 },
    }, false);
    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;
  };

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '1400px', 
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: '#f5f7fa',
      fontFamily: 'Arial, sans-serif'
    }}>
      <Toaster position="top-right" />
      
      {/* Header */}
      <header style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '30px',
        textAlign: 'center'
      }}>
        <h1 style={{ margin: 0 }}>🎫 Event QR Scanner System</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>
          Device: {deviceId.current.substring(0, 15)}...
        </p>
      </header>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '30px'
      }}>
        <StatCard title="Total" value={stats.total} color="#3498db" />
        <StatCard title="Checked In" value={stats.checked_in} color="#2ecc71" />
        <StatCard title="Pending" value={stats.pending} color="#f39c12" />
        <StatCard title="Checked Out" value={stats.checked_out} color="#e74c3c" />
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Left Column */}
        <div>
          {/* Upload */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h2>📁 Import Excel Data</h2>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={isUploading}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '10px',
                border: '2px dashed #ddd',
                borderRadius: '5px'
              }}
            />
            {isUploading && <p style={{ color: '#3498db' }}>Uploading...</p>}
            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              Columns: <strong>Name, Phone, QR Payload, SeatID, Category</strong>
            </p>
          </div>

          {/* Scanner */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}>
            <h2>📱 QR Scanner</h2>
            
            {/* Mode Selection */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => setScanType('check_in')}
                style={{
                  flex: 1,
                  padding: '15px',
                  backgroundColor: scanType === 'check_in' ? '#27ae60' : '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                ✓ CHECK IN
              </button>
              <button
                onClick={() => setScanType('check_out')}
                style={{
                  flex: 1,
                  padding: '15px',
                  backgroundColor: scanType === 'check_out' ? '#e74c3c' : '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                ↩ CHECK OUT
              </button>
            </div>
            
            {/* Scanner Status */}
            <div style={{
              padding: '10px',
              backgroundColor: scanType === 'check_in' ? '#d5f4e6' : '#fadbd8',
              borderRadius: '8px',
              marginBottom: '20px',
              border: `2px solid ${scanType === 'check_in' ? '#27ae60' : '#e74c3c'}`
            }}>
              <strong>{scanType === 'check_in' ? 'CHECK IN MODE' : 'CHECK OUT MODE'}</strong>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                {scanType === 'check_in' ? 'Scan tickets for entry' : 'Scan tickets for exit'}
              </p>
            </div>
            
            {/* QR Scanner Container */}
            <div id="qr-reader"></div>
            
            {/* Scanner Controls */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleStopScanner}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                ⏸️ Stop Scanner
              </button>
              <button
                onClick={handleStartScanner}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                ▶️ Start Scanner
              </button>
            </div>
            
            {isLoading && (
              <p style={{ color: '#3498db', marginTop: '10px' }}>Processing scan...</p>
            )}
          </div>
        </div>

        {/* Right Column - Recent Scans */}
        <div>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            height: '100%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>🕐 Recent Scans</h2>
              <button
                onClick={() => {
                  setRecentScans([]);
                  localStorage.removeItem('event_recent_scans');
                }}
                style={{
                  padding: '5px 10px',
                  backgroundColor: 'transparent',
                  color: '#e74c3c',
                  border: '1px solid #e74c3c',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Clear All
              </button>
            </div>
            
            {recentScans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#95a5a6' }}>
                No scans yet
              </div>
            ) : (
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {recentScans.map((scan, index) => (
                  <div 
                    key={index}
                    style={{
                      padding: '15px',
                      marginBottom: '10px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      borderLeft: `5px solid ${scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                          {scan.name}
                        </div>
                        <div style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '5px' }}>
                          📞 {scan.phone} • 💺 {scan.seat_id} • {scan.category}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          padding: '5px 10px',
                          backgroundColor: scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c',
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {scan.scanType === 'check_in' ? 'IN' : 'OUT'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#95a5a6', marginTop: '5px' }}>
                          {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        padding: '20px',
        backgroundColor: '#34495e',
        color: 'white',
        borderRadius: '10px',
        textAlign: 'center',
        fontSize: '14px'
      }}>
        <p style={{ margin: 0 }}>
          Event Management System • All data stored in database • 
          Share URL with other operators: <strong>{typeof window !== 'undefined' ? window.location.origin : ''}</strong>
        </p>
      </footer>
    </div>
  );
}

function StatCard({ title, value, color }) {
  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '10px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
      textAlign: 'center',
      borderTop: `5px solid ${color}`
    }}>
      <div style={{ fontSize: '14px', color: '#7f8c8d', marginBottom: '10px' }}>
        {title}
      </div>
      <div style={{ fontSize: '36px', fontWeight: 'bold', color: color }}>
        {value}
      </div>
    </div>
  );
}