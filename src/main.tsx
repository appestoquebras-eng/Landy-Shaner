import {MarketingConsent} from './components/MarketingConsent';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<><App />{location.pathname.replace(/\/$/,'')!=='/painel'&&<MarketingConsent />}</>);
