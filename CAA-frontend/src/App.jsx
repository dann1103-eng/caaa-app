import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Login from "./pages/Login/Login";
import Manual from "./pages/Manual/Manual";
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
import AeronavesAdmin from "./pages/Admin/Aeronaves";
import AeronaveFicha from "./pages/Admin/AeronaveFicha";
import TurnoDashboard from "./pages/Turno/Dashboard";
import ProtectedTurno from "./components/routes/ProtectedTurno";
import InstructorDashboard from "./pages/Instructor/Dashboard";
import InstructorAulaVirtual from "./pages/Instructor/AulaVirtual";
import InstructorSolicitudes from "./pages/Instructor/Solicitudes";
import ProtectedInstructor from "./components/routes/ProtectedInstructor";
import ForcePasswordChange from "./components/routes/ForcePasswordChange";
import Perfil from "./pages/Perfil/Perfil";
import AdminLayout from "./components/AdminLayout/AdminLayout";
import CancelacionesAdmin from "./pages/Admin/Cancelaciones";

// ── Módulo Administración / Contabilidad ──────────────────────────
import AdministracionLayoutAuto from "./components/AdministracionLayout/AdministracionLayoutAuto";
import ProtectedAdministracion from "./components/routes/ProtectedAdministracion";
import AdmDashboard from "./pages/Administracion/Dashboard";
import AdmCuentas from "./pages/Administracion/Cuentas";
import AdmCuentaDetalle from "./pages/Administracion/CuentaDetalle";
import AdmAlumnoFicha from "./pages/Administracion/AlumnoFicha";
import AdmContabilidad from "./pages/Administracion/Contabilidad";
import AdmUsuarios from "./pages/Administracion/Usuarios";
import AdmCursos from "./pages/Administracion/Cursos";
import AdmDocumentacion from "./pages/Administracion/Documentacion";
import AdmMedicos from "./pages/Administracion/Medicos";
import AdmReportes from "./pages/Administracion/Reportes";
import AdmAulaVirtual from "./pages/Administracion/AulaVirtual";

// ── Módulo Taller (mantenimiento / aeronavegabilidad) ─────────────
import ProtectedTaller from "./components/routes/ProtectedTaller";
import TallerLayoutAuto from "./components/TallerLayout/TallerLayoutAuto";
import TallerDashboard from "./pages/Taller/TallerDashboard";
import TallerAeronavegabilidad from "./pages/Taller/Aeronavegabilidad";
import TallerInventario from "./pages/Taller/Inventario";

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
          <Route path="/manual" element={<Manual />} />
          {/* Enlace para alumnos: solo su manual, sin ver el resto de roles */}
          <Route path="/manual/alumno" element={<Manual solo="alumno" />} />
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
          {/* Agendar vuelos para ADMIN: el calendario de programación dentro del
              shell unificado (sin su Header propio → conserva el sidebar). */}
          <Route
            path="/admin/agendar"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <DashboardProgramacion embedded />
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
          {/* Registro de la flota: datos, P&B, documentos y vuelos por aeronave.
              Complementa a /admin/mantenimiento (estado y horas) y a
              /taller/aeronavegabilidad (componentes e inspecciones). */}
          <Route
            path="/admin/aeronaves"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <AeronavesAdmin />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          <Route
            path="/admin/aeronaves/:id_aeronave"
            element={
              <ProtectedAdmin>
                <AdminLayout>
                  <AeronaveFicha />
                </AdminLayout>
              </ProtectedAdmin>
            }
          />
          {/* /admin/perfiles y /admin/alumnos eran stubs (soleado / límites).
              Esas funciones ya están completas en la ficha de Administración. */}
          <Route path="/admin/perfiles" element={<Navigate to="/administracion/usuarios" replace />} />
          <Route path="/admin/alumnos"  element={<Navigate to="/administracion/alumnos" replace />} />
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
            path="/instructor/solicitudes"
            element={
              <ProtectedInstructor>
                <InstructorSolicitudes />
              </ProtectedInstructor>
            }
          />
          <Route
            path="/instructor/aula-virtual"
            element={
              <ProtectedInstructor>
                <InstructorAulaVirtual />
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
          {/* Vuelo de práctica (chequeo/refresh): el instructor practicante edita
              su loadsheet como estudiante (mismos endpoints /alumno, admitidos por
              pertenencia). */}
          <Route
            path="/instructor/practica/loadsheet/:id_vuelo"
            element={
              <ProtectedInstructor>
                <LoadsheetPage apiBase="alumno" />
              </ProtectedInstructor>
            }
          />

          {/* ── Módulo Administración / Contabilidad ── */}
          <Route path="/administracion" element={<Navigate to="/administracion/dashboard" replace />} />
          <Route path="/administracion/dashboard"     element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmDashboard /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/alumnos"       element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmCuentas /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/cuentas"       element={<Navigate to="/administracion/alumnos" replace />} />
          <Route path="/administracion/cuentas/:id"   element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmCuentaDetalle /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/alumnos/:id_alumno" element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmAlumnoFicha /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          {/* Usuarios (alumnos + personal con login) */}
          <Route path="/administracion/usuarios"      element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmUsuarios /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          {/* Contabilidad consolidada (Ingresos / Egresos / Nómina / Tarifas) */}
          <Route path="/administracion/contabilidad"  element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmContabilidad /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          {/* Rutas antiguas → redirigen a la sub-pestaña correspondiente */}
          <Route path="/administracion/recibos"       element={<Navigate to="/administracion/contabilidad?tab=ingresos&sub=recibos" replace />} />
          <Route path="/administracion/facturas"      element={<Navigate to="/administracion/contabilidad?tab=ingresos&sub=facturas" replace />} />
          <Route path="/administracion/tarifas"       element={<Navigate to="/administracion/contabilidad?tab=tarifas" replace />} />
          <Route path="/administracion/egresos"       element={<Navigate to="/administracion/contabilidad?tab=egresos" replace />} />
          <Route path="/administracion/nomina"        element={<Navigate to="/administracion/contabilidad?tab=nomina" replace />} />
          <Route path="/administracion/cursos"        element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmCursos /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/documentacion" element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmDocumentacion /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/medicos"       element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmMedicos /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/reportes"      element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmReportes /></AdministracionLayoutAuto></ProtectedAdministracion>} />
          <Route path="/administracion/aula-virtual"  element={<ProtectedAdministracion><AdministracionLayoutAuto><AdmAulaVirtual /></AdministracionLayoutAuto></ProtectedAdministracion>} />

          {/* ── Módulo Taller (mantenimiento / aeronavegabilidad) ── */}
          <Route path="/taller" element={<Navigate to="/taller/dashboard" replace />} />
          <Route path="/taller/dashboard"         element={<ProtectedTaller><TallerLayoutAuto><TallerDashboard /></TallerLayoutAuto></ProtectedTaller>} />
          <Route path="/taller/aeronavegabilidad" element={<ProtectedTaller><TallerLayoutAuto><TallerAeronavegabilidad /></TallerLayoutAuto></ProtectedTaller>} />
          <Route path="/taller/inventario"        element={<ProtectedTaller><TallerLayoutAuto><TallerInventario /></TallerLayoutAuto></ProtectedTaller>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ForcePasswordChange>
    </Router>
  );
}

export default App;