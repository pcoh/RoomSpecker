import express from 'express';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// In-memory storage for rooms
const rooms = [];

app.post('/api/rooms', (req, res) => {
  const room = {
    id: rooms.length + 1,
    ...req.body,
    created_at: new Date(),
    updated_at: new Date()
  };
  rooms.push(room);
  res.json(room);
});

app.get('/api/rooms', (req, res) => {
  res.json(rooms);
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.find(r => r.id === parseInt(req.params.id));
  if (room) {
    res.json(room);
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

app.post('/api/process-room', (req, res) => {
  try {
    const roomData = req.body;
    
    // Format the data for external API processing
    const formattedData = {
      points: roomData.points.map(point => ({
        x: Math.round(point.x),
        y: Math.round(point.y),
        z: 0 // Adding Z coordinate for 3D processing
      })),
      walls: roomData.points.map((point, index) => {
        const nextPoint = roomData.points[(index + 1) % roomData.points.length];
        return {
          start: index,
          end: (index + 1) % roomData.points.length,
          length: Math.sqrt(
            Math.pow(nextPoint.x - point.x, 2) + 
            Math.pow(nextPoint.y - point.y, 2)
          )
        };
      })
    };

    // Here you would send the data to an external API
    // For now, we just return the formatted data
    res.json({
      status: 'success',
      message: 'Room processed successfully',
      data: formattedData
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});