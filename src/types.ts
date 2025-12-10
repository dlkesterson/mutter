export interface VoiceLogEntry {
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
