import React from 'react';
import TranscriptionRoom from './components/TranscriptionRoom';
import './App.css';

function App() {
  React.useEffect(() => {
    document.title = 'SyncScribe';
  }, []);

  return (
    <div className="App">
     
      <TranscriptionRoom roomId="demo-room" />
    </div>
  );
}

export default App;
