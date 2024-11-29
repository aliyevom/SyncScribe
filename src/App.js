import React from 'react';
import TranscriptionRoom from './components/TranscriptionRoom';
import './App.css';

function App() {
  React.useEffect(() => {
    document.title = 'Beta version 2.0';
  }, []);

  return (
    <div className="App">
     
      <TranscriptionRoom roomId="demo-room" />
    </div>
  );
}

export default App;
