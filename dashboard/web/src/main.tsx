import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PublicDoc } from './pages/PublicDoc';
import { isDemo } from './api';
import './styles.css';

// /d/<token> is a customer's document link: no sign-in, no staff screens.
const docLink = location.pathname.match(/^\/d\/([\w-]{20,})\/?$/);
createRoot(document.getElementById('root')!).render(docLink ? <PublicDoc token={docLink[1]} /> : <App />);

if (!isDemo && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
