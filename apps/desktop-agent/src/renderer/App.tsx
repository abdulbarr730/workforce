import { AuthProvider } from "./auth/AuthContext";
import { AppRoutes } from "./routes/AppRoutes";
import { PersistentNotificationOverlay } from "./components/PersistentNotificationOverlay";

function App() {
  return (
    <AuthProvider>
      <PersistentNotificationOverlay />
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
