class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputData = input[0];
    
    // Fill buffer with input data
    for (let i = 0; i < inputData.length; i++) {
      this.buffer[this.bufferIndex] = inputData[i];
      this.bufferIndex++;

      // When buffer is full, send it to the main thread
      if (this.bufferIndex >= this.bufferSize) {
        const audioData = new Float32Array(this.buffer);
        this.port.postMessage({ audioData });
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor); 