import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App.jsx';
import CatalogRealtimeSync from './features/catalog/components/CatalogRealtimeSync.jsx';
import './index.css';

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
