// import React, { useState, useRef, useEffect, useMemo } from 'react';
// import { Copy, RotateCcw, DoorOpen, Square } from 'lucide-react';
// import ContextMenu from './ContextMenu';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, RotateCcw, DoorOpen, Square, Save } from 'lucide-react';
import ContextMenu from './ContextMenu';

// Room management interfaces
interface Room {
  id: string;
  points: Point[];
  doors: Door[];
  windows: Window[];
  isComplete: boolean;
  isMain: boolean;
}

interface Point {
  x: number;
  y: number;
  roomId?: string;
  attachedTo?: {
    roomId: string;
    wallIndex: number;
    t: number; // Parametric position on the wall (0-1)
  };
}

interface WallData {
  length: number;
  angle: number;
}

interface Door {
  wallIndex: number;
  startPoint: Point;
  endPoint: Point;
  width: number;
  position: number;
}

interface Window {
  wallIndex: number;
  startPoint: Point;
  endPoint: Point;
  width: number;
  height: number;
  sillHeight: number;
  position: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'line' | 'point' | 'door' | 'window';
  data: {
    index: number;
    point?: Point;
    doorIndex?: number;
    doorPointType?: 'start' | 'end';
    windowIndex?: number;
    windowPointType?: 'start' | 'end';
  };
}

const POINT_RADIUS = 5;
const DOOR_POINT_RADIUS = 4;
const WINDOW_POINT_RADIUS = 4;
const SNAP_DISTANCE = 30;
const MIN_SCALE = 0.025;
const MAX_SCALE = 2.0;
const ZOOM_FACTOR = 1.1;
const LABEL_OFFSET = 20;
const DEFAULT_DOOR_WIDTH = 900;
const DEFAULT_WINDOW_WIDTH = 1000;
const DEFAULT_WINDOW_HEIGHT = 1200;
const DEFAULT_WINDOW_SILL_HEIGHT = 900;

const CANVAS_WIDTH_MM = 10000;
const CANVAS_HEIGHT_MM = 8000;

