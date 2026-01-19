use crate::ml::cosine_similarity;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandIntent {
    pub id: String,
    pub phrases: Vec<String>,
    pub embedding: Vec<f32>,
    pub action: CommandAction,
    pub selection_required: bool,
    pub context_filter: Option<String>, // e.g., "code", "browser"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandAction {
    Format(FormatType),
    Editor(EditorAction),
    System(SystemAction),
    AppSpecific(String), // New action type for app-specific commands
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FormatType {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Heading { level: u8 },
    Quote,
    BulletList,
    NumberedList,
    Checkbox,
    Link,
    Image,
    Table,
    CodeBlock,
    HorizontalRule,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EditorAction {
    Undo,
    Redo,
    UndoVoiceCommand,
    NewLine,
    Delete,
    SelectAll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemAction {
    CreateNote { name: String },
    OpenNote { name: String },
    Search { query: String },
    SaveNote,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorContext {
    pub line_text: String,
    pub line_number: usize,
    pub is_start_of_line: bool,
    pub is_end_of_line: bool,
    pub previous_char: String,
    pub next_char: String,
}

pub struct CommandRegistry {
    pub commands: Vec<CommandIntent>,
}

impl CommandRegistry {
    pub fn new() -> Self {
        Self {
            commands: Self::default_commands(),
        }
    }

    fn default_commands() -> Vec<CommandIntent> {
        vec![
            CommandIntent {
                id: "format_bold".to_string(),
                phrases: vec![
                    "make this bold".to_string(),
                    "bold this".to_string(),
                    "bold text".to_string(),
                    "make it bold".to_string(),
                ],
                embedding: vec![], // Will be computed on first run
                action: CommandAction::Format(FormatType::Bold),
                selection_required: true,
                context_filter: None,
            },
            CommandIntent {
                id: "format_italic".to_string(),
                phrases: vec![
                    "make this italic".to_string(),
                    "italicize this".to_string(),
                    "italic text".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Italic),
                selection_required: true,
                context_filter: None,
            },
            CommandIntent {
                id: "format_heading1".to_string(),
                phrases: vec![
                    "make this a heading".to_string(),
                    "heading one".to_string(),
                    "h1".to_string(),
                    "big heading".to_string(),
                    "title".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Heading { level: 1 }),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "format_heading2".to_string(),
                phrases: vec![
                    "heading two".to_string(),
                    "h2".to_string(),
                    "subheading".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Heading { level: 2 }),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "format_bullet_list".to_string(),
                phrases: vec![
                    "make this a list".to_string(),
                    "bullet list".to_string(),
                    "turn into list".to_string(),
                    "list items".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::BulletList),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "format_quote".to_string(),
                phrases: vec![
                    "quote this".to_string(),
                    "make this a quote".to_string(),
                    "block quote".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Quote),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "editor_undo".to_string(),
                phrases: vec![
                    "undo".to_string(),
                    "go back".to_string(),
                    "revert".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Editor(EditorAction::Undo),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "editor_redo".to_string(),
                phrases: vec![
                    "redo".to_string(),
                    "redo that".to_string(),
                    "go forward".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Editor(EditorAction::Redo),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "insert_link".to_string(),
                phrases: vec![
                    "add link".to_string(),
                    "insert link".to_string(),
                    "create link".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Link),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "insert_image".to_string(),
                phrases: vec![
                    "add image".to_string(),
                    "insert image".to_string(),
                    "add picture".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Image),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "insert_table".to_string(),
                phrases: vec![
                    "add table".to_string(),
                    "insert table".to_string(),
                    "create table".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Table),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "insert_code_block".to_string(),
                phrases: vec![
                    "add code block".to_string(),
                    "insert code block".to_string(),
                    "code block".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::CodeBlock),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "insert_task_list".to_string(),
                phrases: vec![
                    "add task list".to_string(),
                    "insert task list".to_string(),
                    "add checkbox".to_string(),
                    "checklist".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Checkbox),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "insert_horizontal_rule".to_string(),
                phrases: vec![
                    "add horizontal rule".to_string(),
                    "insert horizontal rule".to_string(),
                    "add divider".to_string(),
                    "horizontal line".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::HorizontalRule),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "format_inline_code".to_string(),
                phrases: vec![
                    "format as code".to_string(),
                    "make this code".to_string(),
                    "inline code".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Format(FormatType::Code),
                selection_required: true,
                context_filter: None,
            },
            CommandIntent {
                id: "editor_undo_voice_command".to_string(),
                phrases: vec![
                    "undo that".to_string(),
                    "undo last command".to_string(),
                    "revert that".to_string(),
                    "go back".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Editor(EditorAction::UndoVoiceCommand),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "vscode_commit".to_string(),
                phrases: vec!["commit changes".to_string(), "git commit".to_string()],
                embedding: vec![],
                action: CommandAction::AppSpecific("git_commit".to_string()),
                selection_required: false,
                context_filter: Some("code".to_string()),
            },
            CommandIntent {
                id: "system_open_note".to_string(),
                phrases: vec![
                    "open note".to_string(),
                    "open file".to_string(),
                    "go to note".to_string(),
                    "switch to note".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::System(SystemAction::OpenNote {
                    name: "".to_string(),
                }),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "system_search".to_string(),
                phrases: vec![
                    "search for".to_string(),
                    "find note".to_string(),
                    "search notes".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::System(SystemAction::Search {
                    query: "".to_string(),
                }),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "agent_tracker_create_task".to_string(),
                phrases: vec![
                    "create task".to_string(),
                    "add task".to_string(),
                    "new task".to_string(),
                    "make a task".to_string(),
                    "create task from selection".to_string(),
                    "send to task tracker".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::AppSpecific("create_task".to_string()),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "cleanup_text".to_string(),
                phrases: vec![
                    "clean up text".to_string(),
                    "clean this up".to_string(),
                    "format this".to_string(),
                    "remove fillers".to_string(),
                    "tidy up".to_string(),
                    "fix transcription".to_string(),
                    "clean up transcription".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::AppSpecific("cleanup-text".to_string()),
                selection_required: false,
                context_filter: None,
            },
            CommandIntent {
                id: "show_commands".to_string(),
                phrases: vec![
                    "show commands".to_string(),
                    "help".to_string(),
                    "what can I say".to_string(),
                    "voice commands".to_string(),
                    "keyboard shortcuts".to_string(),
                    "show help".to_string(),
                    "list commands".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::AppSpecific("show-commands".to_string()),
                selection_required: false,
                context_filter: None,
            },
        ]
    }

    pub fn find_best_match(
        &self,
        input_embedding: &[f32],
        has_selection: bool,
        _cursor_context: &CursorContext,
        system_context: Option<&crate::system::SystemContext>,
    ) -> Option<(CommandIntent, f32)> {
        let mut best_match: Option<(CommandIntent, f32)> = None;

        for command in &self.commands {
            // Skip commands that require selection if user has none
            if command.selection_required && !has_selection {
                continue;
            }

            // Check context filter
            if let Some(filter) = &command.context_filter {
                if let Some(ctx) = system_context {
                    if !ctx.app_name.to_lowercase().contains(&filter.to_lowercase()) {
                        continue;
                    }
                } else {
                    // If command requires context but none provided, skip
                    continue;
                }
            }

            let similarity = cosine_similarity(input_embedding, &command.embedding);

            if let Some((_, best_similarity)) = &best_match {
                if similarity > *best_similarity {
                    best_match = Some((command.clone(), similarity));
                }
            } else {
                best_match = Some((command.clone(), similarity));
            }
        }

        best_match
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub action: ClassificationAction,
    pub confidence: f32,
    pub requires_disambiguation: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ClassificationAction {
    InsertText(String),
    ExecuteCommand(CommandAction),
    Ambiguous {
        text: String,
        possible_command: CommandAction,
    },
}
