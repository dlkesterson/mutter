export interface VoiceLogEntry {
    id: string;
    timestamp: Date;
    transcript: string;
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