const RoomDesigner: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isAddingSecondaryRoom, setIsAddingSecondaryRoom] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<{roomId: string, index: number} | null>(null);
  const [selectedDoorPoint, setSelectedDoorPoint] = useState<{roomId: string, doorIndex: number, pointType: 'start' | 'end'} | null>(null);
  const [selectedWindowPoint, setSelectedWindowPoint] = useState<{roomId: string, windowIndex: number, pointType: 'start' | 'end'} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<Point | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(0.08);
  const [editingAngles, setEditingAngles] = useState<{ [key: string]: string }>({});
  const [editingWallLengths, setEditingWallLengths] = useState<{ [key: string]: string }>({});
  const [editingCoordinates, setEditingCoordinates] = useState<{ [key: string]: { x: string, y: string } }>({});
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [addingDoor, setAddingDoor] = useState(false);
  const [doorStartPoint, setDoorStartPoint] = useState<{roomId: string, wallIndex: number, point: Point} | null>(null);
  const [addingWindow, setAddingWindow] = useState(false);
  const [windowStartPoint, setWindowStartPoint] = useState<{roomId: string, wallIndex: number, point: Point} | null>(null);
  const [windowHeight, setWindowHeight] = useState<number>(DEFAULT_WINDOW_HEIGHT);
  const [windowSillHeight, setWindowSillHeight] = useState<number>(DEFAULT_WINDOW_SILL_HEIGHT);
  const lastDraggedPointRef = useRef<{roomId: string, index: number} | null>(null);

  
  

  // Initialize main room
  useEffect(() => {
    if (rooms.length === 0) {
      const mainRoom: Room = {
        id: 'main',
        points: [],
        doors: [],
        windows: [],
        isComplete: false,
        isMain: true
      };
      setRooms([mainRoom]);
      setActiveRoomId('main');
    }
  }, []);

  useEffect(() => {
    if (!isDragging && lastDraggedPointRef.current) {
      const point = lastDraggedPointRef.current;
      lastDraggedPointRef.current = null;
      
      // Only call this after dragging has completely finished
      setTimeout(() => {
        updateAttachedPointsAfterDrag(point);
      }, 200);
    }
  }, [isDragging]);


  // Get active room
  const activeRoom = useMemo(() => {
    return rooms.find(room => room.id === activeRoomId);
  }, [rooms, activeRoomId]);

  // Screen to world coordinate conversion
  const screenToWorld = (screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    return {
      x: (screenX - pan.x) / scale,
      y: ((canvas.height - screenY) - pan.y) / scale
    };
  };

  // World to screen coordinate conversion
  const worldToScreen = (worldX: number, worldY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    return {
      x: worldX * scale + pan.x,
      y: canvas.height - (worldY * scale + pan.y)
    };
  };

  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return screenToWorld(screenX, screenY);
  };

  const findClosestPointOnLine = (mousePos: Point, p1: Point, p2: Point): Point | null => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return null;

    const t = Math.max(0, Math.min(1, (
      (mousePos.x - p1.x) * dx + (mousePos.y - p1.y) * dy
    ) / len2));

    return {
      x: p1.x + t * dx,
      y: p1.y + t * dy
    };
  };
  
  
  const findClosestLine = (mousePos: Point, roomToExclude?: string): { roomId: string, wallIndex: number, point: Point, t: number } | null => {
    let closestDist = Infinity;
    let result: { roomId: string, wallIndex: number, point: Point, t: number } | null = null;
  
    for (const room of rooms) {
      if (!room.isComplete || room.points.length < 2 || room.id === roomToExclude) continue;
  
      for (let i = 0; i < room.points.length; i++) {
        const p1 = room.points[i];
        const p2 = room.points[(i + 1) % room.points.length];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) continue;
  
        const t = Math.max(0, Math.min(1, (
          (mousePos.x - p1.x) * dx + (mousePos.y - p1.y) * dy
        ) / len2));
  
        const pointOnLine = {
          x: p1.x + t * dx,
          y: p1.y + t * dy
        };
  
        const dist = Math.sqrt(
          Math.pow(mousePos.x - pointOnLine.x, 2) + 
          Math.pow(mousePos.y - pointOnLine.y, 2)
        );
  
        if (dist < closestDist) {
          closestDist = dist;
          result = {
            roomId: room.id,
            wallIndex: i,
            point: pointOnLine,
            t // Include the parametric position
          };
        }
      }
    }
  
    if (closestDist < SNAP_DISTANCE / scale && result) {
      return result;
    }
  
    return null;
  };

  const mainRoom = useMemo(() => {
    return rooms.find(room => room.isMain);
  }, [rooms]);

  // const findNearestPoint = (mousePos: Point): {roomId: string, index: number} | null => {
  //   for (const room of rooms) {
  //     for (let i = 0; i < room.points.length; i++) {
  //       const point = room.points[i];
  //       const distance = Math.sqrt(
  //         Math.pow(mousePos.x - point.x, 2) + Math.pow(mousePos.y - point.y, 2)
  //       );
  //       if (distance < POINT_RADIUS * 2 / scale) {
  //         return { roomId: room.id, index: i };
  //       }
  //     }
  //   }
  //   return null;
  // };

  const findNearestPoint = (mousePos: Point, roomToExclude?: string): {roomId: string, index: number, point: Point} | null => {
    let closestDist = Infinity;
    let result: {roomId: string, index: number, point: Point} | null = null;
  
    for (const room of rooms) {
      if (room.id === roomToExclude) continue;
      
      for (let i = 0; i < room.points.length; i++) {
        const point = room.points[i];
        const distance = Math.sqrt(
          Math.pow(mousePos.x - point.x, 2) + Math.pow(mousePos.y - point.y, 2)
        );
        
        if (distance < closestDist) {
          closestDist = distance;
          result = { roomId: room.id, index: i, point };
        }
      }
    }
  
    if (closestDist < SNAP_DISTANCE / scale && result) {
      return result;
    }
    
    return null;
  };

  const findNearestDoorPoint = (mousePos: Point): {roomId: string, doorIndex: number, pointType: 'start' | 'end'} | null => {
    for (const room of rooms) {
      for (let i = 0; i < room.doors.length; i++) {
        const door = room.doors[i];
        
        const startDist = Math.sqrt(
          Math.pow(mousePos.x - door.startPoint.x, 2) + 
          Math.pow(mousePos.y - door.startPoint.y, 2)
        );
        
        if (startDist < DOOR_POINT_RADIUS * 2 / scale) {
          return { roomId: room.id, doorIndex: i, pointType: 'start' };
        }
        
        const endDist = Math.sqrt(
          Math.pow(mousePos.x - door.endPoint.x, 2) + 
          Math.pow(mousePos.y - door.endPoint.y, 2)
        );
        
        if (endDist < DOOR_POINT_RADIUS * 2 / scale) {
          return { roomId: room.id, doorIndex: i, pointType: 'end' };
        }
      }
    }
    
    return null;
  };

  const findNearestWindowPoint = (mousePos: Point): {roomId: string, windowIndex: number, pointType: 'start' | 'end'} | null => {
    for (const room of rooms) {
      for (let i = 0; i < room.windows.length; i++) {
        const window = room.windows[i];
        
        const startDist = Math.sqrt(
          Math.pow(mousePos.x - window.startPoint.x, 2) + 
          Math.pow(mousePos.y - window.startPoint.y, 2)
        );
        
        if (startDist < WINDOW_POINT_RADIUS * 2 / scale) {
          return { roomId: room.id, windowIndex: i, pointType: 'start' };
        }
        
        const endDist = Math.sqrt(
          Math.pow(mousePos.x - window.endPoint.x, 2) + 
          Math.pow(mousePos.y - window.endPoint.y, 2)
        );
        
        if (endDist < WINDOW_POINT_RADIUS * 2 / scale) {
          return { roomId: room.id, windowIndex: i, pointType: 'end' };
        }
      }
    }
    
    return null;
  };

  const startAddingDoor = () => {
    if (!activeRoom?.isComplete) {
      alert('Please complete the room design first');
      return;
    }
    
    setAddingDoor(true);
    setDoorStartPoint(null);
  };

  const startAddingWindow = () => {
    if (!activeRoom?.isComplete) {
      alert('Please complete the room design first');
      return;
    }
    
    setAddingWindow(true);
    setWindowStartPoint(null);
  };

  const addDoor = (roomId: string, wallIndex: number, startPoint: Point, endPoint: Point) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const p1 = room.points[wallIndex];
    const p2 = room.points[(wallIndex + 1) % room.points.length];
    
    const width = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    const startDist = Math.sqrt(
      Math.pow(startPoint.x - p1.x, 2) + 
      Math.pow(startPoint.y - p1.y, 2)
    );
    
    const newDoor: Door = {
      wallIndex,
      startPoint,
      endPoint,
      width,
      position: startDist
    };
    
    setRooms(rooms.map(r => 
      r.id === roomId 
        ? { ...r, doors: [...r.doors, newDoor] }
        : r
    ));
  };

  const addWindow = (roomId: string, wallIndex: number, startPoint: Point, endPoint: Point) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const p1 = room.points[wallIndex];
    const p2 = room.points[(wallIndex + 1) % room.points.length];
    
    const width = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    const startDist = Math.sqrt(
      Math.pow(startPoint.x - p1.x, 2) + 
      Math.pow(startPoint.y - p1.y, 2)
    );
    
    const newWindow: Window = {
      wallIndex,
      startPoint,
      endPoint,
      width,
      height: windowHeight,
      sillHeight: windowSillHeight,
      position: startDist
    };
    
    setRooms(rooms.map(r => 
      r.id === roomId 
        ? { ...r, windows: [...r.windows, newWindow] }
        : r
    ));
  };

  const removeDoor = (roomId: string, index: number) => {
    setRooms(rooms.map(r => 
      r.id === roomId 
        ? { ...r, doors: r.doors.filter((_, i) => i !== index) }
        : r
    ));
  };

  const removeWindow = (roomId: string, index: number) => {
    setRooms(rooms.map(r => 
      r.id === roomId 
        ? { ...r, windows: r.windows.filter((_, i) => i !== index) }
        : r
    ));
  };

  const updateDoorWidth = (roomId: string, doorIndex: number, newWidth: number) => {
    if (newWidth <= 0) return;
    
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;

      const newDoors = [...room.doors];
      const door = newDoors[doorIndex];
      const wallIndex = door.wallIndex;
      
      const p1 = room.points[wallIndex];
      const p2 = room.points[(wallIndex + 1) % room.points.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const wallLength = Math.sqrt(dx * dx + dy * dy);
      
      const dirX = dx / wallLength;
      const dirY = dy / wallLength;
      
      const startPoint = door.startPoint;
      
      const endPoint = {
        x: startPoint.x + newWidth * dirX,
        y: startPoint.y + newWidth * dirY
      };
      
      door.endPoint = endPoint;
      door.width = newWidth;
      
      return { ...room, doors: newDoors };
    }));
  };

  const updateDoorPosition = (roomId: string, doorIndex: number, newPosition: number) => {
    if (newPosition < 0) return;
    
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;

      const newDoors = [...room.doors];
      const door = newDoors[doorIndex];
      const wallIndex = door.wallIndex;
      
      const p1 = room.points[wallIndex];
      const p2 = room.points[(wallIndex + 1) % room.points.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const wallLength = Math.sqrt(dx * dx + dy * dy);
      
      if (newPosition + door.width > wallLength) {
        newPosition = wallLength - door.width;
      }
      
      const dirX = dx / wallLength;
      const dirY = dy / wallLength;
      
      const startPoint = {
        x: p1.x + newPosition * dirX,
        y: p1.y + newPosition * dirY
      };
      
      const endPoint = {
        x: startPoint.x + door.width * dirX,
        y: startPoint.y + door.width * dirY
      };
      
      door.startPoint = startPoint;
      door.endPoint = endPoint;
      door.position = newPosition;
      
      return { ...room, doors: newDoors };
    }));
  };

  const updateWindowWidth = (roomId: string, windowIndex: number, newWidth: number) => {
    if (newWidth <= 0) return;
    
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;

      const newWindows = [...room.windows];
      const window = newWindows[windowIndex];
      const wallIndex = window.wallIndex;
      
      const p1 = room.points[wallIndex];
      const p2 = room.points[(wallIndex + 1) % room.points.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const wallLength = Math.sqrt(dx * dx + dy * dy);
      
      const dirX = dx / wallLength;
      const dirY = dy / wallLength;
      
      const startPoint = window.startPoint;
      
      const endPoint = {
        x: startPoint.x + newWidth * dirX,
        y: startPoint.y + newWidth * dirY
      };
      
      window.endPoint = endPoint;
      window.width = newWidth;
      
      return { ...room, windows: newWindows };
    }));
  };

  const updateWindowPosition = (roomId: string, windowIndex: number, newPosition: number) => {
    if (newPosition < 0) return;
    
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;

      const newWindows = [...room.windows];
      const window = newWindows[windowIndex];
      const wallIndex = window.wallIndex;
      
      const p1 = room.points[wallIndex];
      const p2 = room.points[(wallIndex + 1) % room.points.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const wallLength = Math.sqrt(dx * dx + dy * dy);
      
      if (newPosition + window.width > wallLength) {
        newPosition = wallLength - window.width;
      }
      
      const dirX = dx / wallLength;
      const dirY = dy / wallLength;
      
      const startPoint = {
        x: p1.x + newPosition * dirX,
        y: p1.y + newPosition * dirY
      };
      
      const endPoint = {
        x: startPoint.x + window.width * dirX,
        y: startPoint.y + window.width * dirY
      };
      
      window.startPoint = startPoint;
      window.endPoint = endPoint;
      window.position = newPosition;
      
      return { ...room, windows: newWindows };
    }));
  };

  const updateWindowHeight = (roomId: string, windowIndex: number, newHeight: number) => {
    if (newHeight <= 0) return;
    
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;

      const newWindows = [...room.windows];
      const window = newWindows[windowIndex];
      window.height = newHeight;
      
      return { ...room, windows: newWindows };
    }));
  };

  const updateWindowSillHeight = (roomId: string, windowIndex: number, newSillHeight: number) => {
    if (newSillHeight < 0) return;
    
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;

      const newWindows = [...room.windows];
      const window = newWindows[windowIndex];
      window.sillHeight = newSillHeight;
      
      return { ...room, windows: newWindows };
    }));
  };

  const calculateWallData = (room: Room): WallData[] => {
    if (room.points.length < 2) return [];
    
    return room.points.map((point, index) => {
      const nextPoint = room.points[(index + 1) % room.points.length];
      const prevPoint = room.points[(index - 1 + room.points.length) % room.points.length];
      
      const dx = nextPoint.x - point.x;
      const dy = nextPoint.y - point.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (room.points.length > 2) {
        const vector1 = {
          x: prevPoint.x - point.x,
          y: prevPoint.y - point.y
        };
        const vector2 = {
          x: nextPoint.x - point.x,
          y: nextPoint.y - point.y
        };
        
        let angle = Math.atan2(
          vector1.x * vector2.y - vector1.y * vector2.x,
          vector1.x * vector2.x + vector1.y * vector2.y
        ) * (180 / Math.PI);
        
        angle = -angle;
        if (angle < 0) angle += 360;

        return { length, angle };
      }
      
      return { length, angle: 0 };
    });
  };

  const updatePoint = (roomId: string, index: number, newX: number, newY: number) => {
    // Get the room to be updated
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Store the old points for door/window updates
    const oldPoints = [...room.points];
    
    // Create a copy of all rooms
    const newRooms = rooms.map(r => {
      if (r.id !== roomId) return r;
      
      // Create new points array with updated position
      const newPoints = [...r.points];
      
      // If this point is attached to a wall, handle it specially
      if (newPoints[index].attachedTo) {
        // Get the wall this point is attached to
        const attachedTo = newPoints[index].attachedTo;
        const parentRoom = rooms.find(pr => pr.id === attachedTo.roomId);
        
        if (parentRoom && parentRoom.points.length > attachedTo.wallIndex) {
          const wallStart = parentRoom.points[attachedTo.wallIndex];
          const wallEnd = parentRoom.points[(attachedTo.wallIndex + 1) % parentRoom.points.length];
          
          // Project the new position onto the wall
          const wallVectorX = wallEnd.x - wallStart.x;
          const wallVectorY = wallEnd.y - wallStart.y;
          const wallLength = Math.sqrt(wallVectorX * wallVectorX + wallVectorY * wallVectorY);
          
          if (wallLength === 0) return r;
          
          // Calculate projection
          const dotProduct = ((newX - wallStart.x) * wallVectorX + (newY - wallStart.y) * wallVectorY);
          
          // Clamp the projection to be within the wall segment
          const t = Math.max(0, Math.min(1, dotProduct / (wallLength * wallLength)));
          
          // Get the projected position
          const projectedX = wallStart.x + t * wallVectorX;
          const projectedY = wallStart.y + t * wallVectorY;
          
          // Update ONLY this point's position and parametric value
          newPoints[index] = {
            ...newPoints[index],
            x: projectedX,
            y: projectedY,
            attachedTo: {
              roomId: attachedTo.roomId,
              wallIndex: attachedTo.wallIndex,
              t: t  // Update the t parameter based on the projection
            }
          };
        }
        return { ...r, points: newPoints };
      }
      
      // Handle regular point movement
      if (index === 0) {
        const dx = newX - r.points[0].x;
        const dy = newY - r.points[0].y;
        newPoints.forEach((point, i) => {
          point.x += dx;
          point.y += dy;
        });
      } else {
        // Only update this specific point
        newPoints[index] = { 
          ...newPoints[index], // Preserve attachedTo and other properties
          x: newX, 
          y: newY 
        };
      }
      
      return { 
        ...r, 
        points: newPoints,
      };
    });
    
    // Get the updated room with new points
    const updatedRoom = newRooms.find(r => r.id === roomId);
    if (!updatedRoom) return;
    
    // For completed rooms with doors/windows, update them
    if (updatedRoom.isComplete && (updatedRoom.doors.length > 0 || updatedRoom.windows.length > 0)) {
      // Update doors within this room
      const updatedDoors = updatedRoom.doors.map(door => {
        const wallIndex = door.wallIndex;
        
        // Skip doors on non-existent walls
        if (wallIndex >= oldPoints.length || wallIndex >= updatedRoom.points.length) {
          return door;
        }
        
        // Get new wall vertices
        const newStartVertex = updatedRoom.points[wallIndex];
        const newEndVertex = updatedRoom.points[(wallIndex + 1) % updatedRoom.points.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Skip if wall has zero length
        if (newWallLength === 0) return door;
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep door position (distance from wall start) constant
        const position = door.position;
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * door.width,
          y: newStartPoint.y + newDirY * door.width
        };
        
        // Check if the door now extends beyond the wall
        if (position + door.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...door,
            position: Math.max(0, newWallLength - door.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - door.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - door.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...door,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update windows within this room
      const updatedWindows = updatedRoom.windows.map(window => {
        const wallIndex = window.wallIndex;
        
        // Skip windows on non-existent walls
        if (wallIndex >= oldPoints.length || wallIndex >= updatedRoom.points.length) {
          return window;
        }
        
        // Get new wall vertices
        const newStartVertex = updatedRoom.points[wallIndex];
        const newEndVertex = updatedRoom.points[(wallIndex + 1) % updatedRoom.points.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Skip if wall has zero length
        if (newWallLength === 0) return window;
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep window position (distance from wall start) constant
        const position = window.position;
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * window.width,
          y: newStartPoint.y + newDirY * window.width
        };
        
        // Check if the window now extends beyond the wall
        if (position + window.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...window,
            position: Math.max(0, newWallLength - window.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - window.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - window.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...window,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update the room with new doors and windows
      const finalRooms = newRooms.map(r => {
        if (r.id !== roomId) return r;
        return {
          ...r,
          doors: updatedDoors,
          windows: updatedWindows
        };
      });
      
      // Set the final state with all updates in one go
      setRooms(finalRooms);
    } else {
      // If no doors/windows or room not complete, just update the points
      setRooms(newRooms);
    }
    
    // After updating any point, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
  };


  const updateWallLength = (roomId: string, index: number, newLength: number) => {
    // Get the room to be updated
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Store the old points for door/window updates
    const oldPoints = [...room.points];
    
    // Create a copy of all rooms
    const newRooms = rooms.map(r => {
      if (r.id !== roomId) return r;
      
      const newPoints = [...r.points];
      const currentPoint = r.points[index];
      const nextPoint = r.points[(index + 1) % r.points.length];
      
      // Skip if the next point is attached to another wall
      if (nextPoint.attachedTo) {
        return r;
      }
      
      const angle = Math.atan2(
        nextPoint.y - currentPoint.y,
        nextPoint.x - currentPoint.x
      );
      
      newPoints[(index + 1) % r.points.length] = {
        ...newPoints[(index + 1) % r.points.length], // Preserve attachedTo and other properties
        x: currentPoint.x + Math.cos(angle) * newLength,
        y: currentPoint.y + Math.sin(angle) * newLength
      };
      
      return { 
        ...r, 
        points: newPoints,
      };
    });
    
    // Get the updated room with new points
    const updatedRoom = newRooms.find(r => r.id === roomId);
    if (!updatedRoom) return;
    
    // For completed rooms with doors/windows, update them
    if (updatedRoom.isComplete && (updatedRoom.doors.length > 0 || updatedRoom.windows.length > 0)) {
      // Update doors within this room
      const updatedDoors = updatedRoom.doors.map(door => {
        const wallIndex = door.wallIndex;
        
        // Skip doors that aren't on the affected wall
        if (wallIndex !== index) return door;
        
        // Get new wall vertices
        const newStartVertex = updatedRoom.points[wallIndex];
        const newEndVertex = updatedRoom.points[(wallIndex + 1) % updatedRoom.points.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Skip if wall has zero length
        if (newWallLength === 0) return door;
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep door position (distance from wall start) constant
        const position = door.position;
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * door.width,
          y: newStartPoint.y + newDirY * door.width
        };
        
        // Check if the door now extends beyond the wall
        if (position + door.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...door,
            position: Math.max(0, newWallLength - door.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - door.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - door.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...door,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update windows within this room
      const updatedWindows = updatedRoom.windows.map(window => {
        const wallIndex = window.wallIndex;
        
        // Skip windows that aren't on the affected wall
        if (wallIndex !== index) return window;
        
        // Get new wall vertices
        const newStartVertex = updatedRoom.points[wallIndex];
        const newEndVertex = updatedRoom.points[(wallIndex + 1) % updatedRoom.points.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Skip if wall has zero length
        if (newWallLength === 0) return window;
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep window position (distance from wall start) constant
        const position = window.position;
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * window.width,
          y: newStartPoint.y + newDirY * window.width
        };
        
        // Check if the window now extends beyond the wall
        if (position + window.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...window,
            position: Math.max(0, newWallLength - window.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - window.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - window.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...window,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update the room with new doors and windows
      const finalRooms = newRooms.map(r => {
        if (r.id !== roomId) return r;
        return {
          ...r,
          doors: updatedDoors,
          windows: updatedWindows
        };
      });
      
      // Set the final state with all updates in one go
      setRooms(finalRooms);
    } else {
      // If no doors/windows or room not complete, just update the points
      setRooms(newRooms);
    }
    
    // After updating wall length, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
  };

  const updateAngle = (roomId: string, index: number, newAngle: number) => {
    if (isNaN(newAngle)) return;
    
    // Get the room to be updated
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Store the old points for door/window updates
    const oldPoints = [...room.points];
    
    // Create a copy of all rooms
    const newRooms = rooms.map(r => {
      if (r.id !== roomId) return r;
      
      const newPoints = [...r.points];
      const currentPoint = r.points[index];
      const prevPoint = r.points[(index - 1 + r.points.length) % r.points.length];
      const nextPoint = r.points[(index + 1) % r.points.length];
      
      // Skip if the next point is attached to another wall
      if (nextPoint.attachedTo) {
        return r;
      }
      
      const angle1 = Math.atan2(
        prevPoint.y - currentPoint.y,
        prevPoint.x - currentPoint.x
      );
      
      const angleRad = (-newAngle * Math.PI) / 180;
      const newAngleRad = angle1 + angleRad;
      
      const currentWallLength = Math.sqrt(
        Math.pow(nextPoint.x - currentPoint.x, 2) + 
        Math.pow(nextPoint.y - currentPoint.y, 2)
      );
      
      newPoints[(index + 1) % r.points.length] = {
        ...newPoints[(index + 1) % r.points.length], // Preserve attachedTo and other properties
        x: currentPoint.x + currentWallLength * Math.cos(newAngleRad),
        y: currentPoint.y + currentWallLength * Math.sin(newAngleRad)
      };
      
      return { 
        ...r, 
        points: newPoints,
      };
    });
    
    // Get the affected walls
    const wallIndex1 = (index - 1 + room.points.length) % room.points.length;
    const wallIndex2 = index;
    
    // Get the updated room with new points
    const updatedRoom = newRooms.find(r => r.id === roomId);
    if (!updatedRoom) return;
    
    // For completed rooms with doors/windows, update them
    if (updatedRoom.isComplete && (updatedRoom.doors.length > 0 || updatedRoom.windows.length > 0)) {
      // Update doors within this room
      const updatedDoors = updatedRoom.doors.map(door => {
        const wallIndex = door.wallIndex;
        
        // Skip doors that aren't on the affected walls
        if (wallIndex !== wallIndex1 && wallIndex !== wallIndex2) return door;
        
        // Get new wall vertices
        const newStartVertex = updatedRoom.points[wallIndex];
        const newEndVertex = updatedRoom.points[(wallIndex + 1) % updatedRoom.points.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Skip if wall has zero length
        if (newWallLength === 0) return door;
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep door position (distance from wall start) constant
        const position = door.position;
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * door.width,
          y: newStartPoint.y + newDirY * door.width
        };
        
        // Check if the door now extends beyond the wall
        if (position + door.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...door,
            position: Math.max(0, newWallLength - door.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - door.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - door.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...door,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update windows within this room
      const updatedWindows = updatedRoom.windows.map(window => {
        const wallIndex = window.wallIndex;
        
        // Skip windows that aren't on the affected walls
        if (wallIndex !== wallIndex1 && wallIndex !== wallIndex2) return window;
        
        // Get new wall vertices
        const newStartVertex = updatedRoom.points[wallIndex];
        const newEndVertex = updatedRoom.points[(wallIndex + 1) % updatedRoom.points.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Skip if wall has zero length
        if (newWallLength === 0) return window;
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep window position (distance from wall start) constant
        const position = window.position;
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * window.width,
          y: newStartPoint.y + newDirY * window.width
        };
        
        // Check if the window now extends beyond the wall
        if (position + window.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...window,
            position: Math.max(0, newWallLength - window.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - window.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - window.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...window,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update the room with new doors and windows
      const finalRooms = newRooms.map(r => {
        if (r.id !== roomId) return r;
        return {
          ...r,
          doors: updatedDoors,
          windows: updatedWindows
        };
      });
      
      // Set the final state with all updates in one go
      setRooms(finalRooms);
    } else {
      // If no doors/windows or room not complete, just update the points
      setRooms(newRooms);
    }
    
    // After updating angle, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
  };

  const updateDoorsAndWindows = (roomId: string, newPoints: Point[], oldPoints: Point[]) => {
    setRooms(rooms.map(room => {
      if (room.id !== roomId) return room;
      
      // Update doors - maintain absolute distances from wall start
      const updatedDoors = room.doors.map(door => {
        const wallIndex = door.wallIndex;
        
        // Skip doors that aren't on walls that exist
        if (wallIndex >= oldPoints.length || wallIndex >= newPoints.length) {
          return door;
        }
        
        const oldStartVertex = oldPoints[wallIndex];
        const oldEndVertex = oldPoints[(wallIndex + 1) % oldPoints.length];
        
        // Get new wall vertices
        const newStartVertex = newPoints[wallIndex];
        const newEndVertex = newPoints[(wallIndex + 1) % newPoints.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Calculate normalized direction vector for the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep door position (distance from wall start) constant
        const position = door.position; // This is already the absolute distance
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * door.width,
          y: newStartPoint.y + newDirY * door.width
        };
        
        // Check if the door now extends beyond the wall
        if (position + door.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...door,
            position: Math.max(0, newWallLength - door.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - door.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - door.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...door,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      // Update windows - using the same approach
      const updatedWindows = room.windows.map(window => {
        const wallIndex = window.wallIndex;
        
        // Skip windows that aren't on walls that exist
        if (wallIndex >= oldPoints.length || wallIndex >= newPoints.length) {
          return window;
        }
        
        const oldStartVertex = oldPoints[wallIndex];
        const oldEndVertex = oldPoints[(wallIndex + 1) % oldPoints.length];
        
        // Get new wall vertices
        const newStartVertex = newPoints[wallIndex];
        const newEndVertex = newPoints[(wallIndex + 1) % newPoints.length];
        
        // Calculate new wall vector
        const newWallDx = newEndVertex.x - newStartVertex.x;
        const newWallDy = newEndVertex.y - newStartVertex.y;
        const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
        
        // Get the normalized direction vector of the new wall
        const newDirX = newWallDx / newWallLength;
        const newDirY = newWallDy / newWallLength;
        
        // Keep window position (distance from wall start) constant
        const position = window.position; // This is already the absolute distance
        
        // Calculate new start point - absolute distance from wall start
        const newStartPoint = {
          x: newStartVertex.x + newDirX * position,
          y: newStartVertex.y + newDirY * position
        };
        
        // Calculate new end point - keeping the absolute width
        const newEndPoint = {
          x: newStartPoint.x + newDirX * window.width,
          y: newStartPoint.y + newDirY * window.width
        };
        
        // Check if the window now extends beyond the wall
        if (position + window.width > newWallLength) {
          // Adjust to fit within the wall
          return {
            ...window,
            position: Math.max(0, newWallLength - window.width),
            startPoint: {
              x: newStartVertex.x + newDirX * Math.max(0, newWallLength - window.width),
              y: newStartVertex.y + newDirY * Math.max(0, newWallLength - window.width)
            },
            endPoint: {
              x: newEndVertex.x,
              y: newEndVertex.y
            }
          };
        }
        
        return {
          ...window,
          startPoint: newStartPoint,
          endPoint: newEndPoint
        };
      });
      
      return {
        ...room,
        doors: updatedDoors,
        windows: updatedWindows
      };
    }));
  };

  const exportRoomData = () => {
    // Create the export data structure directly from the existing room data
    const exportData = rooms.map(room => {
      // Get wall data that's already calculated for the UI
      const wallData = calculateWallData(room);
      
      return {
        id: room.id,
        isMain: room.isMain,
        isComplete: room.isComplete,
        // Group x and y coordinates into separate arrays
        points: {
          x: room.points.map(point => Math.round(point.x)),
          y: room.points.map(point => Math.round(point.y))
        },
        // Group wall data with arrays for each property
        walls: room.isComplete ? {
          count: room.points.length,
          from: room.points.map((_, index) => index),
          to: room.points.map((_, index) => (index + 1) % room.points.length),
          // lengths: room.points.map((_, index) => Math.round(wallData[index]?.length || 0)),
          // angles: room.points.map((_, index) => wallData[index]?.angle ? Math.round(wallData[index].angle * 10) / 10 : 0)
        } : {
          count: 0,
          from: [],
          to: [],
          // lengths: [],
          // angles: []
        },
        // Group door data with arrays for each property
        doors: {
          count: room.doors.length,
          wallIndices: room.doors.map(door => door.wallIndex),
          widths: room.doors.map(door => Math.round(door.width)),
          positions: room.doors.map(door => Math.round(door.position))
        },
        // Group window data with arrays for each property
        windows: {
          count: room.windows.length,
          wallIndices: room.windows.map(window => window.wallIndex),
          widths: room.windows.map(window => Math.round(window.width)),
          heights: room.windows.map(window => Math.round(window.height)),
          sillHeights: room.windows.map(window => Math.round(window.sillHeight)),
          positions: room.windows.map(window => Math.round(window.position))
        }
      };
    });

    // Additional metadata
    const exportObject = {
      projectData: {
        rooms: exportData,
        // canvasDimensions: {
        //   width: CANVAS_WIDTH_MM,
        //   height: CANVAS_HEIGHT_MM
        // },
        exportDate: new Date().toISOString()
      }
    };

    // Convert to JSON string with 2-space indentation
    const jsonData = JSON.stringify(exportObject, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(jsonData)
      .then(() => {
        alert('Room data copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy data: ', err);
        alert('Failed to copy data to clipboard. See console for details.');
      });

    return jsonData;
  };


  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldBefore = screenToWorld(mouseX, mouseY);

    const newScale = e.deltaY < 0 
      ? Math.min(scale * ZOOM_FACTOR, MAX_SCALE)
      : Math.max(scale / ZOOM_FACTOR, MIN_SCALE);

    if (newScale === scale) return;

    setScale(newScale);

    const worldAfter = {
      x: (mouseX - pan.x) / newScale,
      y: ((canvas.height - mouseY) - pan.y) / newScale
    };

    const newPan = {
      x: pan.x + (worldAfter.x - worldBefore.x) * newScale,
      y: pan.y + (worldAfter.y - worldBefore.y) * newScale
    };
    
    setPan(newPan);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeRoom) return;

    const mousePos = getMousePosition(e);
    
    if (addingDoor) {
      const closestLine = findClosestLine(mousePos);
      if (closestLine) {
        if (!doorStartPoint) {
          setDoorStartPoint({
            roomId: closestLine.roomId,
            wallIndex: closestLine.wallIndex,
            point: closestLine.point
          });
        } else if (doorStartPoint.roomId === closestLine.roomId && 
                  doorStartPoint.wallIndex === closestLine.wallIndex) {
          addDoor(doorStartPoint.roomId, doorStartPoint.wallIndex, doorStartPoint.point, closestLine.point);
          setAddingDoor(false);
          setDoorStartPoint(null);
        }
      }
      return;
    }

    if (addingWindow) {
      const closestLine = findClosestLine(mousePos);
      if (closestLine) {
        if (!windowStartPoint) {
          setWindowStartPoint({
            roomId: closestLine.roomId,
            wallIndex: closestLine.wallIndex,
            point: closestLine.point
          });
        } else if (windowStartPoint.roomId === closestLine.roomId && 
                  windowStartPoint.wallIndex === closestLine.wallIndex) {
          addWindow(windowStartPoint.roomId, windowStartPoint.wallIndex, windowStartPoint.point, closestLine.point);
          setAddingWindow(false);
          setWindowStartPoint(null);
        }
      }
      return;
    }

    const windowPoint = findNearestWindowPoint(mousePos);
    if (windowPoint) {
      setSelectedWindowPoint(windowPoint);
      setIsDragging(true);
      return;
    }

    const doorPoint = findNearestDoorPoint(mousePos);
    if (doorPoint) {
      setSelectedDoorPoint(doorPoint);
      setIsDragging(true);
      return;
    }

    const pointInfo = findNearestPoint(mousePos);
    if (pointInfo) {
      setSelectedPoint(pointInfo);
      setIsDragging(true);
    } else {
      setIsPanning(true);
      setLastPanPosition(getScreenMousePosition(e));
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const mousePos = getMousePosition(e);
      
      // Store the selected point for use when drag ends
      if (selectedPoint) {
        lastDraggedPointRef.current = { ...selectedPoint };
        
        // Get the room with the selected point
        const room = rooms.find(r => r.id === selectedPoint.roomId);
        if (!room) return;
        
        const pointIndex = selectedPoint.index;
        const point = room.points[pointIndex];
        
        // Check if this point is attached to a wall (any point, not just index > 0)
        if (point.attachedTo) {
          // Find the parent room and wall this point is attached to
          const parentRoom = rooms.find(r => r.id === point.attachedTo.roomId);
          if (!parentRoom) return;
          
          const wallIndex = point.attachedTo.wallIndex;
          const wallStart = parentRoom.points[wallIndex];
          const wallEnd = parentRoom.points[(wallIndex + 1) % parentRoom.points.length];
          
          // Project the mouse position onto the wall
          const wallVectorX = wallEnd.x - wallStart.x;
          const wallVectorY = wallEnd.y - wallStart.y;
          const wallLength = Math.sqrt(wallVectorX * wallVectorX + wallVectorY * wallVectorY);
          
          if (wallLength === 0) return;
          
          // Calculate dot product to find the projection
          const dotProduct = ((mousePos.x - wallStart.x) * wallVectorX + (mousePos.y - wallStart.y) * wallVectorY);
          
          // Clamp the projection to be within the wall segment
          const t = Math.max(0, Math.min(1, dotProduct / (wallLength * wallLength)));
          
          // Create the updated point position on the wall
          const updatedPoint = {
            x: wallStart.x + t * wallVectorX,
            y: wallStart.y + t * wallVectorY
          };
          
          // Update the rooms state with the new projected position - ONLY modify the selected point
          setRooms(prevRooms => {
            return prevRooms.map(r => {
              if (r.id !== selectedPoint.roomId) return r;
              
              const newPoints = [...r.points];
              newPoints[pointIndex] = {
                ...newPoints[pointIndex],
                x: updatedPoint.x,
                y: updatedPoint.y,
                attachedTo: {
                  roomId: point.attachedTo.roomId,
                  wallIndex: point.attachedTo.wallIndex,
                  t: t  // Update the t parameter to allow movement along the wall
                }
              };
              
              return { ...r, points: newPoints };
            });
          });
          
          return; // Return early to prevent other point handling logic from running
        }
        
        // Handle origin point movement (moves all points)
        if (pointIndex === 0) {
          // Check if the first point is attached to a wall
          if (point.attachedTo) {
            // Already handled above, just return
            return;
          }
          
          // If not attached, then move all points as before
          setRooms(rooms.map(r => {
            if (r.id !== selectedPoint.roomId) return r;
            
            const dx = mousePos.x - r.points[0].x;
            const dy = mousePos.y - r.points[0].y;
            
            const newPoints = r.points.map(p => ({
              ...p,
              x: p.x + dx,
              y: p.y + dy
            }));
            
            return { ...r, points: newPoints };
          }));
        } else {
          // Regular point movement (non-attached, non-origin) - ONLY move this specific point
          setRooms(rooms.map(r => {
            if (r.id !== selectedPoint.roomId) return r;
            
            const newPoints = [...r.points];
            newPoints[pointIndex] = { ...newPoints[pointIndex], x: mousePos.x, y: mousePos.y };
            
            return { ...r, points: newPoints };
          }));
        }
      } else if (selectedWindowPoint) {
        // Window point movement logic
        const room = rooms.find(r => r.id === selectedWindowPoint.roomId);
        if (!room) return;
    
        const p1 = room.points[room.windows[selectedWindowPoint.windowIndex].wallIndex];
        const p2 = room.points[(room.windows[selectedWindowPoint.windowIndex].wallIndex + 1) % room.points.length];
        
        const closestPoint = findClosestPointOnLine(mousePos, p1, p2);
        if (!closestPoint) return;
    
        setRooms(rooms.map(r => {
          if (r.id !== selectedWindowPoint.roomId) return r;
    
          const newWindows = [...r.windows];
          const window = newWindows[selectedWindowPoint.windowIndex];
          
          if (selectedWindowPoint.pointType === 'start') {
            window.startPoint = closestPoint;
            window.position = Math.sqrt(
              Math.pow(closestPoint.x - p1.x, 2) + 
              Math.pow(closestPoint.y - p1.y, 2)
            );
            window.width = Math.sqrt(
              Math.pow(window.endPoint.x - closestPoint.x, 2) + 
              Math.pow(window.endPoint.y - closestPoint.y, 2)
            );
          } else {
            window.endPoint = closestPoint;
            window.width = Math.sqrt(
              Math.pow(closestPoint.x - window.startPoint.x, 2) + 
              Math.pow(closestPoint.y - window.startPoint.y, 2)
            );
          }
    
          return { ...r, windows: newWindows };
        }));
      } else if (selectedDoorPoint) {
        // Door point movement logic
        const room = rooms.find(r => r.id === selectedDoorPoint.roomId);
        if (!room) return;
    
        const p1 = room.points[room.doors[selectedDoorPoint.doorIndex].wallIndex];
        const p2 = room.points[(room.doors[selectedDoorPoint.doorIndex].wallIndex + 1) % room.points.length];
        
        const closestPoint = findClosestPointOnLine(mousePos, p1, p2);
        if (!closestPoint) return;
    
        setRooms(rooms.map(r => {
          if (r.id !== selectedDoorPoint.roomId) return r;
    
          const newDoors = [...r.doors];
          const door = newDoors[selectedDoorPoint.doorIndex];
          
          if (selectedDoorPoint.pointType === 'start') {
            door.startPoint = closestPoint;
            door.position = Math.sqrt(
              Math.pow(closestPoint.x - p1.x, 2) + 
              Math.pow(closestPoint.y - p1.y, 2)
            );
            door.width = Math.sqrt(
              Math.pow(door.endPoint.x - closestPoint.x, 2) + 
              Math.pow(door.endPoint.y - closestPoint.y, 2)
            );
          } else {
            door.endPoint = closestPoint;
            door.width = Math.sqrt(
              Math.pow(closestPoint.x - door.startPoint.x, 2) + 
              Math.pow(door.startPoint.y - closestPoint.y, 2)
            );
          }
    
          return { ...r, doors: newDoors };
        }));
      }
    } else if (isPanning && lastPanPosition) {
      // Panning logic
      const currentPos = getScreenMousePosition(e);
      const dx = currentPos.x - lastPanPosition.x;
      const dy = currentPos.y - lastPanPosition.y;
      
      setPan(prevPan => ({
        x: prevPan.x + dx,
        y: prevPan.y - dy
      }));
      
      setLastPanPosition(currentPos);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setSelectedPoint(null);
    setSelectedDoorPoint(null);
    setSelectedWindowPoint(null);
    setIsPanning(false);
    setLastPanPosition(null);
  };

 

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
  if (!activeRoom || activeRoom.isComplete || isDragging || isPanning || addingDoor || addingWindow) return;

  const canvas = canvasRef.current;
  if (!canvas) return;

  let mousePos = getMousePosition(e);

  // For secondary rooms, implement snapping to main room points or lines
  if (!activeRoom.isMain) {
    // Check if we should snap to an existing vertex first
    const nearestPoint = findNearestPoint(mousePos, activeRoom.id);
    if (nearestPoint) {
      // Snap to the nearest point
      mousePos = { 
        x: nearestPoint.point.x, 
        y: nearestPoint.point.y,
        roomId: nearestPoint.roomId // maintain reference to the original room
      };
    } else {
      // If no point to snap to, try to snap to a line
      const closestLine = findClosestLine(mousePos, activeRoom.id);
      if (closestLine) {
        // Snap to the closest point on the line
        mousePos = {
          x: closestLine.point.x,
          y: closestLine.point.y,
          attachedTo: {
            roomId: closestLine.roomId,
            wallIndex: closestLine.wallIndex,
            t: closestLine.t // Parametric position on the wall (0-1)
          }
        };
      }
    }
  }

  if (activeRoom.points.length === 0) {
    if (activeRoom.isMain) {
      setRooms(rooms.map(room => 
        room.id === activeRoom.id 
          ? { ...room, points: [{ x: 0, y: 0 }] }
          : room
      ));
      
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      setPan({ 
        x: screenX, 
        y: canvas.height - screenY
      });
    } else {
      const wallPoint = findClosestLine(mousePos);
      if (!wallPoint) {
        alert('Secondary room must start from an existing wall');
        return;
      }
      
      setRooms(rooms.map(room => 
        room.id === activeRoom.id 
          ? { ...room, points: [mousePos] }
          : room
      ));
    }
    return;
  }

  if (activeRoom.points.length > 2) {
    const firstPoint = activeRoom.points[0];
    const distance = Math.sqrt(
      Math.pow(mousePos.x - firstPoint.x, 2) + Math.pow(mousePos.y - firstPoint.y, 2)
    );

    console.log("Trying to complete room", {
      distance,
      threshold: SNAP_DISTANCE / scale,
      firstPoint,
      mousePos
    });

    if (distance < SNAP_DISTANCE / scale) {
      console.log("Closing room - conditions met");
      
      // Use a function to update room state directly to avoid race conditions
      const completeRoom = () => {
        setRooms(prevRooms => {
          const newRooms = prevRooms.map(room => 
            room.id === activeRoom.id 
              ? { ...room, isComplete: true }
              : room
          );
          console.log("Room marked as complete", newRooms);
          return newRooms;
        });
      };
      
      completeRoom();
      setIsAddingSecondaryRoom(false);
      
      // Don't call updateAttachedPoints immediately after completing the room
      // Let the room completion take effect first
      return;
    }
  }

  // If we're here, we're adding a new point to the room
  console.log("Adding new point to room", mousePos);
  setRooms(rooms.map(room => 
    room.id === activeRoom.id 
      ? { ...room, points: [...room.points, mousePos] }
      : room
  ));
};

const updateAttachedPoints = () => {
  // Skip this function if we're currently dragging a point
  if (isDragging) return;
  
  // Create a deep copy of rooms to avoid direct mutations
  const updatedRooms = JSON.parse(JSON.stringify(rooms));
  
  // First identify all rooms with attached points
  for (let i = 0; i < updatedRooms.length; i++) {
    const room = updatedRooms[i];
    
    for (let j = 0; j < room.points.length; j++) {
      const point = room.points[j];
      
      if (point.attachedTo) {
        // Find the parent room that this point is attached to
        const parentRoom = updatedRooms.find(r => r.id === point.attachedTo.roomId);
        
        if (parentRoom && parentRoom.points.length > point.attachedTo.wallIndex) {
          // Get the wall points from the parent room
          const wallStartIndex = point.attachedTo.wallIndex;
          const wallEndIndex = (wallStartIndex + 1) % parentRoom.points.length;
          
          const wallStart = parentRoom.points[wallStartIndex];
          const wallEnd = parentRoom.points[wallEndIndex];
          
          // Calculate the new position based on the parametric t value
          // Use the existing t value - DON'T RESET IT
          const t = point.attachedTo.t;
          const newX = wallStart.x + t * (wallEnd.x - wallStart.x);
          const newY = wallStart.y + t * (wallEnd.y - wallStart.y);
          
          // Update the point's position
          point.x = newX;
          point.y = newY;
        }
      }
    }
  }
  
  // Update state with the modified rooms
  setRooms(updatedRooms);
};

const updateAttachedPointsAfterDrag = (draggingPoint) => {
  if (!draggingPoint) return;
  
  // Create a new copy of all rooms
  const updatedRooms = JSON.parse(JSON.stringify(rooms));
  let needsUpdate = false;
  
  // Check each room for points that are attached to walls
  for (let i = 0; i < updatedRooms.length; i++) {
    const room = updatedRooms[i];
    
    for (let j = 0; j < room.points.length; j++) {
      const point = room.points[j];
      
      // Skip the point that was just dragged - it already has its updated t value
      if (room.id === draggingPoint.roomId && j === draggingPoint.index) {
        continue;
      }
      
      if (point.attachedTo) {
        // Find the wall this point is attached to
        const parentRoom = updatedRooms.find(r => r.id === point.attachedTo.roomId);
        
        if (parentRoom && parentRoom.points.length > point.attachedTo.wallIndex) {
          const wallStart = parentRoom.points[point.attachedTo.wallIndex];
          const wallEnd = parentRoom.points[(point.attachedTo.wallIndex + 1) % parentRoom.points.length];
          
          // Calculate the new position based on the parametric t value
          // Use the existing t value - DON'T RESET IT
          const t = point.attachedTo.t;
          const newX = wallStart.x + t * (wallEnd.x - wallStart.x);
          const newY = wallStart.y + t * (wallEnd.y - wallStart.y);
          
          // Only update if position has changed
          if (point.x !== newX || point.y !== newY) {
            point.x = newX;
            point.y = newY;
            needsUpdate = true;
          }
        }
      }
    }
  }
  
  // Only update state if something changed
  if (needsUpdate) {
    setRooms(updatedRooms);
  }
};


  const startAddingSecondaryRoom = () => {
    if (!activeRoom?.isComplete) {
      alert('Please complete the main room first');
      return;
    }
    
    const newRoomId = `room-${rooms.length}`;
    const newRoom: Room = {
      id: newRoomId,
      points: [],
      doors: [],
      windows: [],
      isComplete: false,
      isMain: false
    };
    
    setRooms([...rooms, newRoom]);
    setActiveRoomId(newRoomId);
    setIsAddingSecondaryRoom(true);
  };

  const getScreenMousePosition = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleAngleChange = (roomId: string, index: number, value: string) => {
    setEditingAngles({ ...editingAngles, [`${roomId}-${index}`]: value });
  };

  const handleAngleBlur = (roomId: string, index: number) => {
    const key = `${roomId}-${index}`;
    const newAngle = Number(editingAngles[key]);
    if (!isNaN(newAngle)) {
      updateAngle(roomId, index, newAngle);
      
      // Force a re-render after a short delay
      setTimeout(() => {
        setRooms(prevRooms => [...prevRooms]);
      }, 50);
    }
    const newEditingAngles = { ...editingAngles };
    delete newEditingAngles[key];
    setEditingAngles(newEditingAngles);
  };

  const handleWallLengthChange = (roomId: string, index: number, value: string) => {
    setEditingWallLengths({ ...editingWallLengths, [`${roomId}-${index}`]: value });
  };
  
  const handleWallLengthBlur = (roomId: string, index: number) => {
    const key = `${roomId}-${index}`;
    const newLength = Number(editingWallLengths[key]);
    if (!isNaN(newLength) && newLength > 0) {
      // Use functional update pattern
      setRooms(prevRooms => {
        // Create a deep copy
        const newRooms = JSON.parse(JSON.stringify(prevRooms));
        const roomIndex = newRooms.findIndex(room => room.id === roomId);
        
        if (roomIndex >= 0) {
          const room = newRooms[roomIndex];
          const currentPoint = room.points[index];
          const nextPointIndex = (index + 1) % room.points.length;
          const nextPoint = room.points[nextPointIndex];
          
          // Skip if the next point is attached to another wall
          if (nextPoint.attachedTo) return newRooms;
          
          // Calculate angle between points
          const angle = Math.atan2(
            nextPoint.y - currentPoint.y,
            nextPoint.x - currentPoint.x
          );
          
          // Set new endpoint based on length and angle
          room.points[nextPointIndex] = {
            ...room.points[nextPointIndex],
            x: currentPoint.x + Math.cos(angle) * newLength,
            y: currentPoint.y + Math.sin(angle) * newLength
          };
          
          // Update doors and windows if needed
          if (room.isComplete && (room.doors.length > 0 || room.windows.length > 0)) {
            const oldPoints = prevRooms[roomIndex].points;
            updateDoorsAndWindows(roomId, room.points, oldPoints);
          }
        }
        
        return newRooms;
      });
    }
    
    // Clear the editing state
    const newEditingWallLengths = { ...editingWallLengths };
    delete newEditingWallLengths[key];
    setEditingWallLengths(newEditingWallLengths);
  };
  
  const handleCoordinateChange = (roomId: string, index: number, axis: 'x' | 'y', value: string) => {
    const key = `${roomId}-${index}`;
    const current = editingCoordinates[key] || { 
      x: Math.round(rooms.find(r => r.id === roomId)?.points[index]?.x || 0).toString(), 
      y: Math.round(rooms.find(r => r.id === roomId)?.points[index]?.y || 0).toString() 
    };
    setEditingCoordinates({ 
      ...editingCoordinates, 
      [key]: { ...current, [axis]: value } 
    });
  };
  
  const handleCoordinateBlur = (roomId: string, index: number) => {
    const key = `${roomId}-${index}`;
    const coords = editingCoordinates[key];
    if (coords) {
      const x = Number(coords.x);
      const y = Number(coords.y);
      if (!isNaN(x) && !isNaN(y)) {
        // Use functional update pattern
        setRooms(prevRooms => {
          // Create a deep copy to ensure we're not modifying the existing state
          const newRooms = JSON.parse(JSON.stringify(prevRooms));
          const roomIndex = newRooms.findIndex(room => room.id === roomId);
          
          if (roomIndex >= 0) {
            // Update the specific point directly
            newRooms[roomIndex].points[index].x = x;
            newRooms[roomIndex].points[index].y = y;
            
            // If this is a complete room with doors/windows, update them
            if (newRooms[roomIndex].isComplete && 
               (newRooms[roomIndex].doors.length > 0 || newRooms[roomIndex].windows.length > 0)) {
              // Update doors and windows positions based on the new point
              // This is a simplified version - you would implement the full update
              const oldPoints = prevRooms[roomIndex].points;
              updateDoorsAndWindows(roomId, newRooms[roomIndex].points, oldPoints);
            }
          }
          
          return newRooms;
        });
      }
    }
    
    // Clear the editing state
    const newEditingCoordinates = { ...editingCoordinates };
    delete newEditingCoordinates[key];
    setEditingCoordinates(newEditingCoordinates);
  };

  const drawRoom = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 0.5;
    
    const gridSizeMM = 1000;
    const gridSizePixels = gridSizeMM * scale;
    
    const offsetX = pan.x % gridSizePixels;
    const offsetY = pan.y % gridSizePixels;
    
    for (let x = offsetX; x < canvas.width; x += gridSizePixels) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = offsetY; y < canvas.height; y += gridSizePixels) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Draw rooms
    rooms.forEach(room => {
      if (room.points.length > 0) {
        ctx.beginPath();
        const firstScreenPoint = worldToScreen(room.points[0].x, room.points[0].y);
        ctx.moveTo(firstScreenPoint.x, firstScreenPoint.y);
        
        room.points.forEach((point, index) => {
          if (index > 0) {
            const screenPoint = worldToScreen(point.x, point.y);
            ctx.lineTo(screenPoint.x, screenPoint.y);
          }
        });
        
        if (room.isComplete) {
          ctx.closePath();
        }
        
        ctx.strokeStyle = room.id === activeRoomId ? '#2563eb' : '#888888';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw points
        room.points.forEach((point, index) => {
          const screenPoint = worldToScreen(point.x, point.y);
          
          ctx.beginPath();
          ctx.arc(screenPoint.x, screenPoint.y, POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = selectedPoint?.roomId === room.id && selectedPoint.index === index 
            ? '#dc2626' 
            : '#888888';
          ctx.fill();

          ctx.font = '12px Arial';
          ctx.fillStyle = '#000';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          
          let labelX = screenPoint.x + LABEL_OFFSET;
          let labelY = screenPoint.y;
          
          if (labelX > canvas.width - 100) {
            labelX = screenPoint.x - LABEL_OFFSET - 80;
          }
          
          ctx.fillText(`(${Math.round(point.x)}, ${Math.round(point.y)})`, labelX, labelY);
        });

        // Draw doors
        room.doors.forEach((door, index) => {
          const startScreen = worldToScreen(door.startPoint.x, door.startPoint.y);
          const endScreen = worldToScreen(door.endPoint.x, door.endPoint.y);
          
          ctx.beginPath();
          ctx.moveTo(startScreen.x, startScreen.y);
          ctx.lineTo(endScreen.x, endScreen.y);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          const isStartSelected = selectedDoorPoint?.roomId === room.id && 
                                selectedDoorPoint.doorIndex === index && 
                                selectedDoorPoint.pointType === 'start';
          
          const isEndSelected = selectedDoorPoint?.roomId === room.id && 
                              selectedDoorPoint.doorIndex === index && 
                              selectedDoorPoint.pointType === 'end';
          
          ctx.beginPath();
          ctx.arc(startScreen.x, startScreen.y, DOOR_POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = isStartSelected ? '#dc2626' : '#10b981';
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(endScreen.x, endScreen.y, DOOR_POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = isEndSelected ? '#dc2626' : '#10b981';
          ctx.fill();
          
          const midX = (startScreen.x + endScreen.x) / 2;
          const midY = (startScreen.y + endScreen.y) / 2;
          
          ctx.font = '12px Arial';
          ctx.fillStyle = '#10b981';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(door.width)}mm`, midX, midY - 15);
        });

        // Draw windows
        room.windows.forEach((window, index) => {
          const startScreen = worldToScreen(window.startPoint.x, window.startPoint.y);
          const endScreen = worldToScreen(window.endPoint.x, window.endPoint.y);
          
          ctx.beginPath();
          ctx.moveTo(startScreen.x, startScreen.y);
          ctx.lineTo(endScreen.x, endScreen.y);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          const isStartSelected = selectedWindowPoint?.roomId === room.id && 
                                selectedWindowPoint.windowIndex === index && 
                                selectedWindowPoint.pointType === 'start';
          
          const isEndSelected = selectedWindowPoint?.roomId === room.id && 
                              selectedWindowPoint.windowIndex === index && 
                              selectedWindowPoint.pointType === 'end';
          
          ctx.beginPath();
          ctx.arc(startScreen.x, startScreen.y, WINDOW_POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = isStartSelected ? '#dc2626' : '#3b82f6';
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(endScreen.x, endScreen.y, WINDOW_POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = isEndSelected ? '#dc2626' : '#3b82f6';
          ctx.fill();
          
          const midX = (startScreen.x + endScreen.x) / 2;
          const midY = (startScreen.y + endScreen.y) / 2;
          
          ctx.font = '12px Arial';
          ctx.fillStyle = '#3b82f6';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(window.width)}mm × ${Math.round(window.height)}mm`, midX, midY - 15);
        });
      }
    });
  };

  useEffect(() => {
    drawRoom();
  }, [rooms, selectedPoint, activeRoomId, pan, scale, selectedDoorPoint, selectedWindowPoint, addingDoor, addingWindow]);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex justify-between mb-4">
          <div className="text-sm text-gray-600">
            Scale: 1px = {(1/scale).toFixed(1)}mm | Canvas: 10m × 8m
          </div>
          <div className="flex gap-2">
            <button
              onClick={startAddingSecondaryRoom}
              disabled={!rooms.some(r => r.isMain && r.isComplete) || isAddingSecondaryRoom}
              className="flex items-center gap-2 px-4 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square size={16} />
              Add Secondary Room
            </button>
            <button
              onClick={startAddingDoor}
              disabled={!activeRoom?.isComplete || addingDoor}
              className="flex items-center gap-2 px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DoorOpen size={16} />
              {addingDoor ? 'Adding Door...' : 'Add Door'}
            </button>
            <button
              onClick={startAddingWindow}
              disabled={!activeRoom?.isComplete || addingWindow}
              className="flex items-center gap-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square size={16} />
              {addingWindow ? 'Adding Window...' : 'Add Window'}
            </button>
            <button
              onClick={() => {
                setRooms([]);
                setActiveRoomId(null);
                setIsAddingSecondaryRoom(false);
              }}
              className="flex items-center gap-2 px-4 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              <RotateCcw size={16} />
              Reset All
            </button>
            <button
              onClick={exportRoomData}
              disabled={rooms.length === 0 || !rooms.some(r => r.isComplete)}
              className="flex items-center gap-2 px-4 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Copy size={16} />
              Export JSON
            </button>
          </div>
        </div>

        {addingDoor && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-green-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-green-800">Adding Door</h3>
                <p className="text-sm text-green-700">
                  {!doorStartPoint 
                    ? "Click on a wall to place the door's start point" 
                    : "Click on the same wall to place the door's end point"}
                </p>
              </div>
              <button
                onClick={() => {
                  setAddingDoor(false);
                  setDoorStartPoint(null);
                }}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {addingWindow && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-blue-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-blue-800">Adding Window</h3>
                <p className="text-sm text-blue-700">
                  {!windowStartPoint 
                    ? "Click on a wall to place the window's start point" 
                    : "Click on the same wall to place the window's end point"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="windowHeight" className="text-sm text-blue-700">
                    Height (mm):
                  </label>
                  <input
                    type="number"
                    id="windowHeight"
                    value={windowHeight}
                    onChange={(e) => setWindowHeight(Number(e.target.value))}
                    className="w-20 px-2 py-1 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="windowSillHeight" className="text-sm text-blue-700">
                    Sill Height (mm):
                  </label>
                  <input
                    type="number"
                    id="windowSillHeight"
                    value={windowSillHeight}
                    onChange={(e) => setWindowSillHeight(Number(e.target.value))}
                    className="w-20 px-2 py-1 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => {
                    setAddingWindow(false);
                    setWindowStartPoint(null);
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
          className="border border-gray-300 rounded cursor-crosshair"
        />
      </div>

      {activeRoom && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {activeRoom.isMain ? 'Main Room' : 'Secondary Room'} Dimensions
            </h2>
            
            <select
              value={activeRoomId || ''}
              onChange={(e) => setActiveRoomId(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded"
            >
              {rooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.isMain ? 'Main Room' : `Room ${room.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Point
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    X (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Y (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wall Length (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Angle (°)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeRoom.points.map((point, index) => {
                  const wallData = calculateWallData(activeRoom);
                  return (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {index === 0 ? 'Origin' : `Point ${index}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="text"
                          value={
                            editingCoordinates[`${activeRoom.id}-${index}`]?.x !== undefined 
                              ? editingCoordinates[`${activeRoom.id}-${index}`].x 
                              : Math.round(point.x).toString()
                          }
                          onChange={(e) => handleCoordinateChange(activeRoom.id, index, 'x', e.target.value)}
                          onBlur={() => handleCoordinateBlur(activeRoom.id, index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur(); // Trigger onBlur to apply the change
                            }
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="text"
                          value={
                            editingCoordinates[`${activeRoom.id}-${index}`]?.y !== undefined 
                              ? editingCoordinates[`${activeRoom.id}-${index}`].y 
                              : Math.round(point.y).toString()
                          }
                          onChange={(e) => handleCoordinateChange(activeRoom.id, index, 'y', e.target.value)}
                          onBlur={() => handleCoordinateBlur(activeRoom.id, index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur(); // Trigger onBlur to apply the change
                            }
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {index < activeRoom.points.length - 1 || activeRoom.isComplete ? (
                          <input
                            type="text"
                            value={
                              editingWallLengths[`${activeRoom.id}-${index}`] !== undefined 
                                ? editingWallLengths[`${activeRoom.id}-${index}`] 
                                : Math.round(wallData[index]?.length || 0).toString()
                            }
                            onChange={(e) => handleWallLengthChange(activeRoom.id, index, e.target.value)}
                            onBlur={() => handleWallLengthBlur(activeRoom.id, index)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.target.blur(); // Trigger onBlur to apply the change
                              }
                            }}
                            className="w-24 px-2 py-1 border border-gray-300 rounded"
                          />
                        ) : null}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {index > 0 && activeRoom.points.length > 2 ? (
                          <input
                            type="text"
                            value={editingAngles[`${activeRoom.id}-${index}`] !== undefined 
                              ? editingAngles[`${activeRoom.id}-${index}`] 
                              : wallData[index]?.angle.toFixed(1) || '0'}
                            onChange={(e) => handleAngleChange(activeRoom.id, index, e.target.value)}
                            onBlur={() => handleAngleBlur(activeRoom.id, index)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.target.blur(); // Trigger onBlur to apply the change
                              }
                            }}
                            className="w-24 px-2 py-1 border border-gray-300 rounded"
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeRoom?.doors.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Doors</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Door
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wall
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position (mm from wall start)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Width (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeRoom.doors.map((door, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Door {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      Wall {door.wallIndex + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(door.position)}
                        onChange={(e) => updateDoorPosition(activeRoom.id, index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(door.width)}
                        onChange={(e) => updateDoorWidth(activeRoom.id, index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => removeDoor(activeRoom.id, index)}
                        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeRoom?.windows.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Windows</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Window
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wall
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Width (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Height (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sill Height (mm)
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeRoom.windows.map((window, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Window {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      Wall {window.wallIndex + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(window.position)}
                        onChange={(e) => updateWindowPosition(activeRoom.id, index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input type="number"
                        value={Math.round(window.width)}
                        onChange={(e) => updateWindowWidth(activeRoom.id, index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(window.height)}
                        onChange={(e) => updateWindowHeight(activeRoom.id, index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(window.sillHeight)}
                        onChange={(e) => updateWindowSillHeight(activeRoom.id, index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => removeWindow(activeRoom.id, index)}
                        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomDesigner;