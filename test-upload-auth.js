async function testUploadWithAuth() {
  try {
    console.log("Logging in...");
    const loginRes = await fetch('https://workforce-system-backend.vercel.app/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'abdul@prosync.com', password: 'password123' })
    });
    
    if (!loginRes.ok) {
       console.error("Login failed:", loginRes.status, await loginRes.text());
       return;
    }

    const loginData = await loginRes.json();
    console.log("Login successful!");
    const token = loginData.data.token;
    const user = loginData.data.user;

    const payload = {
      events: [
        {
          eventId: "test-event-1234",
          employeeId: user.employeeId || "EMP-123",
          companyId: "PROSYNC_INFOTECH_PVT_LTD",
          deviceId: "test-device",
          sessionId: "test-session",
          type: "ACTIVE_WINDOW",
          source: "DESKTOP_AGENT",
          timestamp: new Date().toISOString(),
          metadata: { app: "VS Code", title: "Testing" }
        }
      ]
    };

    console.log("Sending payload:", JSON.stringify(payload, null, 2));

    const res = await fetch('https://workforce-system-backend.vercel.app/api/tracking/ingest', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      console.log("Ingest Success:", await res.json());
    } else {
      console.error("Ingest Error Status:", res.status);
      console.error("Ingest Error Body:", await res.text());
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testUploadWithAuth();
