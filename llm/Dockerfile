# Gemma behind llama.cpp's OpenAI-compatible server, CPU only.
# Same server build as tested locally (b11609 -> nearest image tag b11610).
FROM ghcr.io/ggml-org/llama.cpp:server-b11610

# The model is baked into the image so a restart doesn't re-download 2.5 GB.
# For a faster, lighter model on a 2 GB instance, build with:
#   MODEL_URL=https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf
ARG MODEL_URL=https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf
ADD ${MODEL_URL} /models/gemma.gguf

# One request at a time with a full context: pages are processed one by one.
# LLAMA_API_KEY (from the environment) protects every endpoint except /health.
ENV LLAMA_ARG_MODEL=/models/gemma.gguf \
    LLAMA_ARG_CTX_SIZE=8192 \
    LLAMA_ARG_N_PARALLEL=1

# Render sets $PORT.
ENTRYPOINT ["/bin/sh", "-c", "exec /app/llama-server --host 0.0.0.0 --port ${PORT:-8080}"]
