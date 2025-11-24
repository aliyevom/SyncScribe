<p align="center">
  <a href="https://github.com/aliyevom/self-supervised-multimodal-asr" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/Open-Self--Supervised%20Multimodal%20ASR-111827?style=for-the-badge&logo=github&labelColor=0ea5e9&color=111827" alt="Open Self-Supervised Multimodal ASR" />
  </a>
 </p>



# RAG in the Self-Supervised ASR Pipeline

The ASR research pipeline now features a deep integration of Retrieval-Augmented Generation (RAG) to enhance transcription analysis with dynamic external knowledge. This integration tightly couples real-time speech recognition with document retrieval and LLM-based generation, all within the self-supervised ASR framework. The result is an ASR system that not only transcribes speech, but also provides context-enriched insights using relevant documents, in real-time and at scale. The following sections describe the extended pipeline, formalize the context fusion mechanism, and detail the runtime operations (embedding similarity matching, bucket filtering, multi-agent dispatch, etc.) that make RAG enhancement possible.

## Pipeline Extension for RAG Integration

**Streaming ASR Output**  
The audio stream is transcribed by the self-supervised ASR model (e.g. Whisper) in real-time. Partial transcriptions are delivered via gRPC streaming to the backend with minimal latency. Each final transcription chunk (e.g. a sentence or time-window block) is assigned a unique `blockId` for tracking.

**Trigger AI Analysis**  
When a transcription block is finalized, a process_with_ai event is emitted (via Socket.io/gRPC) to the AI analysis engine. This event includes the transcribed text, the blockId, the selected AI agent (e.g. Meeting Analyst), and a flag indicating whether RAG is enabled for this session.


**Real-Time Retrieval**  
- Embeds transcript using a model (e.g., `text-embedding-ada-002`).
- Uses cosine similarity:  
  `sim(q,d_i) = (q · d_i) / (|q||d_i|)`
- Retrieves top-k chunks with similarity above threshold τ (e.g. 0.70).




## Context Vector Fusion

Transcripts and documents are merged:
```

P_RAG = T ⊕ D1 ⊕ D2 ⊕ ... ⊕ Dk

```

In long conversations:
- Applies cosine window mask to weigh recent blocks more heavily:
```

w_j = 0.5 * (1 + cos(π * j / N))

```

## Runtime Prompt Injection

Document excerpts are injected with labels and delimiters:
- E.g., `[Doc1: Title] Content...`
- Prompt begins with instructions, followed by transcript, then docs.

## LLM Generation and Multi-Agent Dispatch

Two prompts are sent in parallel:
- Original prompt (Agent 1)
- RAG-enhanced prompt (Agent 2)

Both return streamed responses via gRPC. Partial results are rendered live.

## Duplicate Prevention

Tracks processed block IDs to avoid redundant AI analysis.

## Aggregation of Results

Responses include:
- `analysisType`: original or document-enhanced
- `ragUsed`: true/false
- `ragSources`: document names and similarity scores

## Real-Time Embedding Matching & Updates

- Documents are pre-chunked, embedded, and stored in memory.
- Embedding updates occur dynamically per block, enabling rolling adaptation.

## Formalism: Context Fusion & Prompt Optimization

LLM input as:
```

C = [x1, x2, ..., xm, d1, d2, ..., dn]

```

Uses:
- Positional encoding to distinguish transcript and docs
- Cosine-weighted summary if history exceeds token limits

## Source Attribution

Document titles or filenames appended in prompts and UI. Enhances LLM grounding and transparency.

## Multi-Agent Orchestration

- Async non-blocking calls
- gRPC used to stream partial results
- Deduplication ensures exactly one pair of outputs per block

## Visualization and Benchmarking

- RAG-enhanced outputs styled distinctly (e.g., purple cards)
- Sources listed with similarity percentages
- Side-by-side comparison with original response

## Performance Overview

| Aspect                  | Baseline Model (No RAG)                      | RAG-Enhanced Model                              |
|------------------------|----------------------------------------------|-------------------------------------------------|
| Context Used           | Transcript only                              | Transcript + Retrieved documents                |
| Knowledge Scope        | Internal model data                          | Up-to-date, external documents                  |
| Factual Accuracy       | May miss specifics                           | High; directly cites sources                    |
| Output Detail          | Generalized                                  | Detailed, source-grounded                       |
| Response Length        | Shorter                                      | Often longer and richer                         |
| Latency (per block)    | ~7.6s (1x LLM)                               | ~1.2x (~7.6s original + ~4.3s RAG in parallel)  |
| Computational Cost     | 1x LLM inference                             | ~1.1x embedding + 1x LLM original + 1x LLM RAG  |
| Handling Long Sessions | May drop early content                       | Applies cosine mask; manages token limit        |
| Strengths              | Fast, no external dependency                 | Richer, informed, traceable insights            |
| Weaknesses             | May hallucinate or lack specific detail      | Slight latency, dependent on doc quality        |




