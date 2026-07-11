import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import { LoginPage } from "../pages/LoginPage";

import { DashboardPage } from "../pages/DashboardPage";
import { IdleOverlayPage } from "../pages/IdleOverlayPage";

import { useAuth } from "../auth/AuthContext";

export const AppRoutes = () => {
  const { token } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={token ? <DashboardPage /> : <Navigate to="/login" />}
        />

        <Route
          path="/login"
          element={token ? <Navigate to="/" /> : <LoginPage />}
        />

        <Route path="/idle" element={<IdleOverlayPage />} />
      </Routes>
    </HashRouter>
  );
};
