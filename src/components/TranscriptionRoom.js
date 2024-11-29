import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { saveAs } from 'file-saver';
import './TranscriptionRoom.css';

const TranscriptionRoom = ({ roomId }) => {
  const [transcripts, setTranscripts] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [aiResponses, setAiResponses] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [pendingTranscripts, setPendingTranscripts] = useState([]);
  const socketRef = useRef();
  const audioContextRef = useRef(null);
  const screenStreamRef = useRef(null);
  const lastAnalysisTimeRef = useRef(null);
  const ANALYSIS_INTERVAL = 20000; // 20 seconds
  const [currentSegment, setCurrentSegment] = useState({
    text: '',
    startTime: null,
    timeLeft: 20
  });
  const [screenPreview, setScreenPreview] = useState(null);
  const [selectedService, setSelectedService] = useState('');
  const [currentStep, setCurrentStep] = useState('provider'); // 'provider', 'recording', 'transcribing'
  const [isProviderLocked, setIsProviderLocked] = useState(false);

  const cleanupAudioContext = () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.suspend()
          .then(() => {
            if (audioContextRef.current) {  // Check again before closing
              return audioContextRef.current.close();
            }
          })
          .then(() => {
            audioContextRef.current = null;
          })
          .catch((error) => {
            console.warn('Audio context cleanup error:', error);
            audioContextRef.current = null;
          });
      } else {
        audioContextRef.current = null;
      }
    } catch (error) {
      console.warn('Audio context cleanup error:', error);
      audioContextRef.current = null;
    }
  };

  useEffect(() => {
    socketRef.current = io('http://localhost:5002');

    // Timer for countdown
    const countdownInterval = setInterval(() => {
      setCurrentSegment(prev => {
        if (!prev.startTime) return prev;
        const elapsed = (Date.now() - prev.startTime) / 1000;
        const timeLeft = Math.max(0, 20 - Math.floor(elapsed));
        return { ...prev, timeLeft };
      });
    }, 1000);

    socketRef.current.on('transcription', (transcription) => {
      console.log('Received transcription:', transcription);
      if (transcription.isFinal) {
        setTranscripts(prev => {
          const lastTranscript = prev[prev.length - 1];
          if (lastTranscript?.text === transcription.text) {
            return prev;
          }
          return [...prev, transcription];
        });

        // Update current segment
        setCurrentSegment(prev => {
          if (!prev.startTime) {
            return {
              text: transcription.text,
              startTime: Date.now(),
              timeLeft: 20
            };
          }
          return {
            ...prev,
            text: prev.text + ' ' + transcription.text
          };
        });
      }
    });

    // Add error handling
    socketRef.current.on('transcription_error', (error) => {
      console.error('Transcription error:', error);
      alert(`Transcription error: ${error.message}`);
    });

    // Set up interval for processing accumulated transcripts
    const analysisInterval = setInterval(() => {
      setCurrentSegment(prev => {
        if (prev.text.trim()) {
          processTranscriptionWithAI(prev.text);
          return { text: '', startTime: null, timeLeft: 20 };
        }
        return prev;
      });
    }, ANALYSIS_INTERVAL);

    socketRef.current.on('ai_response', (response) => {
      setAiResponses(prev => [...prev, {
        text: response.text,
        timestamp: new Date().toISOString(),
        isError: response.isError,
        isMock: response.isMock
      }]);
      setIsAiThinking(false);
    });

    return () => {
      cleanupAudioContext();
      clearInterval(countdownInterval);
      clearInterval(analysisInterval);
      socketRef.current.disconnect();
    };
  }, []);

  const processTranscriptionWithAI = async (text) => {
    if (!text.trim()) return;
    setIsAiThinking(true);
    socketRef.current.emit('process_with_ai', { text, roomId });
  };

  const ServiceSelector = () => {
    const handleBack = () => {
      // Only allow going back if not in transcribing step
      if (currentStep !== 'transcribing') {
        setSelectedService('');
        setCurrentStep('provider');
      }
    };

    return (
      <div className={`service-selector ${currentStep === 'transcribing' ? 'locked' : ''}`}>
        <div className="background-animation"></div>
        <button 
          className={`back-button ${selectedService && currentStep !== 'transcribing' ? 'visible' : ''}`}
          onClick={handleBack}
          disabled={currentStep === 'transcribing'}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Back to selection
        </button>
        <div className="lock-overlay" style={{ 
          display: currentStep === 'transcribing' ? 'flex' : 'none' 
        }}>
          <span className="lock-icon">🔒</span>
          <p>Provider selection locked during transcription</p>
        </div>
        <h3>Step 1: Select Speech-to-Text Provider</h3>
        <div className="service-buttons">
          <button 
            className={`service-button ${selectedService === 'google' ? 'active' : ''} 
              ${selectedService === 'openai' ? 'other-selected' : ''}`}
            onClick={() => {
              setSelectedService('google');
              setCurrentStep('recording');
            }}
            disabled={currentStep === 'transcribing'}
          >
            <img 
              src="/images/gcp.png" 
              alt="Google Cloud Platform"
              className="service-icon"
            />
          </button>
          <button 
            className={`service-button ${selectedService === 'openai' ? 'active' : ''} 
              ${selectedService === 'google' ? 'other-selected' : ''}`}
            onClick={() => {
              setSelectedService('openai');
              setCurrentStep('recording');
            }}
            disabled={currentStep === 'transcribing'}
          >
            <img 
              src="/images/openai.png" 
              alt="OpenAI"
              className="service-icon"
            />
          </button>
        </div>
      </div>
    );
  };

  const startScreenShare = async () => {
    try {
      // Lock provider selection when starting screen share
      setIsProviderLocked(true);
      setCurrentStep('transcribing');
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1
        }
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const videoElement = document.createElement('video');
        videoElement.srcObject = new MediaStream([videoTrack]);
        videoElement.onloadedmetadata = () => {
          videoElement.play();
        };
        setScreenPreview(videoElement);
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track found in screen share');
      }

      screenStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(new MediaStream([audioTrack]));
      const processor = audioContextRef.current.createScriptProcessor(8192, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const resampledData = new Float32Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          resampledData[i] = inputData[i];
        }
        
        const pcmData = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
          const s = Math.max(-1, Math.min(1, resampledData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        socketRef.current.emit('audio_data', {
          roomId,
          audio: pcmData.buffer,
          isScreenShare: true,
          service: selectedService
        });
      };

      // Start recording automatically when screen sharing starts
      if (selectedService === 'google') {
        await startRecording(stream);
      }

      socketRef.current.emit('start_transcription', { 
        roomId,
        service: selectedService 
      });
      setIsScreenSharing(true);

      // Handle screen share stop
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
      alert('Error starting screen share: ' + error.message);
      // Unlock on error
      setIsProviderLocked(false);
      setCurrentStep('recording');
    }
  };

  const stopScreenShare = () => {
    try {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      
      // Stop recording if using Google service
      if (selectedService === 'google' && isRecording) {
        stopRecording();
      }
      
      cleanupAudioContext();
      socketRef.current.emit('stop_transcription', roomId);
      setIsScreenSharing(false);
      setScreenPreview(null);
      
      // Reset back to step 1
      setIsProviderLocked(false);
      setCurrentStep('provider');
      setSelectedService(''); // Clear selected service
    } catch (error) {
      console.error('Error stopping screen share:', error);
    }
  };

  const startRecording = async (existingStream = null) => {
    try {
      const stream = existingStream || await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(1024, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        const audioData = e.inputBuffer.getChannelData(0);
        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          int16Array[i] = audioData[i] * 0x7FFF;
        }
        
        socketRef.current.emit('audio_data', {
          roomId,
          audio: int16Array.buffer,
          isScreenShare: !!existingStream,
          service: selectedService
        });
      };

      socketRef.current.emit('start_transcription', { 
        roomId,
        service: selectedService 
      });
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error starting recording: ' + error.message);
    }
  };

  const stopRecording = () => {
    try {
      cleanupAudioContext();
      socketRef.current.emit('stop_transcription', roomId);
      setIsRecording(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const exportTranscript = () => {
    const text = transcripts.map(t => t.text).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `transcript-${roomId}-${new Date().toLocaleDateString()}.txt`);
  };

  useEffect(() => {
    if (!window.AudioContext) {
      console.warn('AudioContext is not supported in this browser');
    } else if (!window.AudioWorklet) {
      console.warn('AudioWorklet is not supported in this browser, falling back to ScriptProcessor');
    }
  }, []);

  const StepIndicator = () => {
    return (
      <div className="step-indicator">
        <div className={`step ${currentStep === 'provider' ? 'active' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Select Provider</div>
        </div>
        <div className={`step ${currentStep === 'recording' ? 'active' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Start Recording</div>
        </div>
        <div className={`step ${currentStep === 'transcribing' ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-label">Transcribing</div>
        </div>
      </div>
    );
  };

  return (
    <div className="transcription-room">
      <h1 className="app-title">Beta version 3.0</h1>
      <StepIndicator />
      <div className="step-container">
        <ServiceSelector />
        <div className={`controls-container ${currentStep === 'provider' ? 'locked' : ''}`}>
          <div className="lock-overlay" style={{ display: currentStep === 'provider' ? 'flex' : 'none' }}>
            <span className="lock-icon">🔒</span>
            <p>Please select a provider first</p>
          </div>
          
          <h3>Step 2: Start Recording</h3>
          <div className="controls">
            <button 
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={isScreenSharing ? 'stop-screen' : 'start-screen'}
              disabled={currentStep === 'provider' || !selectedService}
            >
              {isScreenSharing ? '⏹ Stop Screen Share' : '🖥 Share Screen/Tab'}
            </button>
            
            {transcripts.length > 0 && (
              <button 
                onClick={exportTranscript} 
                className="export"
                disabled={transcripts.length === 0}
              >
                💾 Export Transcript
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="split-view">
        <div className="left-panel">
          {screenPreview && (
            <div className="screen-preview-container">
              <div className="screen-preview">
                <video 
                  ref={node => node && (node.srcObject = screenPreview.srcObject)} 
                  autoPlay 
                  muted 
                />
              </div>
            </div>
          )}
          
          <div className="transcription-panel">
            <h2>
              Live Transcription
              {(isRecording || isScreenSharing) && (
                <div className="header-status">
                  <div className="recording-dot"></div>
                  {isRecording ? 'Recording in progress...' : 'Screen sharing in progress...'}
                </div>
              )}
            </h2>
            <div className="transcripts">
              {transcripts.length === 0 ? (
                <div className="transcript empty">
                  <span className="text">Start recording or share your screen to begin transcription...</span>
                </div>
              ) : (
                <div className="transcript continuous">
                  {transcripts.map((transcript, index) => (
                    <span 
                      key={index} 
                      className={`sentence ${index === transcripts.length - 1 ? 'new' : ''}`}
                    >
                      {transcript.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="ai-response-panel">
          <h2>AI Analysis</h2>
          <div className="segment-status">
            <div className="status-indicator">
              <div className="progress-bar" style={{ 
                width: `${(currentSegment.timeLeft / 20) * 100}%` 
              }}></div>
              {currentSegment.startTime ? (
                <span>Collecting conversation... {currentSegment.timeLeft}s until analysis</span>
              ) : (
                <span>Waiting for conversation to begin...</span>
              )}
            </div>
          </div>
          <div className="ai-responses">
            {aiResponses.length === 0 ? (
              <div className="ai-response">
                <span className="text">
                  Collecting conversation context... Analysis will appear every 20 seconds.
                </span>
              </div>
            ) : (
              aiResponses.map((response, index) => (
                <div 
                  key={index} 
                  className={`ai-response ${response.isError ? 'error' : ''} ${response.isMock ? 'mock' : ''}`}
                >
                  {response.context && (
                    <div className="context">
                      <div className="context-label">Analyzed Conversation:</div>
                      <div className="context-text">{response.context}</div>
                    </div>
                  )}
                  <div className="analysis">
                    <div className="analysis-label">AI Analysis:</div>
                    <div className="analysis-text">{response.text}</div>
                  </div>
                  {response.isMock && <span className="mock-indicator">Demo Mode</span>}
                </div>
              ))
            )}
            {isAiThinking && (
              <div className="ai-thinking">
                <div className="thinking-dots"></div>
                Analyzing recent conversation...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionRoom;
