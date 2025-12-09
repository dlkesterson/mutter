import { useState } from 'react';
import './VoiceLogSidebar.css';

interface VoiceLogEntry {
	id: string;
	timestamp: Date;
	transcript: string;
	interpretation: string;
	confidence: number;
	action: 'command' | 'text' | 'ambiguous';
	timings?: {
		stt_ms?: number;
		embed_ms?: number;
		search_ms?: number;
		total_ms?: number;
	};
}

interface VoiceLogSidebarProps {
	entries: VoiceLogEntry[];
	isCollapsed: boolean;
	onToggle: () => void;
}

export default function VoiceLogSidebar({
	entries,
	isCollapsed,
	onToggle,
}: VoiceLogSidebarProps) {
	const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	};

	const getActionIcon = (action: string) => {
		switch (action) {
			case 'command':
				return '⚡';
			case 'text':
				return '📝';
			case 'ambiguous':
				return '❓';
			default:
				return '•';
		}
	};

	const getActionColor = (action: string) => {
		switch (action) {
			case 'command':
				return '#10b981';
			case 'text':
				return '#3b82f6';
			case 'ambiguous':
				return '#f59e0b';
			default:
				return '#6b7280';
		}
	};

	if (isCollapsed) {
		return (
			<div className='voice-log-sidebar collapsed'>
				<button className='voice-log-toggle' onClick={onToggle}>
					<span className='toggle-icon'>📋</span>
				</button>
			</div>
		);
	}

	return (
		<div className='voice-log-sidebar'>
			<div className='voice-log-header'>
				<h3 className='voice-log-title'>Voice Log</h3>
				<span className='voice-log-count'>{entries.length}</span>
				<button className='voice-log-collapse' onClick={onToggle}>
					→
				</button>
			</div>

			<div className='voice-log-entries'>
				{entries.length === 0 ? (
					<div className='voice-log-empty'>
						<span className='empty-icon'>🎤</span>
						<p>No voice commands yet</p>
						<p className='empty-hint'>
							Start speaking to see your commands here
						</p>
					</div>
				) : (
					entries
						.slice()
						.reverse()
						.map((entry) => (
							<div
								key={entry.id}
								className={`voice-log-entry ${
									expandedEntry === entry.id ? 'expanded' : ''
								}`}
								onClick={() =>
									setExpandedEntry(
										expandedEntry === entry.id
											? null
											: entry.id
									)
								}
							>
								<div className='entry-header'>
									<span
										className='entry-icon'
										style={{
											color: getActionColor(entry.action),
										}}
									>
										{getActionIcon(entry.action)}
									</span>
									<span className='entry-time'>
										{formatTime(entry.timestamp)}
									</span>
									<span
										className='entry-confidence'
										style={{
											background:
												entry.confidence > 0.85
													? '#10b981'
													: entry.confidence > 0.65
													? '#f59e0b'
													: '#6b7280',
										}}
									>
										{Math.round(entry.confidence * 100)}%
									</span>
								</div>

								<div className='entry-content'>
									<div className='entry-transcript'>
										"{entry.transcript}"
									</div>
									<div className='entry-interpretation'>
										→ {entry.interpretation}
									</div>
								</div>

								{expandedEntry === entry.id &&
									entry.timings && (
										<div className='entry-timings'>
											<div className='timing-grid'>
												{entry.timings.stt_ms && (
													<div className='timing-item'>
														<span className='timing-label'>
															STT
														</span>
														<span className='timing-value'>
															{
																entry.timings
																	.stt_ms
															}
															ms
														</span>
													</div>
												)}
												{entry.timings.embed_ms && (
													<div className='timing-item'>
														<span className='timing-label'>
															Embed
														</span>
														<span className='timing-value'>
															{
																entry.timings
																	.embed_ms
															}
															ms
														</span>
													</div>
												)}
												{entry.timings.search_ms && (
													<div className='timing-item'>
														<span className='timing-label'>
															Search
														</span>
														<span className='timing-value'>
															{
																entry.timings
																	.search_ms
															}
															ms
														</span>
													</div>
												)}
												{entry.timings.total_ms && (
													<div className='timing-item total'>
														<span className='timing-label'>
															Total
														</span>
														<span className='timing-value'>
															{
																entry.timings
																	.total_ms
															}
															ms
														</span>
													</div>
												)}
											</div>
										</div>
									)}
							</div>
						))
				)}
			</div>
		</div>
	);
}

export type { VoiceLogEntry };
