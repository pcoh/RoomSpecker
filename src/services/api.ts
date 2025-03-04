import axios from 'axios';

export interface Point {
  x: number;
  y: number;
}

export interface RoomData {
  name?: string;
  points: Point[];
}

// Create axios instance with default config
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Configure for external API integration
// This can be updated later when the actual API endpoint is determined
export const configureExternalApi = (baseUrl: string, apiKey?: string) => {
  if (baseUrl) {
    // Update the baseURL for the external API
    api.defaults.baseURL = baseUrl;
  }
  
  if (apiKey) {
    // Add authorization header if API key is provided
    api.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
  }
};

export const roomApi = {
  async saveRoom(roomData: RoomData) {
    // Ensure data is serializable by creating a clean copy
    const serializedData = {
      name: roomData.name || `Room ${new Date().toLocaleString()}`,
      points: roomData.points.map(point => ({
        x: Math.round(point.x),
        y: Math.round(point.y)
      }))
    };
    
    const response = await api.post('/rooms', serializedData);
    return response.data;
  },

  async processRoom(roomData: RoomData) {
    // Ensure data is serializable by creating a clean copy
    const serializedData = {
      points: roomData.points.map(point => ({
        x: Math.round(point.x),
        y: Math.round(point.y)
      }))
    };
    
    const response = await api.post('/process-room', serializedData);
    return response.data;
  },

  async getRooms() {
    const response = await api.get('/rooms');
    return response.data;
  },

  async getRoom(id: number) {
    const response = await api.get(`/rooms/${id}`);
    return response.data;
  },
  
  // Method to send room data to a custom external API
  async sendToExternalApi(roomData: RoomData, endpoint: string) {
    const serializedData = {
      points: roomData.points.map(point => ({
        x: Math.round(point.x),
        y: Math.round(point.y)
      }))
    };
    
    try {
      const response = await axios.post(endpoint, serializedData);
      return response.data;
    } catch (error) {
      console.error('Error sending to external API:', error);
      throw error;
    }
  }
};

export default roomApi;