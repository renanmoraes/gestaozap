import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DialogProvider } from './components/ui/DialogProvider';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <DialogProvider>
      <App />
    </DialogProvider>
  </BrowserRouter>
);
