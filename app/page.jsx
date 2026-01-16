'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { toast, Toaster } from 'react-hot-toast';

// Simple supabase client
const createSupabaseClient = () => {
  if (typeof window === 'undefined') return null;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    return null;
  }
  
  // Dynamic import to avoid SSR issues
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseKey);
};

export default function Home() {
  const [scanType, setScanType] = useState('check_in');
  const [recentScans, setRecentScans] = useState([]);
  const [stats, setStats] = useState({ total: 0, checked_in: 0, pending: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const scannerRef = useRef(null);
  const deviceId = useRef(`device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Initialize scanner
  useEffect(() => {
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    }, false);
    
    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;
    
    // Load initial stats
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
        // Play beep sound
        playBeep();
        
        // Add to recent scans
        setRecentScans(prev => [{
          ...data.attendee,
          scanType,
          timestamp: new Date().toISOString()
        }, ...prev.slice(0, 9)]);
        
        // Update stats
        loadStats();
        
        // Show success
        toast.success(`${data.attendee.name} ${scanType === 'check_in' ? 'checked in' : 'checked out'}!`);
      } else {
        toast.error(data.error || 'Not found');
      }
    } catch (error) {
      toast.error('Network error');
    }
  };

  const onScanError = (error) => {
    console.log('QR error:', error);
  };

  const playBeep = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YU4GAACLg4KDfX+AfX6BfX6DfX6FfX6HfX6IfX6KfX6MfX6NfX6OfX6PfX6QfX6RfX6SfX6TfX6UfX6VfX6WfX6XfX6YfX6ZfX6afX6bfX6cfX6dfX6efX6ffX6gfX6hfX6ifX6jfX6kfX6lfX6mfX6nfX6ofX6pfX6qfX6rfX6sfX6tfX6ufX6vfX6wfX6xfX6yfX6zfX60fX61fX62fX63fX64fX65fX66fX67fX68fX69fX6+fX6/fX7AfX7BfX7CfX7DfX7EfX7FfX7GfX7HfX7IfX7JfX7KfX7LfX7MfX7NfX7OfX7PfX7QfX7RfX7SfX7TfX7UfX7VfX7WfX7XfX7YfX7ZfX7afX7bfX7cfX7dfX7efX7ffX7gfX7hfX7ifX7jfX7kfX7lfX7mfX7nfX7ofX7pfX7qfX7rfX7sfX7tfX7ufX7vfX7wfX7xfX7yfX7zfX70fX71fX72fX73fX74fX75fX76fX77fX78fX79fX7+fX7/fX8AfX8BfX8CfX8DfX8EfX8FfX8GfX8HfX8IfX8JfX8KfX8LfX8MfX8NfX8OfX8PfX8QfX8RfX8SfX8TfX8UfX8VfX8WfX8XfX8YfX8ZfX8afX8bfX8cfX8dfX8efX8ffX8gfX8hfX8ifX8jfX8kfX8lfX8mfX8nfX8ofX8pfX8qfX8rfX8sfX8tfX8ufX8vfX8wfX8xfX8yfX8zfX80fX81fX82fX83fX84fX85fX86fX87fX88fX89fX8+fX8/fX9AfX9BfX9CfX9DfX9EfX9FfX9GfX9HfX9IfX9JfX9KfX9LfX9MfX9NfX9OfX9PfX9QfX9RfX9SfX9TfX9UfX9VfX9WfX9XfX9YfX9ZfX9afX9bfX9cfX9dfX9efX9ffX9gfX9hfX9ifX9jfX9kfX9lfX9mfX9nfX9ofX9pfX9qfX9rfX9sfX9tfX9ufX9vfX9wfX9xfX9yfX9zfX90fX91fX92fX93fX94fX95fX96fX97fX98fX99fX9+fX9/fg==');
      audio.play();
    } catch (e) {
      // Silent fail if audio doesn't work
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

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <Toaster />
      
      <h1 style={{ textAlign: 'center', color: '#2d3748', marginBottom: '30px' }}>
        🎫 Event QR Scanner System
      </h1>
      
      {/* Upload Section */}
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
        borderRadius: '12px',
        color: 'white',
        marginBottom: '30px'
      }}>
        <h2 style={{ marginTop: 0 }}>📁 1. Upload Excel File</h2>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={isUploading}
          style={{ 
            width: '100%',
            padding: '12px',
            marginTop: '10px',
            borderRadius: '8px',
            border: '2px dashed rgba(255,255,255,0.5)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white'
          }}
        />
        {isUploading && <p style={{ marginTop: '10px' }}>Uploading...</p>}
        <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '10px' }}>
          File must have columns: <strong>Name, Phone, QR Payload, SeatID, Category</strong>
        </p>
      </div>
      
      {/* Scanner Section */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '25px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        marginBottom: '30px'
      }}>
        <h2 style={{ color: '#2d3748', marginTop: 0 }}>📱 2. Scanner</h2>
        
        {/* Mode Selector */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {['check_in', 'check_out'].map((type) => (
            <button
              key={type}
              onClick={() => setScanType(type)}
              style={{
                flex: 1,
                padding: '15px',
                backgroundColor: scanType === type ? 
                  (type === 'check_in' ? '#10b981' : '#3b82f6') : '#e5e7eb',
                color: scanType === type ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {type === 'check_in' ? '✓ Check In' : '↩ Check Out'}
            </button>
          ))}
        </div>
        
        {/* QR Scanner */}
        <div id="qr-reader" style={{ width: '100%' }}></div>
        
        {/* Device Info */}
        <div style={{ 
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          <strong>Device ID:</strong> {deviceId.current.substring(0, 20)}...
          <br />
          <strong>Mode:</strong> {scanType === 'check_in' ? 'Check In' : 'Check Out'}
        </div>
      </div>
      
      {/* Stats & Recent Scans */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
        {/* Stats */}
        <div style={{ 
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, color: '#2d3748' }}>📊 Stats</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <StatItem label="Total" value={stats.total} color="#6b7280" />
            <StatItem label="Checked In" value={stats.checked_in} color="#10b981" />
            <StatItem label="Pending" value={stats.pending} color="#f59e0b" />
            <StatItem label="Checked Out" value={stats.checked_out} color="#3b82f6" />
          </div>
          <button
            onClick={loadStats}
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '20px',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Refresh Stats
          </button>
        </div>
        
        {/* Recent Scans */}
        <div style={{ 
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <h3 style={{ marginTop: 0, color: '#2d3748' }}>🕐 Recent Scans</h3>
          {recentScans.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>
              No scans yet. Start scanning!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentScans.map((scan, index) => (
                <div 
                  key={index}
                  style={{
                    padding: '15px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${scan.scanType === 'check_in' ? '#10b981' : '#3b82f6'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                      {scan.name}
                      {scan.seat_id && (
                        <span style={{ color: '#6b7280', marginLeft: '10px' }}>
                          ({scan.seat_id})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '5px' }}>
                      {scan.phone} • {scan.category}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      padding: '5px 10px',
                      backgroundColor: scan.scanType === 'check_in' ? '#d1fae5' : '#dbeafe',
                      color: scan.scanType === 'check_in' ? '#065f46' : '#1e40af',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {scan.scanType === 'check_in' ? 'IN' : 'OUT'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '5px' }}>
                      {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Instructions */}
      <div style={{ 
        marginTop: '30px',
        padding: '20px',
        backgroundColor: '#fef3c7',
        borderRadius: '12px',
        border: '1px solid #fbbf24'
      }}>
        <h3 style={{ marginTop: 0, color: '#92400e' }}>ℹ️ How to Use</h3>
        <ol style={{ color: '#92400e', lineHeight: '1.6' }}>
          <li>Upload your Excel file with attendee data</li>
          <li>Allow camera access when browser asks</li>
          <li>Select "Check In" or "Check Out" mode</li>
          <li>Scan QR codes from tickets</li>
          <li>Share this URL with other operators: <strong>https://event-scanner.vercel.app</strong></li>
        </ol>
      </div>
    </div>
  );
}

function StatItem({ label, value, color }) {
  return (
    <div style={{ 
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px',
      backgroundColor: `${color}10`,
      borderRadius: '8px',
      border: `1px solid ${color}30`
    }}>
      <span style={{ color: '#4b5563' }}>{label}</span>
      <span style={{ 
        fontSize: '24px',
        fontWeight: 'bold',
        color: color 
      }}>
        {value}
      </span>
    </div>
  );
}