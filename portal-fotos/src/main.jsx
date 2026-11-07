import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './editor.css'
import './landing.css'
import './typography.css'
import './login-fix.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
