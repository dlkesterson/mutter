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

export interface FileNode {
    path: string;
    name: string;
    is_dir: boolean;
    children?: FileNode[];
}

export interface SearchResult {
    path: string;
    title: string;
    excerpt: string;
}

export interface Task {
    id?: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    source_file?: string;
    line_number?: number;
}

export interface ExtractedTask {
    description: string;
    checked: boolean;
    line_number: number;
}
