import React, { Suspense, lazy } from 'react';
import { Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import PortalLayout from '../portal/PortalLayout';
import ClientLogin from '../portal/ClientLogin';
import OrderTracking from '../portal/OrderTracking';
import AutoUpdate from '../shared/AutoUpdate';
import PWABanner from '../PWABanner';
import { Toaster } from 'sonner';

// Lazy loading con fallback
const PublicSurvey = lazy(() => import('../GestionHumana/PublicSurvey'));
const PublicEncuestaViewer = lazy(() => import('../CentroFormacion/PublicEncuestaViewer'));
const PublicNoticiaPage = lazy(() => import('../Noticias/PublicNoticiaPage'));
const ReturnApprovalPage = lazy(() => import('../ReturnApprovalPage'));
const PerfilCargoPublicSign = lazy(() => import('../PerfilCargoPublicSign'));
const GrupoInterCumplidoPage = lazy(() => import('../GrupoInterCumplidoPage'));
const GrupoInterSeguimientoPage = lazy(() => import('../GrupoInterSeguimientoPage'));
const PublicAttendanceForm = lazy(() => import('../PublicAttendanceForm'));
const PublicTraining = lazy(() => import('../GestionHumana/PublicTraining'));
const PublicCapacitacion = lazy(() => import('../Capacitaciones/PublicCapacitacion'));
const PublicVisitForm = lazy(() => import('../GestionHumana/PublicVisitForm'));
const PublicDocForm = lazy(() => import('../HojasDeVida/PublicDocForm'));

const LoadingFallback: React.FC<{ color?: string }> = ({ color = '#10b981' }) => (
  <div className="h-screen w-full flex items-center justify-center bg-slate-950">
    <div
      className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
      style={{ borderColor: color, borderTopColor: 'transparent' }}
    />
  </div>
);

// Wrappers con extracción de parámetros
const ReturnApprovalWrapper: React.FC = () => {
  const { batchCode, token } = useParams<{ batchCode: string; token: string }>();
  return <ReturnApprovalPage batchCode={batchCode || ''} token={token || ''} />;
};

const PerfilCargoWrapper: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  return <PerfilCargoPublicSign token={token || ''} />;
};

const GiCumplidoWrapper: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  return <GrupoInterCumplidoPage token={token || ''} />;
};

const GiSeguimientoWrapper: React.FC = () => {
  const { doc } = useParams<{ doc: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  return <GrupoInterSeguimientoPage numeroDocumento={decodeURIComponent(doc || '')} token={token} />;
};

/**
 * Enrutador declarativo para vistas públicas (FE-02)
 */
export const PublicRoutes: React.FC = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/publico/encuesta-sociodemografica" element={<PublicSurvey />} />
        <Route path="/publico/encuesta/*" element={<PublicEncuestaViewer />} />
        <Route path="/publico/noticia" element={<PublicNoticiaPage />} />
        <Route path="/publico/noticia/:id" element={<PublicNoticiaPage />} />
        <Route path="/public/return-approval/:batchCode/:token" element={<ReturnApprovalWrapper />} />
        <Route path="/public/perfil-cargo/:token" element={<PerfilCargoWrapper />} />
        <Route path="/public/gi-cumplido/:token" element={<GiCumplidoWrapper />} />
        <Route path="/public/gi-seguimiento/:doc" element={<GiSeguimientoWrapper />} />
        <Route path="/publico/capacitacion/*" element={<PublicTraining />} />
        <Route path="/publico/cap/*" element={<PublicCapacitacion />} />
        <Route path="/publico/visitas/*" element={<PublicVisitForm />} />
        <Route path="/documentacion/*" element={<PublicDocForm />} />

        {/* MODO PORTAL: Asistencia o Cliente */}
        <Route
          path="/attendance/register"
          element={
            <>
              <Toaster position="top-left" richColors theme="dark" />
              <PWABanner />
              <AutoUpdate />
              <PortalLayout>
                <PublicAttendanceForm />
              </PortalLayout>
            </>
          }
        />
        <Route
          path="/portal/tracking"
          element={
            <>
              <Toaster position="top-left" richColors theme="dark" />
              <PWABanner />
              <AutoUpdate />
              <PortalLayout>
                <OrderTracking />
              </PortalLayout>
            </>
          }
        />
        <Route
          path="/portal/*"
          element={
            <>
              <Toaster position="top-left" richColors theme="dark" />
              <PWABanner />
              <AutoUpdate />
              <PortalLayout>
                <ClientLogin onLogin={(token) => {
                  localStorage.setItem('m7_client_token', token);
                  window.location.href = '/portal/tracking';
                }} />
              </PortalLayout>
            </>
          }
        />
      </Routes>
    </Suspense>
  );
};

export const isPublicRoute = (pathname: string, hash: string): boolean => {
  if (
    pathname.startsWith('/publico/') ||
    pathname.startsWith('/public/') ||
    pathname.startsWith('/documentacion/') ||
    pathname.startsWith('/attendance/') ||
    pathname.startsWith('/portal') ||
    hash.startsWith('#/portal') ||
    hash.startsWith('#/publico/')
  ) {
    return true;
  }
  return false;
};
