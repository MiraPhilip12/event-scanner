'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Toaster, toast } from 'react-hot-toast';

export default function Home() {
  const [mode, setMode] = useState('check_in');
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

  // Initialize on component mount
  useEffect(() => {
    // Load device ID from localStorage or create new
    const storedDeviceId = localStorage.getItem('event_scanner_device_id');
    if (storedDeviceId) {
      deviceId.current = storedDeviceId;
    } else {
      localStorage.setItem('event_scanner_device_id', deviceId.current);
    }
    
    // Load recent scans from localStorage
    const storedScans = localStorage.getItem('event_recent_scans');
    if (storedScans) {
      try {
        const parsedScans = JSON.parse(storedScans);
        // Filter out any invalid entries and keep only last 10
        const validScans = parsedScans
          .filter(scan => scan && scan.name && scan.timestamp)
          .slice(0, 10);
        setRecentScans(validScans);
      } catch (e) {
        console.log('Error loading scans from localStorage:', e);
        localStorage.removeItem('event_recent_scans');
      }
    }
    
    // Load stats
    loadStats();
    
    // Initialize scanner after a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      initializeScanner();
    }, 500);
    
    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  const initializeScanner = () => {
    // Clear any existing scanner
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (e) {
        console.log('Error clearing scanner:', e);
      }
    }
    
    try {
      const scanner = new Html5QrcodeScanner('qr-reader', {
        fps: 5,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
      }, false);
      
      scanner.render(onScanSuccess, onScanError);
      scannerRef.current = scanner;
    } catch (error) {
      console.error('Failed to initialize scanner:', error);
      toast.error('Failed to initialize QR scanner. Please refresh the page.');
    }
  };

  // Debounce scan to prevent duplicates
  const scanTimestamps = useRef({});
  const onScanSuccess = async (decodedText) => {
    if (!decodedText) return;
    
    // Debounce: prevent scanning same QR within 3 seconds
    const now = Date.now();
    const lastScan = scanTimestamps.current[decodedText];
    if (lastScan && (now - lastScan) < 3000) {
      console.log('⚠️ Scan debounced (duplicate prevention)');
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
          mode,
          deviceId: deviceId.current,
          operatorName: 'Operator'
        })

      });
      
      const data = await response.json();
      
      if (data.success) {
        // Play success sound
        playBeep(scanType === 'check_in' ? 'checkin' : 'checkout');
        
        // Add to recent scans with proper data
        const newScan = {
          id: data.attendee.id,
          name: data.attendee.name,
          phone: data.attendee.phone,
          seat_id: data.attendee.seat_id,
          category: data.attendee.category,
          status: data.attendee.status,
          scanType: data.action,
          timestamp: new Date().toISOString(),
          last_scanned_by: data.attendee.last_scanned_by
        };
        
        setRecentScans(prev => {
          const updated = [newScan, ...prev.slice(0, 9)];
          // Store in localStorage with error handling
          try {
            localStorage.setItem('event_recent_scans', JSON.stringify(updated));
          } catch (e) {
            console.log('LocalStorage error:', e);
          }
          return updated;
        });
        
        // Update stats
        loadStats();
        
        // Show success message
        toast.success(
          <div>
            <strong>{data.attendee.name}</strong>
            <div>{scanType === 'check_in' ? 'Checked IN successfully!' : 'Checked OUT successfully!'}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>
              Seat: {data.attendee.seat_id} • {new Date().toLocaleTimeString()}
            </div>
          </div>,
          { duration: 4000 }
        );
        
      } else {
        // Play error sound
        playBeep('error');
        toast.error(
          <div>
            <strong>Scan Failed</strong>
            <div>{data.error}</div>
          </div>,
          { duration: 5000 }
        );
      }
    } catch (error) {
      playBeep('error');
      toast.error(
        <div>
          <strong>Network Error</strong>
          <div>Please check your connection</div>
        </div>,
        { duration: 3000 }
      );
      console.error('Scan request error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onScanError = (error) => {
    console.log('QR Scanner error:', error);
  };

  const playBeep = (type) => {
    if (typeof window === 'undefined') return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Different frequencies for different actions
      let frequency = 800;
      if (type === 'checkin') frequency = 1000;
      if (type === 'checkout') frequency = 600;
      if (type === 'error') frequency = 300;
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
      // Fallback silent
    }
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
      toast.error('Please select an Excel file (.xlsx or .xls)');
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
        toast.success(`✅ Successfully imported ${data.imported} attendees!`);
        loadStats();
      } else {
        toast.error(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      toast.error('⚠️ Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const handleStopScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
        toast.success('Scanner stopped');
      } catch (e) {
        console.log('Error stopping scanner:', e);
      }
    }
  };

  const handleStartScanner = () => {
    initializeScanner();
    toast.success('Scanner started');
  };

  const handleClearHistory = () => {
    if (confirm('Clear recent scans history? This will not delete database records.')) {
      setRecentScans([]);
      localStorage.removeItem('event_recent_scans');
      toast.success('History cleared');
    }
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
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '25px',
        borderRadius: '15px',
        marginBottom: '30px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '32px' }}>🎫 Event QR Scanner System</h1>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '15px',
          fontSize: '14px',
          opacity: 0.9
        }}>
          <div>
            <strong>Device ID:</strong> {deviceId.current.substring(0, 12)}...
          </div>
          <div>
            <strong>Last Updated:</strong> {new Date().toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '40px'
      }}>
        <StatCard 
          title="Total Attendees" 
          value={stats.total} 
          color="#3498db"
          icon="👥"
        />
        <StatCard 
          title="Checked In" 
          value={stats.checked_in} 
          color="#2ecc71"
          icon="✅"
          subtitle={`${stats.currently_inside || 0} currently inside`}
        />
        <StatCard 
          title="Pending" 
          value={stats.pending} 
          color="#f39c12"
          icon="⏳"
        />
        <StatCard 
          title="Checked Out" 
          value={stats.checked_out} 
          color="#e74c3c"
          icon="🚪"
        />
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Left Column */}
        <div>
          {/* Upload Section */}
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '15px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            marginBottom: '25px',
            border: '1px solid #e0e0e0'
          }}>
            <h2 style={{ 
              marginTop: 0, 
              color: '#2c3e50',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '24px' }}>📁</span>
              Import Excel Data
            </h2>
            
            <label style={{
              display: 'block',
              padding: '30px',
              border: '2px dashed #3498db',
              borderRadius: '10px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: '#ebf5fb',
              transition: 'all 0.3s',
              marginTop: '15px'
            }}>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isUploading}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>
                {isUploading ? '⏳' : '📤'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c3e50' }}>
                {isUploading ? 'Uploading...' : 'Click to Upload Excel File'}
              </div>
              <div style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '10px' }}>
                Supports .xlsx and .xls formats
              </div>
            </label>
            
            <div style={{ 
              marginTop: '20px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#666'
            }}>
              <strong>Required columns:</strong> Name, Phone, QR Payload, SeatID, Category
              <br />
              <em>Arabic names are fully supported</em>
            </div>
          </div>

          {/* Scanner Section */}
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '15px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            border: '1px solid #e0e0e0'
          }}>
            <h2 style={{ 
              marginTop: 0, 
              color: '#2c3e50',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '24px' }}>📱</span>
              QR Code Scanner
            </h2>
            
            {/* Mode Selection */}
            <div style={{ 
              display: 'flex', 
              gap: '10px', 
              marginBottom: '25px',
              backgroundColor: '#f8f9fa',
              padding: '15px',
              borderRadius: '10px'
            }}>
              <button
                onClick={() => setMode('check_in')}
                style={{
                  flex: 1,
                  padding: '18px',
                  backgroundColor: scanType === 'check_in' ? '#27ae60' : '#e0e0e0',
                  color: scanType === 'check_in' ? 'white' : '#666',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  transform: scanType === 'check_in' ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: scanType === 'check_in' ? '0 4px 15px rgba(39, 174, 96, 0.3)' : 'none'
                }}
              >
                ✓ CHECK IN
              </button>
              <button
                onClick={() => setMode('check_out')}
                style={{
                  flex: 1,
                  padding: '18px',
                  backgroundColor: scanType === 'check_out' ? '#e74c3c' : '#e0e0e0',
                  color: scanType === 'check_out' ? 'white' : '#666',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  transform: scanType === 'check_out' ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: scanType === 'check_out' ? '0 4px 15px rgba(231, 76, 60, 0.3)' : 'none'
                }}
              >
                ↩ CHECK OUT
              </button>
            </div>
            
            {/* Scanner Status */}
            <div style={{
              padding: '15px',
              backgroundColor: scanType === 'check_in' ? '#d5f4e6' : '#fadbd8',
              borderRadius: '10px',
              marginBottom: '25px',
              border: `3px solid ${scanType === 'check_in' ? '#27ae60' : '#e74c3c'}`,
              textAlign: 'center'
            }}>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 'bold',
                color: scanType === 'check_in' ? '#27ae60' : '#e74c3c'
              }}>
                {scanType === 'check_in' ? 'CHECK IN MODE' : 'CHECK OUT MODE'}
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#7f8c8d',
                marginTop: '5px'
              }}>
                {scanType === 'check_in' 
                  ? 'Scan tickets for event entry' 
                  : 'Scan tickets for event exit'}
              </div>
            </div>
            
            {/* QR Scanner Container */}
            <div id="qr-reader" style={{ 
              width: '100%',
              minHeight: '300px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}></div>
            
            {/* Scanner Controls */}
            <div style={{ 
              display: 'flex', 
              gap: '15px', 
              marginTop: '25px'
            }}>
              <button
                onClick={handleStopScanner}
                style={{
                  flex: 1,
                  padding: '15px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>⏸️</span> Stop Scanner
              </button>
              <button
                onClick={handleStartScanner}
                style={{
                  flex: 1,
                  padding: '15px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>▶️</span> Start Scanner
              </button>
              <button
                onClick={loadStats}
                style={{
                  padding: '15px 25px',
                  backgroundColor: '#9b59b6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>🔄</span> Refresh
              </button>
            </div>
            
            {isLoading && (
              <div style={{
                marginTop: '20px',
                padding: '15px',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #ffeaa7'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '10px'
                }}>
                  <div className="spinner"></div>
                  <span style={{ color: '#856404', fontWeight: 'bold' }}>
                    Processing scan...
                  </span>
                </div>
              </div>
            )}
            
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #3498db;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                animation: spin 1s linear infinite;
              }
            `}</style>
          </div>
        </div>

        {/* Right Column - Recent Scans */}
        <div>
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '15px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            height: '100%',
            border: '1px solid #e0e0e0',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '25px'
            }}>
              <h2 style={{ 
                margin: 0, 
                color: '#2c3e50',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '24px' }}>🕐</span>
                Recent Scans ({recentScans.length})
              </h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleClearHistory}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    color: '#e74c3c',
                    border: '1px solid #e74c3c',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
            
            {recentScans.length === 0 ? (
              <div style={{ 
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                color: '#bdc3c7',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>📷</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                  No Scans Yet
                </div>
                <div style={{ fontSize: '14px' }}>
                  Scan tickets to see them appear here
                </div>
              </div>
            ) : (
              <div style={{ 
                flex: 1,
                overflowY: 'auto',
                paddingRight: '10px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {recentScans.map((scan, index) => (
                    <div 
                      key={`${scan.id}-${scan.timestamp}-${index}`}
                      style={{
                        padding: '20px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '12px',
                        borderLeft: `6px solid ${scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c'}`,
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        ':hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px',
                            marginBottom: '8px'
                          }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              backgroundColor: scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '18px'
                            }}>
                              {scan.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ 
                                fontSize: '18px', 
                                fontWeight: 'bold', 
                                color: '#2c3e50',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}>
                                {scan.name}
                                <span style={{
                                  padding: '4px 10px',
                                  backgroundColor: scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c',
                                  color: 'white',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 'bold'
                                }}>
                                  {scan.scanType === 'check_in' ? 'IN' : 'OUT'}
                                </span>
                              </div>
                              <div style={{ 
                                fontSize: '14px', 
                                color: '#7f8c8d',
                                marginTop: '4px'
                              }}>
                                <div>📞 {scan.phone}</div>
                                <div>💺 Seat: {scan.seat_id} • Category: {scan.category}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: '120px' }}>
                          <div style={{ 
                            fontSize: '14px', 
                            color: '#95a5a6',
                            marginBottom: '5px'
                          }}>
                            {new Date(scan.timestamp).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </div>
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#7f8c8d',
                            backgroundColor: '#ecf0f1',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}>
                            {scan.last_scanned_by || 'System'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: '50px',
        padding: '25px',
        backgroundColor: '#2c3e50',
        color: 'white',
        borderRadius: '15px',
        textAlign: 'center',
        fontSize: '14px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>Event Management System</div>
            <div style={{ opacity: 0.8, fontSize: '12px', marginTop: '5px' }}>
              Professional QR Scanning Solution
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold' }}>Share with Operators:</div>
            <div style={{ 
              backgroundColor: 'rgba(255,255,255,0.1)', 
              padding: '8px 15px',
              borderRadius: '20px',
              marginTop: '5px',
              fontSize: '13px',
              wordBreak: 'break-all'
            }}>
              {typeof window !== 'undefined' ? window.location.origin : 'Loading...'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>
              Device: {deviceId.current.substring(0, 8)}...
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
              {new Date().toLocaleDateString()} • v1.0
            </div>
          </div>
        </div>
        <div style={{ 
          marginTop: '20px', 
          paddingTop: '15px', 
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: '12px',
          opacity: 0.7
        }}>
          All data persists in database • Real-time sync across devices • 
          Supports Arabic and English names • Up to 30 concurrent operators
        </div>
      </footer>
    </div>
  );
}

function StatCard({ title, value, color, icon, subtitle }) {
  return (
    <div style={{
      backgroundColor: 'white',
      padding: '25px',
      borderRadius: '15px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
      borderTop: `5px solid ${color}`,
      transition: 'transform 0.3s',
      cursor: 'pointer',
      ':hover': {
        transform: 'translateY(-5px)',
        boxShadow: '0 8px 25px rgba(0,0,0,0.1)'
      }
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '20px',
        marginBottom: subtitle ? '10px' : '0'
      }}>
        <div style={{
          fontSize: '36px',
          backgroundColor: `${color}20`,
          width: '70px',
          height: '70px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: '14px', 
            color: '#7f8c8d', 
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            {title}
          </div>
          <div style={{ 
            fontSize: '42px', 
            fontWeight: 'bold', 
            color: color,
            marginTop: '5px'
          }}>
            {value}
          </div>
        </div>
      </div>
      {subtitle && (
        <div style={{ 
          fontSize: '13px', 
          color: '#95a5a6',
          marginTop: '15px',
          paddingTop: '15px',
          borderTop: '1px solid #f0f0f0'
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}