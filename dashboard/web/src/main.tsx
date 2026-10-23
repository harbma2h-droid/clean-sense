import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isDemo } from './api';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if (!isDemo && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
