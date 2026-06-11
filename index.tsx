import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

// @ts-ignore
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");

const root = ReactDOM.createRoot(rootElement!);

// Rutas 100% públicas: se montan SIN el store de autenticación (bypasea App y el SW caché)
if (window.location.pathname.startsWith('/publico/noticia')) {
  const PublicNoticiaPage = React.lazy(() => import('./components/Noticias/PublicNoticiaPage'));
  root.render(
    <React.Suspense fallback={
      <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#020617'}}>
        <div style={{width:40,height:40,border:'4px solid #10b981',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <PublicNoticiaPage />
    </React.Suspense>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
