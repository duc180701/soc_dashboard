import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './Dashboard.jsx';
import './styles.css';
import './attack-map.css';
import './overrides.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
