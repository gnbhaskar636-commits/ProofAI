import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import CreateChange from "./pages/CreateChange.jsx";
import Evidence from "./pages/Evidence.jsx";
import History from "./pages/History.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <div className="mark">P</div>
          <div>
            <h1>ProofAI</h1>
            <p>Don’t just log your AI changes. Prove them.</p>
          </div>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/change" className={({ isActive }) => (isActive ? "active" : "")}>
            Create change
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
            Audit history
          </NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/change" element={<CreateChange />} />
        <Route path="/evidence/:displayId" element={<Evidence />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
