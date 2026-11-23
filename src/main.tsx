import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Admin from './Admin'
import './styles.css'

const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname === '/admin/'
const Root = isAdminRoute ? Admin : App
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
