use crate::ml::cosine_similarity;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandIntent {
    pub id: String,
    pub phrases: Vec<String>,
    pub embedding: Vec<f32>,
    pub action: CommandAction,
    pub selection_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandAction {
    Format(FormatType),
    Editor(EditorAction),
    System(SystemAction),
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
            },
            CommandIntent {
                id: "editor_undo".to_string(),
                phrases: vec![
                    "undo".to_string(),
                    "undo that".to_string(),
                    "go back".to_string(),
                    "revert".to_string(),
                ],
                embedding: vec![],
                action: CommandAction::Editor(EditorAction::Undo),
                selection_required: false,
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
            },
        ]
    }

    pub fn find_best_match(
        &self,
        input_embedding: &[f32],
        has_selection: bool,
    ) -> Option<(CommandIntent, f32)> {
        let mut best_match: Option<(CommandIntent, f32)> = None;

        for command in &self.commands {
            // Skip commands that require selection if user has none
            if command.selection_required && !has_selection {
                continue;
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
