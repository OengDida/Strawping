import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App.jsx';
import CatalogRealtimeSync from './features/catalog/components/CatalogRealtimeSync.jsx';
import './index.css';

// Product imagery is served from the configured Supabase project. Warm that
// connection before React mounts the data-driven hero and product images.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
if (supabaseUrl) {
  try {
    const imageOrigin = new URL(supabaseUrl).origin;
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = imageOrigin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
  } catch {
    // Ignore invalid optional configuration; the app reports auth/API issues elsewhere.
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CatalogRealtimeSync />
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
