#!/bin/bash
# Model Download Helper for Mutter
# Downloads distil-whisper-medium.en model for on-device transcription

set -e

MODEL_NAME="distil-whisper-medium.en"
MODEL_REPO="distil-whisper/distil-medium.en"
MODELS_DIR="${HOME}/.local/share/mutter/models/${MODEL_NAME}"

echo "🎤 Mutter Model Downloader"
echo "=========================="
echo ""
echo "Model: ${MODEL_NAME}"
echo "Target: ${MODELS_DIR}"
echo ""

# Create models directory
mkdir -p "${MODELS_DIR}"

echo "📦 Checking for huggingface-cli..."
if ! command -v huggingface-cli &> /dev/null; then
    echo "❌ huggingface-cli not found!"
    echo ""
    echo "Please install it with:"
    echo "  pip install huggingface_hub[cli]"
    echo ""
    echo "Or download manually from:"
    echo "  https://huggingface.co/${MODEL_REPO}/tree/main"
    echo ""
    echo "Required files:"
    echo "  - config.json"
    echo "  - tokenizer.json"
    echo "  - model.safetensors"
    exit 1
fi

echo "✅ huggingface-cli found"
echo ""

echo "⬇️  Downloading model files..."
echo "This may take a few minutes (~400MB)..."
echo ""

huggingface-cli download "${MODEL_REPO}" \
    --local-dir "${MODELS_DIR}" \
    --include "config.json" "tokenizer.json" "model.safetensors"

echo ""
echo "✅ Download complete!"
echo ""
echo "Model files saved to:"
echo "  ${MODELS_DIR}"
echo ""
echo "Files downloaded:"
ls -lh "${MODELS_DIR}"
echo ""
echo "🎉 Ready to use! The model will be automatically loaded on next app start."
echo ""
echo "Next steps:"
echo "1. Restart Mutter if it's running"
echo "2. Click the microphone button"
echo "3. Speak naturally - your speech will be transcribed!"
echo ""
echo "Note: First transcription may be slow (~30s) as the model loads into memory."
