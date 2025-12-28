import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppWithConfig } from './AppWithConfig';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<ThemeProvider defaultTheme='dark' storageKey='mutter-theme'>
				<AppWithConfig />
			</ThemeProvider>
		</ErrorBoundary>
	</React.StrictMode>
);
