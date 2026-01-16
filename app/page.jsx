'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function Home() {
  const [scanType, setScanType] = useState('check_in');
  const [recentScans, setRecentScans] = useState([]);
  const [stats, setStats] = useState({ 
    total: 0, 
    checked_in: 0, 
    checked_out: 0, 
    pending: 0,
    currently_inside: 0,
    lastUpdated: new Date().toISOString()
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [allAttendees, setAllAttendees] = useState([]);
  
  const scannerRef = useRef(null);
  const deviceId = useRef(`device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Store in localStorage for persistence
  useEffect(() => {
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
        setRecentScans(JSON.parse(storedScans).slice(0, 10));
      } catch (e) {
        console.log('Error loading stored scans:', e);
      }
    }
  }, []);

  // Initialize scanner
  const initializeScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.clear();
    }
    
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 5, // Reduced from 10 to prevent duplicates
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
      showTorchButtonIfSupported: true,
      showZoomSliderIfSupported: true,
    }, false);
    
    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;
    setIsScanning(true);
    
    // Add custom stop button
    const stopButton = document.getElementById('custom-stop-button');
    if (stopButton) {
      stopButton.onclick = () => {
        if (scannerRef.current) {
          scannerRef.current.clear();
          setIsScanning(false);
        }
      };
    }
  }, []);

  useEffect(() => {
    initializeScanner();
    loadStats();
    loadAllAttendees();
    
    // Set up auto-refresh stats every 30 seconds
    const intervalId = setInterval(loadStats, 30000);
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
      clearInterval(intervalId);
    };
  }, [initializeScanner]);

  // Debounce scan to prevent duplicates
  const scanDebounceRef = useRef({});
  const onScanSuccess = async (decodedText) => {
    if (!decodedText) return;
    
    // Debounce: prevent scanning same QR within 2 seconds
    const now = Date.now();
    if (scanDebounceRef.current[decodedText] && 
        now - scanDebounceRef.current[decodedText] < 2000) {
      console.log('Scan debounced (duplicate prevented)');
      return;
    }
    
    scanDebounceRef.current[decodedText] = now;
    
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
        // Play different sounds for check-in vs check-out
        playBeep(scanType === 'check_in' ? 'success' : 'info');
        
        // Add to recent scans
        const newScan = {
          ...data.attendee,
          scanType,
          timestamp: new Date().toISOString(),
          success: true
        };
        
        setRecentScans(prev => {
          const updated = [newScan, ...prev.slice(0, 9)];
          // Store in localStorage
          localStorage.setItem('event_recent_scans', JSON.stringify(updated));
          return updated;
        });
        
        // Show success message
        alert(`✅ ${data.attendee.name}\n${scanType === 'check_in' ? 'Checked IN successfully!' : 'Checked OUT successfully!'}\nSeat: ${data.attendee.seat_id}\nTime: ${new Date().toLocaleTimeString()}`);
        
        // Update stats and attendees list
        loadStats();
        loadAllAttendees();
        
      } else {
        // Play error sound
        playBeep('error');
        alert(`❌ ${data.error || 'Scan failed'}\n\nAttendee: ${data.attendee?.name || 'Unknown'}\nCurrent Status: ${data.attendee?.status || 'Unknown'}`);
      }
    } catch (error) {
      playBeep('error');
      alert('⚠️ Network error. Please try again.');
      console.error('Scan error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onScanError = (error) => {
    console.log('QR Scanner error:', error);
  };

  const playBeep = (type = 'success') => {
    if (typeof window === 'undefined') return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Different frequencies for different actions
      if (type === 'success') {
        oscillator.frequency.value = 800; // Check-in success
      } else if (type === 'info') {
        oscillator.frequency.value = 600; // Check-out success
      } else {
        oscillator.frequency.value = 300; // Error
      }
      
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
      // Fallback to simple beep
      console.log('Web Audio API not supported');
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

  const loadAllAttendees = async () => {
    try {
      const response = await fetch('/api/attendees');
      const data = await response.json();
      if (data.success) {
        setAllAttendees(data.data || []);
      }
    } catch (error) {
      console.log('Attendees error:', error);
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
        alert(`✅ Successfully imported ${data.imported} attendees!`);
        loadStats();
        loadAllAttendees();
      } else {
        alert(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      alert('⚠️ Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
      setIsScanning(false);
    }
  };

  const handleStartScanning = () => {
    initializeScanner();
  };

  const handleClearScans = () => {
    if (confirm('Clear recent scans history? This will not delete database records.')) {
      setRecentScans([]);
      localStorage.removeItem('event_recent_scans');
    }
  };

  const handleCheckOutAll = async () => {
    if (!confirm('Check out ALL currently checked-in attendees? This action cannot be undone.')) {
      return;
    }
    
    try {
      const checkedInAttendees = allAttendees.filter(a => a.status === 'checked_in');
      
      if (checkedInAttendees.length === 0) {
        alert('No attendees are currently checked in.');
        return;
      }
      
      // Show progress
      let successCount = 0;
      let errorCount = 0;
      
      for (const attendee of checkedInAttendees) {
        try {
          const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qrPayload: attendee.qr_payload,
              scanType: 'check_out',
              deviceId: deviceId.current,
              operator: 'Bulk Check-out'
            })
          });
          
          const data = await response.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }
      
      alert(`✅ Bulk check-out completed!\nSuccess: ${successCount}\nFailed: ${errorCount}`);
      loadStats();
      loadAllAttendees();
      
    } catch (error) {
      alert('❌ Bulk check-out failed');
      console.error('Bulk check-out error:', error);
    }
  };

  // Filter attendees based on status
  const checkedInAttendees = allAttendees.filter(a => a.status === 'checked_in');
  const pendingAttendees = allAttendees.filter(a => a.status === 'not_checked_in');
  const checkedOutAttendees = allAttendees.filter(a => a.status === 'checked_out');

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '1400px', 
      margin: '0 auto', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f7fa',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '30px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>🎫 Event Management System</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>
          Device: <strong>{deviceId.current.substring(0, 12)}...</strong> | 
          Last Update: {new Date(stats.lastUpdated).toLocaleTimeString()}
        </p>
      </header>

      {/* Stats Dashboard */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '30px'
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
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '10px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <button
            onClick={loadStats}
            style={{
              padding: '10px 20px',
              backgroundColor: '#9b59b6',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            🔄 Refresh Stats
          </button>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            Auto-refreshes every 30s
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Left Column - Scanner */}
        <div>
          {/* Upload Section */}
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h2 style={{ marginTop: 0, color: '#2c3e50' }}>
              📁 1. Import Excel Data
            </h2>
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
                borderRadius: '5px',
                fontSize: '14px'
              }}
            />
            {isUploading && (
              <p style={{ color: '#3498db', marginTop: '10px' }}>
                ⏳ Uploading and processing...
              </p>
            )}
            <div style={{ fontSize: '13px', color: '#7f8c8d', marginTop: '10px' }}>
              <strong>Required columns:</strong> Name, Phone, QR Payload, SeatID, Category
            </div>
          </div>

          {/* Scanner Section */}
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginTop: 0, color: '#2c3e50' }}>
              📱 2. Scanner Controls
            </h2>
            
            {/* Mode Selection */}
            <div style={{ 
              display: 'flex', 
              gap: '10px', 
              marginBottom: '20px',
              backgroundColor: '#ecf0f1',
              padding: '10px',
              borderRadius: '8px'
            }}>
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
                  cursor: 'pointer',
                  transition: 'all 0.3s'
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
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
              >
                ↩ CHECK OUT
              </button>
            </div>
            
            {/* Scanner Status */}
            <div style={{
              backgroundColor: scanType === 'check_in' ? '#d5f4e6' : '#fadbd8',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: `2px solid ${scanType === 'check_in' ? '#27ae60' : '#e74c3c'}`
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <strong style={{ color: '#2c3e50' }}>
                    {scanType === 'check_in' ? 'CHECK IN MODE' : 'CHECK OUT MODE'}
                  </strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#7f8c8d' }}>
                    {scanType === 'check_in' 
                      ? 'Scan tickets for entry' 
                      : 'Scan tickets for exit'}
                  </p>
                </div>
                <div style={{ 
                  padding: '8px 16px',
                  backgroundColor: scanType === 'check_in' ? '#27ae60' : '#e74c3c',
                  color: 'white',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  {isScanning ? 'ACTIVE' : 'PAUSED'}
                </div>
              </div>
            </div>
            
            {/* Scanner Container */}
            <div id="qr-reader" style={{ width: '100%' }}></div>
            
            {/* Scanner Controls */}
            <div style={{ 
              display: 'flex', 
              gap: '10px', 
              marginTop: '20px'
            }}>
              {isScanning ? (
                <button
                  id="custom-stop-button"
                  onClick={handleStopScanning}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  ⏸️ Stop Scanning
                </button>
              ) : (
                <button
                  onClick={handleStartScanning}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  ▶️ Start Scanning
                </button>
              )}
              
              <button
                onClick={handleClearScans}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🗑️ Clear History
              </button>
            </div>
            
            {isLoading && (
              <div style={{
                marginTop: '15px',
                padding: '10px',
                backgroundColor: '#fff3cd',
                borderRadius: '5px',
                textAlign: 'center'
              }}>
                ⏳ Processing scan...
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Recent Scans & Quick Actions */}
        <div>
          {/* Recent Scans */}
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            marginBottom: '20px',
            height: '500px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '15px'
            }}>
              <h2 style={{ margin: 0, color: '#2c3e50' }}>
                🕐 Recent Scans ({recentScans.length})
              </h2>
              <button
                onClick={handleClearScans}
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
            
            <div style={{ 
              flex: 1, 
              overflowY: 'auto',
              paddingRight: '10px'
            }}>
              {recentScans.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '50px 20px',
                  color: '#bdc3c7'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📷</div>
                  <p>No scans yet. Start scanning tickets!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentScans.map((scan, index) => (
                    <div 
                      key={index}
                      style={{
                        padding: '15px',
                        backgroundColor: scan.scanType === 'check_in' ? '#d5f4e6' : '#fadbd8',
                        borderRadius: '8px',
                        borderLeft: `5px solid ${scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}>
                        <div>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px',
                            marginBottom: '5px'
                          }}>
                            <strong style={{ fontSize: '16px', color: '#2c3e50' }}>
                              {scan.name}
                            </strong>
                            <span style={{
                              padding: '3px 8px',
                              backgroundColor: scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c',
                              color: 'white',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}>
                              {scan.scanType === 'check_in' ? 'IN' : 'OUT'}
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', color: '#7f8c8d' }}>
                            <div>📞 {scan.phone}</div>
                            <div>💺 Seat: {scan.seat_id} | Category: {scan.category}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', color: '#95a5a6' }}>
                            {new Date(scan.timestamp).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </div>
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#7f8c8d',
                            marginTop: '5px'
                          }}>
                            {scan.last_scanned_by || 'System'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginTop: 0, color: '#2c3e50' }}>⚡ Quick Actions</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => setShowAllAttendees(!showAllAttendees)}
                style={{
                  padding: '15px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'left'
                }}
              >
                👁️ {showAllAttendees ? 'Hide' : 'Show'} All Attendees
              </button>
              
              <button
                onClick={handleCheckOutAll}
                disabled={checkedInAttendees.length === 0}
                style={{
                  padding: '15px',
                  backgroundColor: checkedInAttendees.length > 0 ? '#e74c3c' : '#bdc3c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: checkedInAttendees.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'left'
                }}
              >
                🚪 Check Out All ({checkedInAttendees.length}) Currently Inside
              </button>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Event URL copied to clipboard!');
                }}
                style={{
                  padding: '15px',
                  backgroundColor: '#9b59b6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'left'
                }}
              >
                🔗 Copy Event URL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* All Attendees Section (Collapsible) */}
      {showAllAttendees && (
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '30px'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ margin: 0, color: '#2c3e50' }}>
              📋 All Attendees ({allAttendees.length})
            </h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowAllAttendees(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Hide
              </button>
              <button
                onClick={loadAllAttendees}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Refresh
              </button>
            </div>
          </div>
          
          {/* Status Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            marginBottom: '20px',
            overflowX: 'auto'
          }}>
            <div style={{
              padding: '10px 20px',
              backgroundColor: '#2ecc71',
              color: 'white',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              Checked In: {checkedInAttendees.length}
            </div>
            <div style={{
              padding: '10px 20px',
              backgroundColor: '#f39c12',
              color: 'white',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              Pending: {pendingAttendees.length}
            </div>
            <div style={{
              padding: '10px 20px',
              backgroundColor: '#e74c3c',
              color: 'white',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              Checked Out: {checkedOutAttendees.length}
            </div>
          </div>
          
          {/* Attendees Table */}
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            border: '1px solid #ecf0f1',
            borderRadius: '5px'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ 
                backgroundColor: '#2c3e50', 
                color: 'white',
                position: 'sticky',
                top: 0
              }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Phone</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Seat</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Check-in Time</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Check-out Time</th>
                </tr>
              </thead>
              <tbody>
                {allAttendees.map((attendee) => (
                  <tr 
                    key={attendee.id}
                    style={{ 
                      borderBottom: '1px solid #ecf0f1',
                      backgroundColor: attendee.status === 'checked_in' ? '#d5f4e6' : 
                                     attendee.status === 'checked_out' ? '#fadbd8' : 'white'
                    }}
                  >
                    <td style={{ padding: '12px' }}>{attendee.name}</td>
                    <td style={{ padding: '12px' }}>{attendee.phone}</td>
                    <td style={{ padding: '12px' }}>{attendee.seat_id}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '5px 10px',
                        backgroundColor: attendee.status === 'checked_in' ? '#27ae60' : 
                                       attendee.status === 'checked_out' ? '#e74c3c' : '#f39c12',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {attendee.status?.toUpperCase() || 'PENDING'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {attendee.check_in_time ? 
                        new Date(attendee.check_in_time).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : 
                        '--:--'
                      }
                    </td>
                    <td style={{ padding: '12px' }}>
                      {attendee.check_out_time ? 
                        new Date(attendee.check_out_time).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : 
                        '--:--'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{
        marginTop: '40px',
        padding: '20px',
        backgroundColor: '#34495e',
        color: 'white',
        borderRadius: '10px',
        textAlign: 'center',
        fontSize: '14px'
      }}>
        <p style={{ margin: 0 }}>
          Event Management System • All data persists in database • 
          Real-time sync across devices • 
          QR Scanner v1.0
        </p>
        <p style={{ margin: '10px 0 0 0', opacity: 0.8 }}>
          {deviceId.current} • {new Date().toLocaleDateString()}
        </p>
      </footer>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, color, icon, subtitle }) {
  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '10px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      borderTop: `5px solid ${color}`,
      transition: 'transform 0.2s'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '15px',
        marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '32px',
          backgroundColor: `${color}20`,
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold' }}>
            {title}
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: color }}>
            {value}
          </div>
        </div>
      </div>
      {subtitle && (
        <div style={{ 
          fontSize: '12px', 
          color: '#95a5a6',
          marginTop: '5px'
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}