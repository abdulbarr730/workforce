import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import { LoginPage } from "../pages/LoginPage";

import { DashboardPage } from "../pages/DashboardPage";
import { IdleOverlayPage } from "../pages/IdleOverlayPage";
import { TodoWidgetPage } from "../pages/TodoWidgetPage";
import { ScheduledTasksPage } from "../pages/ScheduledTasksPage";
import { BreakOverlayPage } from "../pages/BreakOverlayPage";
import { AssignedTasksPage } from "../pages/AssignedTasksPage";

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
        <Route path="/break" element={<BreakOverlayPage />} />
        <Route
          path="/todo-widget"
          element={token ? <TodoWidgetPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/schedule"
          element={token ? <ScheduledTasksPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/assigned-tasks"
          element={token ? <AssignedTasksPage /> : <Navigate to="/login" />}
        />
      </Routes>
    </HashRouter>
  );
};
