import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Login from "./pages/Login/Login";
import DashboardAlumno from "./pages/Alumno/Dashboard";
import ProtectedAlumno from "./components/routes/ProtectedAlumno";
import ProtectedAdmin from "./components/routes/ProtectedAdmin";
import ProtectedProgramacion from "./components/routes/ProtectedProgramacion";
import ProtectedProgramacionPage from "./components/routes/ProtectedProgramacionPage";
import AgendarVuelo from "./pages/Alumno/AgendarVuelo";
import AulaVirtual from "./pages/Alumno/AulaVirtual";
import LoadsheetPage from "./loadsheet/LoadsheetPage";
import DashboardProgramacion from "./pages/Programacion/Dashboard";
import AgendarVueloProgramacion from "./pages/Programacion/AgendarVuelo";
import PaginaProgramacion from "./pages/Proyeccion/PaginaProgramacion";
import DashboardAdmin from "./pages/Admin/Dashboard";
import AuditoriaAdmin from "./pages/Admin/Auditoria";
import MantenimientoAdmin from "./pages/Admin/Mantenimiento";
import TurnoDashboard from "./pages/Turno/Dashboard";
import ProtectedTurno from "./components/routes/ProtectedTurno";
import InstructorDashboard from "./pages/Instructor/Dashboard";
import ProtectedInstructor from "./components/routes/ProtectedInstructor";
import ForcePasswordChange from "./components/routes/ForcePasswordChange";
import Perfil from "./pages/Perfil/Perfil";
import AdminLayout from "./components/AdminLayout/AdminLayout";
import PerfilesAdmin from "./pages/Admin/Perfiles";
import AlumnosAdmin from "./pages/Admin/Alumnos";
import CancelacionesAdmin from "./pages/Admin/Cancelaciones";

// ── Módulo Administración / Contabilidad ──────────────────────────
import AdministracionLayout from "./components/AdministracionLayout/AdministracionLayout";
import ProtectedAdministracion from "./components/routes/ProtectedAdministracion";
import AdmDashboard from "./pages/Administracion/Dashboard";
import AdmCuentas from "./pages/Administracion/Cuentas";
import AdmCuentaDetalle from "./pages/Administracion/CuentaDetalle";
import AdmRecibos from "./pages/Administracion/Recibos";
import AdmFacturas from "./pages/Administracion/Facturas";
import AdmTarifas from "./pages/Administracion/Tarifas";
import AdmCursos from "./pages/Administracion/Cursos";
import AdmEgresos from "./pages/Administracion/Egresos";
import AdmNomina from "./pages/Administracion/Nomina";
import AdmDocumentacion from "./pages/Administracion/Documentacion";
import AdmMedicos from "./pages/Administracion/Medicos";
import AdmReportes from "./pages/Administracion/Reportes";
import AdmAulaVirtual from "./pages/Administracion/AulaVirtual";

const IDLE_MS = 30 * 60 * 1000;

function App() {
  useEffect(() => {
    let t;

    const readUser = () => {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        localStorage.removeItem("user");
        return null;
      }
    };

    const logout = (reason = "") => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = reason ? `/login?reason=${reason}` : "/login";
    };

    const isProyeccion = () =>
      new URLSearchParams(window.location.search).get("modo") === "proyeccion";

    const reset = () => {
      return; // Timeout desactivado temporalmente por solicitud
      if (isProyeccion()) return;

      const user = readUser();
      if (!user) return;

      if (!localStorage.getItem("token")) {
        logout();
        return;
      }

      clearTimeout(t);
      t = setTimeout(() => logout("timeout"), IDLE_MS);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, reset));

    reset();

    return () => {
      clearTimeout(t);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, []);

  return (
    <Router>
      <Toaster position="top-right" richColors duration={4000} />
      <ForcePasswordChange>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route
            path="/proyeccion"
            element={
              <ProtectedProgramacionPage>
                <PaginaProgramacion />
              </ProtectedProgramacionPage>
            }
          />

          <Route
            path="/alumno/dashboard"
            element={
              <ProtectedAlumno>
                <DashboardAlumno />
              </ProtectedAlumno>
            }
          />
          <Route
            path="/alumno/agendar"
            element={
              <ProtectedAlumno>
                <AgendarVuelo />
              </ProtectedAlumno>
            }
          />
          <Route
            path="/alumno/aula-virtual"
            element={
              <ProtectedAlumno>
                <AulaVirtual />
              </ProtectedAlumno>
            }
          />
          <Route
            path="/alumno/loadsheet/:id_vuelo"
            element={
              <ProtectedAlumno>
                <LoadsheetPage />
              </ProtectedAlumno>
            }
          />

          <Route
            path="/programacion/dashboard"
            element={
              <ProtectedProgramacion>
                <DashboardProgramacion />
              </ProtectedProgramacion>
            }
          />
          <Route
            path="/programacion/agendar"
            element={
              <ProtectedProgramacion>
                <AgendarVueloProgramacion />
              </ProtectedProgramacion>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <DashboardAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          <Route
            path="/admin/auditoria"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <AuditoriaAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          <Route
            path="/admin/mantenimiento"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <MantenimientoAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          <Route
            path="/admin/perfiles"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <PerfilesAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          <Route
            path="/admin/alumnos"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <AlumnosAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          <Route
            path="/admin/cancelaciones"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <CancelacionesAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />

          <Route
            path="/turno"
            element={
              <ProtectedTurno>
                <TurnoDashboard />
              </ProtectedTurno>
            }
          />

          <Route
            path="/instructor"
            element={
              <ProtectedInstructor>
                <InstructorDashboard />
              </ProtectedInstructor>
            }
          />
          <Route
            path="/instructor/loadsheet/:id_vuelo"
            element={
              <ProtectedInstructor>
                <LoadsheetPage readOnly apiBase="instructor" />
              </ProtectedInstructor>
            }
          />

          {/* ── Módulo Administración / Contabilidad ── */}
          <Route path="/administracion" element={<Navigate to="/administracion/dashboard" replace />} />
          <Route path="/administracion/dashboard"     element={<ProtectedAdministracion><AdministracionLayout><AdmDashboard /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/cuentas"       element={<ProtectedAdministracion><AdministracionLayout><AdmCuentas /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/cuentas/:id"   element={<ProtectedAdministracion><AdministracionLayout><AdmCuentaDetalle /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/recibos"       element={<ProtectedAdministracion><AdministracionLayout><AdmRecibos /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/facturas"      element={<ProtectedAdministracion><AdministracionLayout><AdmFacturas /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/tarifas"       element={<ProtectedAdministracion><AdministracionLayout><AdmTarifas /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/cursos"        element={<ProtectedAdministracion><AdministracionLayout><AdmCursos /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/egresos"       element={<ProtectedAdministracion><AdministracionLayout><AdmEgresos /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/nomina"        element={<ProtectedAdministracion><AdministracionLayout><AdmNomina /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/documentacion" element={<ProtectedAdministracion><AdministracionLayout><AdmDocumentacion /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/medicos"       element={<ProtectedAdministracion><AdministracionLayout><AdmMedicos /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/reportes"      element={<ProtectedAdministracion><AdministracionLayout><AdmReportes /></AdministracionLayout></ProtectedAdministracion>} />
          <Route path="/administracion/aula-virtual"  element={<ProtectedAdministracion><AdministracionLayout><AdmAulaVirtual /></AdministracionLayout></ProtectedAdministracion>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ForcePasswordChange>
    </Router>
  );
}

export default App;