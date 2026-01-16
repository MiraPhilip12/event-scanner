'use client';

import { useEffect, useState, useRef } from 'react';

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
  
  const deviceId = useRef(`device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    loadStats();
    
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
        alert(`✅ Successfully imported ${data.imported} attendees!`);
        loadStats();
      } else {
        alert(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      alert('⚠️ Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '1200px', 
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: '#f5f7fa'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '30px',
        textAlign: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '28px' }}>🎫 Event QR Scanner System</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>
          Device ID: <strong>{deviceId.current.substring(0, 12)}...</strong>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Left Column */}
        <div>
          {/* Upload Section */}
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
            {isUploading && <p>Uploading...</p>}
            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              Columns: <strong>Name, Phone, QR Payload, SeatID, Category</strong>
            </p>
          </div>

          {/* QR Scanner Placeholder */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <h2>📱 QR Scanner</h2>
            <div style={{ 
              backgroundColor: '#ecf0f1', 
              padding: '40px',
              borderRadius: '10px',
              margin: '20px 0'
            }}>
              <p>Camera-based QR scanner will appear here</p>
              <p style={{ fontSize: '14px', color: '#7f8c8d' }}>
                Requires camera permission
              </p>
            </div>
            
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
                  fontWeight: 'bold'
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
                  fontWeight: 'bold'
                }}
              >
                ↩ CHECK OUT
              </button>
            </div>
            
            <button
              onClick={loadStats}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Refresh Stats
            </button>
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
            <h2>🕐 Recent Scans</h2>
            {recentScans.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#95a5a6', padding: '40px 0' }}>
                No scans yet
              </p>
            ) : (
              <div style={{ marginTop: '20px' }}>
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
                    <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                      {scan.name}
                    </div>
                    <div style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '5px' }}>
                      Seat: {scan.seat_id} • {scan.phone}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: scan.scanType === 'check_in' ? '#27ae60' : '#e74c3c',
                      marginTop: '5px',
                      fontWeight: 'bold'
                    }}>
                      {scan.scanType === 'check_in' ? 'CHECKED IN' : 'CHECKED OUT'} • 
                      {' '}{new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
        marginTop: '40px',
        padding: '20px',
        backgroundColor: '#34495e',
        color: 'white',
        borderRadius: '10px',
        textAlign: 'center',
        fontSize: '14px'
      }}>
        <p style={{ margin: 0 }}>
          Event Management System • Data persists in database • 
          Share URL with other operators
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
      textAlign: 'center'
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