import React from 'react';
import RoomDesigner from './components/RoomDesigner';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Room Dimension Tool</h1>
        <p className="text-gray-600 mb-8">Design room layouts and send the dimensions to your preferred API endpoint</p>
        <RoomDesigner />
      </div>
    </div>
  );
}

export default App;