import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<ThemeProvider defaultTheme='dark' storageKey='mutter-theme'>
				<App />
			</ThemeProvider>
		</ErrorBoundary>
	</React.StrictMode>
);
