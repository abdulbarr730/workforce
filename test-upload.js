async function testUpload() {
  try {
    const payload = {
      events: [
        {
          eventId: "test-event-1234",
          employeeId: "EMP-123",
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

    // Use the actual token from the desktop agent or backend
    // Wait, let's login first to get a token!
    const loginRes = await fetch('https://workforce-system-backend.vercel.app/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'abdul@prosync.com', password: 'password123' }) // Let's guess or check the db for user
    });
    const loginData = await loginRes.json();
    console.log("Login:", loginData);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testUpload();
