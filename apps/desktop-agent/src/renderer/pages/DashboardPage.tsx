import { useAuth } from "../auth/AuthContext";

export const DashboardPage =
  () => {
    const {
      user,
      logout
    } = useAuth();

    return (
      <div className="app-shell">
        <aside className="app-sidebar">
          <div>
            <h2 className="text-xl font-semibold">
              Workforce
            </h2>

            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Desktop Agent
            </p>
          </div>

          <div className="mt-10 space-y-2">
            <div className="sidebar-link active">
              Dashboard
            </div>

            <div className="sidebar-link">
              Activity
            </div>

            <div className="sidebar-link">
              Attendance
            </div>

            <div className="sidebar-link">
              Timeline
            </div>
          </div>
        </aside>

        <main className="app-content">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                Dashboard
              </h1>

              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Logged in as{" "}
                {user?.role}
              </p>
            </div>

            <button
              onClick={logout}
              className="btn-secondary"
            >
              Logout
            </button>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-6">
            <div className="card p-5">
              <p className="text-sm text-[var(--text-secondary)]">
                Today's Activity
              </p>

              <h2 className="mt-3 text-3xl font-semibold">
                6h 24m
              </h2>
            </div>

            <div className="card p-5">
              <p className="text-sm text-[var(--text-secondary)]">
                Idle Time
              </p>

              <h2 className="mt-3 text-3xl font-semibold">
                18m
              </h2>
            </div>

            <div className="card p-5">
              <p className="text-sm text-[var(--text-secondary)]">
                Productivity
              </p>

              <h2 className="mt-3 text-3xl font-semibold">
                91%
              </h2>
            </div>
          </div>
        </main>
      </div>
    );
  };