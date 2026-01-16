export default function Home() {
  return (
    <div style={{ 
      padding: '50px', 
      textAlign: 'center',
      backgroundColor: '#f0f8ff',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#2c3e50' }}>🎫 Event QR Scanner System</h1>
      <p style={{ color: '#7f8c8d', fontSize: '18px' }}>
        System is ready for setup!
      </p>
      <div style={{ 
        marginTop: '40px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '10px',
        maxWidth: '600px',
        margin: '40px auto',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h3>Next Steps:</h3>
        <ol style={{ textAlign: 'left', lineHeight: '1.8' }}>
          <li>Upload your Excel file</li>
          <li>Configure Supabase database</li>
          <li>Start scanning QR codes</li>
        </ol>
      </div>
    </div>
  );
}