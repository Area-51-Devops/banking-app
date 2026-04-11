import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider }     from "./contexts/ToastContext";
import Navbar        from "./components/Navbar";
import Login         from "./pages/Login";
import Register      from "./pages/Register";
import Dashboard     from "./pages/Dashboard";
import Transfer      from "./pages/Transfer";
import Loans         from "./pages/Loans";
import BillPay       from "./pages/BillPay";
import Notifications from "./pages/Notifications";
import AdminDashboard from "./pages/AdminDashboard";

function PrivateRoute({ children }) {
  const { user, isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  // Admins should not access customer banking pages
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, isLoggedIn } = useAuth();
  if (!isLoggedIn) return children;
  // Send admins to admin portal, users to their dashboard
  return <Navigate to={user?.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />;
}

function RoleHome() {
  const { user, isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<RoleHome />} />
          <Route path="/login"   element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/dashboard"     element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/transfer"      element={<PrivateRoute><Transfer /></PrivateRoute>} />
          <Route path="/loans"         element={<PrivateRoute><Loans /></PrivateRoute>} />
          <Route path="/bill-pay"      element={<PrivateRoute><BillPay /></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
          <Route path="/admin"         element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="*"        element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
