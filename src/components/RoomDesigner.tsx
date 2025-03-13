// import React, { useState, useRef, useEffect, useMemo } from 'react';
// import { Copy, RotateCcw, DoorOpen, Square } from 'lucide-react';
// import ContextMenu from './ContextMenu';

import React, { useState, useRef, useEffect, useMemo } from 'react';
// import { Copy, RotateCcw, DoorOpen, Square, Save } from 'lucide-react';
import { Copy, RotateCcw, DoorOpen, Square, Save, BookmarkPlus } from 'lucide-react';
import ContextMenu from './ContextMenu';

// Room management interfaces
interface Room {
  id: string;
  points: Point[];
  doors: Door[];
  windows: Window[];
  isComplete: boolean;
  isMain: boolean;
  noClosingWall?: boolean; // New property to indicate no closing wall should be drawn
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

// Cabinet run interface definition
interface CabinetRun {
  id: string;
  start_pos_x: number; // Position X of the run's reference corner in mm
  start_pos_y: number; // Position Y of the run's reference corner in mm
  length: number;      // Length in mm
  depth: number;       // Depth in mm
  rotation_z: number;  // Rotation around Z axis in degrees
  type: 'Base' | 'Upper'; // Run type
  start_type: 'Open' | 'Wall'; // Start termination type
  end_type: 'Open' | 'Wall';   // End termination type
  top_filler: boolean;  // Whether there's a top filler
  is_island: boolean;   // Whether this is an island run
  
  // Optional snap status for visual feedback only
  snapInfo?: {
    isSnapped: boolean;
    snappedEdge?: 'rear';
    snappedToWall?: {
      roomId: string;
      wallIndex: number;
    };
  };
}

// Type for run drag operations
interface RunDragInfo {
  id: string;
  startX: number;    // X coordinate at start of drag
  startY: number;    // Y coordinate at start of drag
  initialRotation: number; // Rotation at start of drag
}

// Type for run selection
interface RunSelection {
  id: string;
  isResizing: boolean;
  resizeHandle?: 'length' | 'depth'; // Which dimension is being resized
}

// Type for run corner points - helps with drawing and hit detection
interface RunCorners {
  frontLeft: Point;
  frontRight: Point;
  rearRight: Point;
  rearLeft: Point;
}

// Run snapping settings
interface RunSnapSettings {
  enabled: boolean;
  threshold: number; // Distance threshold for snapping in mm
  rotationSnap: number; // Snap rotation to multiples of this value (e.g., 90 for 90-degree increments)
}

// For handling run editing UI state
interface RunEditingState {
  [key: string]: {
    length?: string;
    depth?: string;
    rotation_z?: string;
    type?: string;
    start_type?: string;
    end_type?: string;
    top_filler?: boolean;
    is_island?: boolean;
  }
}

// For temporary storage during operations like snapping
interface RunSnapResult {
  shouldSnap: boolean;
  newX?: number;
  newY?: number;
  newRotation?: number;
  snapEdge?: 'left' | 'right' | 'front' | 'rear';
  snapWall?: {
    roomId: string;
    wallIndex: number;
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
const CANVAS_HEIGHT_MM = 6000;
const CANVAS_WIDTH_px = 1200;
const CANVAS_HEIGHT_px = 600;

// Default values for new cabinet runs
const DEFAULT_RUN_LENGTH = 1000; // 1m
const DEFAULT_RUN_DEPTH = 635;   // 0.635m
const DEFAULT_BASE_HEIGHT = 900;     // 0.9m (for visual representation)
const DEFAULT_UPPER_HEIGHT = 700;    // 0.7m (for visual representation)
const DEFAULT_UPPER_OFFSET = 1500;   // 1.5m from floor (for visual representation)

//Run snapping constants:
const SNAP_DISTANCE_MM = 50; // Distance in mm to snap to walls
const SNAP_ANGLE_THRESHOLD = 5; // Degrees threshold for angular snapping
const SNAP_ROTATION_INCREMENT = 0.01; // Snap rotation to 90-degree increments


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
  // const [scale, setScale] = useState(CANVAS_WIDTH_MM/CANVAS_WIDTH_px);
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
  const [forceUpdateTimestamp, setForceUpdateTimestamp] = useState(0);
  const [cabinetRuns, setCabinetRuns] = useState<CabinetRun[]>([]); // State for cabinet runs
  const [selectedRun, setSelectedRun] = useState<string | null>(null);  // State for run selection
  const [draggedRun, setDraggedRun] = useState<RunDragInfo | null>(null); // State for tracking run dragging
  const [resizingRun, setResizingRun] = useState<{
    id: string;
    handle: 'length' | 'depth';
    startLength?: number;
    startDepth?: number;
    startX?: number;
    startY?: number;
  } | null>(null); // State for run resize operation
  const [isAddingRun, setIsAddingRun] = useState<boolean>(false); // State for run creation mode
  const [newRunType, setNewRunType] = useState<'Base' | 'Upper'>('Base'); // State for temporarily storing run type during creation
  const [editingRunValues, setEditingRunValues] = useState<RunEditingState>({}); // State for editing run properties in the UI
  // Run snapping settings
  const [runSnapSettings, setRunSnapSettings] = useState<RunSnapSettings>({
    enabled: true,
    threshold: 50, // 50mm snap threshold
    rotationSnap: 0  // No snap rotation increment (was 90)
  });
  const [hoverRun, setHoverRun] = useState<string | null>(null);
  




  
  

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
      // No need to update doors and windows again since we're doing it during the drag
      setTimeout(() => {
        // Just update attached points - doors and windows are already updated
        updateAttachedPointsAfterDrag(point);
      }, 200);
    }
  }, [isDragging, rooms]);

  useEffect(() => {
    console.log("Rooms state changed");
    // Only run if we're not currently dragging
    if (!isDragging) {
      console.log("Force updating secondary rooms");
      handleForceUpdateSecondaryRooms();
    }
  }, [rooms]);
  




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

  const findSharedWallInMainRoom = (secondaryRoom: Room, wallIndex: number): { found: boolean, wallIndex: number } => {
    const mainRoom = rooms.find(r => r.isMain);
    if (!mainRoom || !secondaryRoom || secondaryRoom.isMain) {
      return { found: false, wallIndex: -1 };
    }
    
    const sp1 = secondaryRoom.points[wallIndex];
    const sp2 = secondaryRoom.points[(wallIndex + 1) % secondaryRoom.points.length];
    
    for (let i = 0; i < mainRoom.points.length; i++) {
      const p1 = mainRoom.points[i];
      const p2 = mainRoom.points[(i + 1) % mainRoom.points.length];
      
      // Check if endpoints match (in either order)
      const dist1 = Math.sqrt(Math.pow(p1.x - sp1.x, 2) + Math.pow(p1.y - sp1.y, 2));
      const dist2 = Math.sqrt(Math.pow(p2.x - sp2.x, 2) + Math.pow(p2.y - sp2.y, 2));
      const dist3 = Math.sqrt(Math.pow(p1.x - sp2.x, 2) + Math.pow(p1.y - sp2.y, 2));
      const dist4 = Math.sqrt(Math.pow(p2.x - sp1.x, 2) + Math.pow(p2.y - sp1.y, 2));
      
      if ((dist1 < SNAP_DISTANCE / scale && dist2 < SNAP_DISTANCE / scale) ||
          (dist3 < SNAP_DISTANCE / scale && dist4 < SNAP_DISTANCE / scale)) {
        return { found: true, wallIndex: i };
      }
    }
    
    return { found: false, wallIndex: -1 };
  };
  
  
  const findClosestLine = (mousePos: Point, roomToExclude?: string): { roomId: string, wallIndex: number, point: Point, t: number } | null => {
    let closestDist = Infinity;
    let result: { roomId: string, wallIndex: number, point: Point, t: number } | null = null;
    
    // First find the closest wall across all rooms
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
  
    // If we didn't find a close enough wall or no result
    if (closestDist >= SNAP_DISTANCE / scale || !result) {
      return null;
    }
    
    // Now, check if this wall is shared with the main room
    const mainRoom = rooms.find(r => r.isMain);
    const selectedRoom = rooms.find(r => r.id === result.roomId);
    
    if (mainRoom && selectedRoom && !selectedRoom.isMain) {
      for (let i = 0; i < mainRoom.points.length; i++) {
        const p1 = mainRoom.points[i];
        const p2 = mainRoom.points[(i + 1) % mainRoom.points.length];
        
        const sp1 = selectedRoom.points[result.wallIndex];
        const sp2 = selectedRoom.points[(result.wallIndex + 1) % selectedRoom.points.length];
        
        // Check if these walls are close enough to be considered the same (in either direction)
        const dist1 = Math.sqrt(Math.pow(p1.x - sp1.x, 2) + Math.pow(p1.y - sp1.y, 2));
        const dist2 = Math.sqrt(Math.pow(p2.x - sp2.x, 2) + Math.pow(p2.y - sp2.y, 2));
        const dist3 = Math.sqrt(Math.pow(p1.x - sp2.x, 2) + Math.pow(p1.y - sp2.y, 2));
        const dist4 = Math.sqrt(Math.pow(p2.x - sp1.x, 2) + Math.pow(p2.y - sp1.y, 2));
        
        const isShared = (dist1 < SNAP_DISTANCE / scale && dist2 < SNAP_DISTANCE / scale) || 
                        (dist3 < SNAP_DISTANCE / scale && dist4 < SNAP_DISTANCE / scale);
        
        if (isShared) {
          // If this is a shared wall, recalculate the point on the main room's wall
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len2 = dx * dx + dy * dy;
          
          if (len2 > 0) {
            const t = Math.max(0, Math.min(1, (
              (result.point.x - p1.x) * dx + (result.point.y - p1.y) * dy
            ) / len2));
  
            const pointOnLine = {
              x: p1.x + t * dx,
              y: p1.y + t * dy
            };
            
            // Return the main room's wall
            return {
              roomId: mainRoom.id,
              wallIndex: i,
              point: pointOnLine,
              t
            };
          }
        }
      }
    }
    
    // If no shared wall with main room is found, return the original result
    return result;
  };

  const isSharedWall = (room1: Room, wallIndex1: number, room2: Room, wallIndex2: number): boolean => {
    if (!room1 || !room2) return false;
    
    const p1 = room1.points[wallIndex1];
    const p2 = room1.points[(wallIndex1 + 1) % room1.points.length];
    
    const sp1 = room2.points[wallIndex2];
    const sp2 = room2.points[(wallIndex2 + 1) % room2.points.length];
    
    // Calculate distances between endpoints
    const dist1 = Math.sqrt(Math.pow(p1.x - sp1.x, 2) + Math.pow(p1.y - sp1.y, 2));
    const dist2 = Math.sqrt(Math.pow(p2.x - sp2.x, 2) + Math.pow(p2.y - sp2.y, 2));
    const dist3 = Math.sqrt(Math.pow(p1.x - sp2.x, 2) + Math.pow(p1.y - sp2.y, 2));
    const dist4 = Math.sqrt(Math.pow(p2.x - sp1.x, 2) + Math.pow(p2.y - sp1.y, 2));
    
    // Wall is shared if endpoints match in either direction
    return (dist1 < SNAP_DISTANCE / scale && dist2 < SNAP_DISTANCE / scale) || 
           (dist3 < SNAP_DISTANCE / scale && dist4 < SNAP_DISTANCE / scale);
  };

  const findWallOwner = (roomId: string, wallIndex: number): { roomId: string, wallIndex: number, startPoint: Point, endPoint: Point } => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return { roomId, wallIndex, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
    
    const mainRoom = rooms.find(r => r.isMain);
    
    // If this is already the main room or there is no main room, return as is
    if (room.isMain || !mainRoom) {
      const p1 = room.points[wallIndex];
      const p2 = room.points[(wallIndex + 1) % room.points.length];
      return { roomId, wallIndex, startPoint: p1, endPoint: p2 };
    }
    
    // Check if this wall is shared with the main room
    for (let i = 0; i < mainRoom.points.length; i++) {
      if (isSharedWall(mainRoom, i, room, wallIndex)) {
        // Found a shared wall - return the main room's wall
        const p1 = mainRoom.points[i];
        const p2 = mainRoom.points[(i + 1) % mainRoom.points.length];
        return { roomId: mainRoom.id, wallIndex: i, startPoint: p1, endPoint: p2 };
      }
    }
    
    // If not shared, return the original room's wall
    const p1 = room.points[wallIndex];
    const p2 = room.points[(wallIndex + 1) % room.points.length];
    return { roomId, wallIndex, startPoint: p1, endPoint: p2 };
  };
  
  const findCorrespondingWallInMainRoom = (secondaryRoom: Room, wallIndex: number): { roomId: string, wallIndex: number } | null => {
    const mainRoom = rooms.find(r => r.isMain);
    if (!mainRoom) return null;
    
    for (let i = 0; i < mainRoom.points.length; i++) {
      if (isSharedWall(mainRoom, i, secondaryRoom, wallIndex)) {
        return {
          roomId: mainRoom.id,
          wallIndex: i
        };
      }
    }
    
    return null;
  };

  const mainRoom = useMemo(() => {
    return rooms.find(room => room.isMain);
  }, [rooms]);

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
    // Determine the correct room and wall to associate the door with
    const wallOwnerInfo = findWallOwner(roomId, wallIndex);
    
    // If the wall owner isn't the original room, we need to project the door points
    if (wallOwnerInfo.roomId !== roomId || wallOwnerInfo.wallIndex !== wallIndex) {
      // Recalculate points on the owner's wall
      const dx = wallOwnerInfo.endPoint.x - wallOwnerInfo.startPoint.x;
      const dy = wallOwnerInfo.endPoint.y - wallOwnerInfo.startPoint.y;
      const len2 = dx * dx + dy * dy;
      
      if (len2 > 0) {
        // Find equivalent positions on owner's wall
        const startT = Math.max(0, Math.min(1, (
          (startPoint.x - wallOwnerInfo.startPoint.x) * dx + 
          (startPoint.y - wallOwnerInfo.startPoint.y) * dy
        ) / len2));
        
        const endT = Math.max(0, Math.min(1, (
          (endPoint.x - wallOwnerInfo.startPoint.x) * dx + 
          (endPoint.y - wallOwnerInfo.startPoint.y) * dy
        ) / len2));
        
        startPoint = {
          x: wallOwnerInfo.startPoint.x + startT * dx,
          y: wallOwnerInfo.startPoint.y + startT * dy
        };
        
        endPoint = {
          x: wallOwnerInfo.startPoint.x + endT * dx,
          y: wallOwnerInfo.startPoint.y + endT * dy
        };
      }
    }
    
    const room = rooms.find(r => r.id === wallOwnerInfo.roomId);
    if (!room) return;
    
    const p1 = room.points[wallOwnerInfo.wallIndex];
    const p2 = room.points[(wallOwnerInfo.wallIndex + 1) % room.points.length];
    
    const width = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    const startDist = Math.sqrt(
      Math.pow(startPoint.x - p1.x, 2) + 
      Math.pow(startPoint.y - p1.y, 2)
    );
    
    const newDoor: Door = {
      wallIndex: wallOwnerInfo.wallIndex,
      startPoint,
      endPoint,
      width,
      position: startDist
    };
    
    setRooms(rooms.map(r => 
      r.id === wallOwnerInfo.roomId 
        ? { ...r, doors: [...r.doors, newDoor] }
        : r
    ));
  };

  const addWindow = (roomId: string, wallIndex: number, startPoint: Point, endPoint: Point) => {
    // Determine the correct room and wall to associate the window with
    const wallOwnerInfo = findWallOwner(roomId, wallIndex);
    
    // If the wall owner isn't the original room, we need to project the window points
    if (wallOwnerInfo.roomId !== roomId || wallOwnerInfo.wallIndex !== wallIndex) {
      // Recalculate points on the owner's wall
      const dx = wallOwnerInfo.endPoint.x - wallOwnerInfo.startPoint.x;
      const dy = wallOwnerInfo.endPoint.y - wallOwnerInfo.startPoint.y;
      const len2 = dx * dx + dy * dy;
      
      if (len2 > 0) {
        // Find equivalent positions on owner's wall
        const startT = Math.max(0, Math.min(1, (
          (startPoint.x - wallOwnerInfo.startPoint.x) * dx + 
          (startPoint.y - wallOwnerInfo.startPoint.y) * dy
        ) / len2));
        
        const endT = Math.max(0, Math.min(1, (
          (endPoint.x - wallOwnerInfo.startPoint.x) * dx + 
          (endPoint.y - wallOwnerInfo.startPoint.y) * dy
        ) / len2));
        
        startPoint = {
          x: wallOwnerInfo.startPoint.x + startT * dx,
          y: wallOwnerInfo.startPoint.y + startT * dy
        };
        
        endPoint = {
          x: wallOwnerInfo.startPoint.x + endT * dx,
          y: wallOwnerInfo.startPoint.y + endT * dy
        };
      }
    }
    
    const room = rooms.find(r => r.id === wallOwnerInfo.roomId);
    if (!room) return;
    
    const p1 = room.points[wallOwnerInfo.wallIndex];
    const p2 = room.points[(wallOwnerInfo.wallIndex + 1) % room.points.length];
    
    const width = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    const startDist = Math.sqrt(
      Math.pow(startPoint.x - p1.x, 2) + 
      Math.pow(startPoint.y - p1.y, 2)
    );
    
    const newWindow: Window = {
      wallIndex: wallOwnerInfo.wallIndex,
      startPoint,
      endPoint,
      width,
      height: windowHeight,
      sillHeight: windowSillHeight,
      position: startDist
    };
    
    setRooms(rooms.map(r => 
      r.id === wallOwnerInfo.roomId 
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
    let newRooms = rooms.map(r => {
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
      
      // For completed rooms with doors/windows, update them in one step
      if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
        const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
        return { 
          ...r, 
          points: newPoints,
          doors,
          windows
        };
      }
      
      return { 
        ...r, 
        points: newPoints
      };
    });
    
    // Set the final state with all updates in one go
    setRooms(newRooms);
    
    // After updating any point, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
  };

  // Enhanced function to explicitly handle updating secondary rooms and their doors/windows
const handleForceUpdateSecondaryRooms = () => {
  console.log("Starting force update of secondary rooms");
  
  // First, create a deep copy of rooms
  const updatedRooms = JSON.parse(JSON.stringify(rooms));
  let roomsUpdated = false;
  
  // Step 1: Update attached points
  for (const room of updatedRooms) {
    // Skip processing the main room
    if (room.isMain) continue;
    
    let roomChanged = false;
    const originalPoints = JSON.parse(JSON.stringify(room.points));
    
    // Update all attached points in this room
    for (let i = 0; i < room.points.length; i++) {
      const point = room.points[i];
      
      if (point.attachedTo) {
        // Find the parent room
        const parentRoom = updatedRooms.find(r => r.id === point.attachedTo.roomId);
        if (!parentRoom) continue;
        
        // Get the wall points
        const wallIndex = point.attachedTo.wallIndex;
        if (wallIndex >= parentRoom.points.length) continue;
        
        const wallStart = parentRoom.points[wallIndex];
        const wallEnd = parentRoom.points[(wallIndex + 1) % parentRoom.points.length];
        
        // Calculate the new position
        const t = point.attachedTo.t;
        const newX = wallStart.x + t * (wallEnd.x - wallStart.x);
        const newY = wallStart.y + t * (wallEnd.y - wallStart.y);
        
        // Update the point if needed
        if (Math.abs(point.x - newX) > 0.001 || Math.abs(point.y - newY) > 0.001) {
          point.x = newX;
          point.y = newY;
          roomChanged = true;
          roomsUpdated = true;
          console.log(`Updated point in room ${room.id}, x=${newX}, y=${newY}`);
        }
      }
    }
    
    if (room.isComplete) {
      // Update windows and doors even if points didn't change directly
      // This ensures windows/doors always stay aligned with walls
      if (room.doors.length > 0 || room.windows.length > 0) {
        const { doors, windows } = getUpdatedDoorsAndWindows(room, room.points, originalPoints);
        
        // Check if doors actually changed
        let doorsChanged = false;
        if (doors.length !== room.doors.length) {
          doorsChanged = true;
        } else {
          for (let i = 0; i < doors.length; i++) {
            if (Math.abs(doors[i].startPoint.x - room.doors[i].startPoint.x) > 0.001 ||
                Math.abs(doors[i].startPoint.y - room.doors[i].startPoint.y) > 0.001 ||
                Math.abs(doors[i].endPoint.x - room.doors[i].endPoint.x) > 0.001 ||
                Math.abs(doors[i].endPoint.y - room.doors[i].endPoint.y) > 0.001) {
              doorsChanged = true;
              break;
            }
          }
        }
        
        // Check if windows actually changed
        let windowsChanged = false;
        if (windows.length !== room.windows.length) {
          windowsChanged = true;
        } else {
          for (let i = 0; i < windows.length; i++) {
            if (Math.abs(windows[i].startPoint.x - room.windows[i].startPoint.x) > 0.001 ||
                Math.abs(windows[i].startPoint.y - room.windows[i].startPoint.y) > 0.001 ||
                Math.abs(windows[i].endPoint.x - room.windows[i].endPoint.x) > 0.001 ||
                Math.abs(windows[i].endPoint.y - room.windows[i].endPoint.y) > 0.001) {
              windowsChanged = true;
              break;
            }
          }
        }
        
        // Only update if something actually changed
        if (doorsChanged || windowsChanged) {
          room.doors = doors;
          room.windows = windows;
          roomsUpdated = true;
          console.log(`Updated doors/windows in room ${room.id}`);
        }
      }
    }
  }
  
  // Only update state if changes were made
  if (roomsUpdated) {
    console.log("Applying secondary room updates");
    setRooms(updatedRooms);
    setForceUpdateTimestamp(Date.now()); // Trigger another component update
  } else {
    console.log("No secondary room updates needed");
  }
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
      
      // For completed rooms with doors/windows, update them in one step
      if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
        const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
        return { 
          ...r, 
          points: newPoints,
          doors,
          windows
        };
      }
      
      return { 
        ...r, 
        points: newPoints
      };
    });
    
    // Set the final state with all updates in one go
    setRooms(newRooms);
    
    // After updating wall length, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
    
    // After updating the state, simulate a drag operation to trigger post-process effects
    const nextPointIndex = (index + 1) % room.points.length;
    lastDraggedPointRef.current = { roomId, index: nextPointIndex };
    setIsDragging(true);
    setTimeout(() => {
      setIsDragging(false);
    }, 50);
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
      
      // For completed rooms with doors/windows, update them in one step
      if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
        const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
        return { 
          ...r, 
          points: newPoints,
          doors,
          windows
        };
      }
      
      return { 
        ...r, 
        points: newPoints
      };
    });
    
    // Set the final state with all updates in one go
    setRooms(newRooms);
    
    // After updating angle, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
    
    // After updating the state, simulate a drag operation to trigger post-process effects
    const nextPointIndex = (index + 1) % room.points.length;
    lastDraggedPointRef.current = { roomId, index: nextPointIndex };
    setIsDragging(true);
    setTimeout(() => {
      setIsDragging(false);
    }, 50);
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

  const distancePointToWall = (point: Point, wallStart: Point, wallEnd: Point): {
    distance: number;
    closestPoint: Point;
    t: number; // parameter along the line (0-1)
  } => {
    const dx = wallEnd.x - wallStart.x;
    const dy = wallEnd.y - wallStart.y;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) {
      // Wall is a point
      return {
        distance: Math.sqrt((point.x - wallStart.x)**2 + (point.y - wallStart.y)**2),
        closestPoint: { x: wallStart.x, y: wallStart.y },
        t: 0
      };
    }
    
    // Calculate projection parameter t
    let t = ((point.x - wallStart.x) * dx + (point.y - wallStart.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t)); // Constrain to wall segment
    
    // Calculate closest point on wall
    const closestPoint = {
      x: wallStart.x + t * dx,
      y: wallStart.y + t * dy
    };
    
    // Calculate distance
    const distance = Math.sqrt(
      (point.x - closestPoint.x)**2 + 
      (point.y - closestPoint.y)**2
    );
    
    return { distance, closestPoint, t };
  };

  const calculateRunCorners = (run: CabinetRun): RunCorners => {
    const rotationRad = (run.rotation_z * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    
    // Start position is the LEFT rear corner
    const rearLeft = {
      x: run.start_pos_x,
      y: run.start_pos_y
    };
    
    // Calculate other corners relative to the left rear corner
    const rearRight = {
      x: rearLeft.x + run.length * cos,
      y: rearLeft.y + run.length * sin
    };
    
    const frontLeft = {
      x: rearLeft.x + run.depth * sin,
      y: rearLeft.y - run.depth * cos
    };
    
    const frontRight = {
      x: rearRight.x + run.depth * sin,
      y: rearRight.y - run.depth * cos
    };
    
    return { 
      frontLeft: frontLeft, 
      frontRight: frontRight, 
      rearRight: rearRight, 
      rearLeft: rearLeft 
    };
  };

  const calculateRunEdges = (corners: RunCorners): Array<{start: Point, end: Point, type: string}> => {
    return [
      { start: corners.rearRight, end: corners.rearLeft, type: 'rear' }, // Only include the rear edge
    ];
  };

  // Calculate the optimal rotation to align with a wall
  const calculateWallAlignment = (
    wallStart: Point, 
    wallEnd: Point,
    runRotation: number
  ): number => {
    // Calculate wall angle in degrees
    const wallAngle = Math.atan2(
      wallEnd.y - wallStart.y,
      wallEnd.x - wallStart.x
    ) * (180 / Math.PI);
    
    // Normalize to 0-360
    const normalizedWallAngle = (wallAngle + 360) % 360;
    
    // For rear of cabinet to align with wall, we need to rotate 180 degrees from wall direction
    const alignedAngle = (normalizedWallAngle + 180) % 360;
    
    // Return the aligned angle (no snapping to other orientations)
    return alignedAngle;
  };
  
  // Check if a point is inside a cabinet run
  const isPointInRun = (point: Point, run: CabinetRun): boolean => {
    // Expand the hit area around runs to make them easier to select
    const hitAreaExpansion = 10 / scale; // 10 pixels in world coordinates
    
    // Transform the point to local coordinates
    const rotationRad = (-run.rotation_z * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    
    // Translate point to run's coordinate system
    const translatedX = point.x - run.start_pos_x;
    const translatedY = point.y - run.start_pos_y;
    
    // Rotate point
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;
    
    // Check if point is inside rectangle bounds with expanded hit area
    return (
      rotatedX >= -hitAreaExpansion && 
      rotatedX <= run.length + hitAreaExpansion && 
      rotatedY >= -hitAreaExpansion && 
      rotatedY <= run.depth + hitAreaExpansion
    );
  };
  
  // Find the cabinet run at a given position
  const findRunAtPosition = (position: Point): string | null => {
    for (const run of cabinetRuns) {
      if (isPointInRun(position, run)) {
        return run.id;
      }
    }
    return null;
  };

  const pointToLineDistance = (point: Point, lineStart: Point, lineEnd: Point): {
    distance: number;
    closestPoint: Point;
    t: number; // Parameter along the line (0-1)
  } => {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLengthSq = dx * dx + dy * dy;
    
    if (lineLengthSq === 0) {
      // Line segment is actually a point
      return {
        distance: Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2),
        closestPoint: { x: lineStart.x, y: lineStart.y },
        t: 0
      };
    }
    
    // Calculate projection of point onto line
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq));
    
    // Calculate closest point on line
    const closestPoint = {
      x: lineStart.x + t * dx,
      y: lineStart.y + t * dy
    };
    
    // Calculate distance
    const distance = Math.sqrt((point.x - closestPoint.x) ** 2 + (point.y - closestPoint.y) ** 2);
    
    return { distance, closestPoint, t };
  };
  
  // Check if a run edge should snap to a wall
  const checkRunEdgeToWallSnap = (runEdgeStart: Point, runEdgeEnd: Point, room: Room, wallIndex: number): RunSnapResult => {
    const p1 = room.points[wallIndex];
    const p2 = room.points[(wallIndex + 1) % room.points.length];
    
    // Calculate midpoint of run edge
    const runEdgeMid = {
      x: (runEdgeStart.x + runEdgeEnd.x) / 2,
      y: (runEdgeStart.y + runEdgeEnd.y) / 2
    };
    
    // Get distance from midpoint to wall
    const { distance, closestPoint, t } = pointToLineDistance(runEdgeMid, p1, p2);
    
    // Check if within snapping threshold
    if (distance <= runSnapSettings.threshold / scale) {
      // Calculate angle between run edge and wall
      const runEdgeAngle = Math.atan2(runEdgeEnd.y - runEdgeStart.y, runEdgeEnd.x - runEdgeStart.x);
      const wallAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      
      // Normalize angle difference to [-π, π]
      let angleDiff = (runEdgeAngle - wallAngle) % (2 * Math.PI);
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      // Check if angles are parallel or perpendicular (within tolerance)
      const isParallel = Math.abs(angleDiff) < 0.1 || Math.abs(Math.abs(angleDiff) - Math.PI) < 0.1;
      const isPerpendicular = Math.abs(Math.abs(angleDiff) - Math.PI / 2) < 0.1;
      
      if (isParallel || isPerpendicular) {
        // Calculate new rotation to align with wall
        let newRotation = 0;
        
        if (isParallel) {
          // Align parallel to wall
          newRotation = (wallAngle * 180 / Math.PI) % 360;
          if (newRotation < 0) newRotation += 360;
        } else {
          // Align perpendicular to wall
          newRotation = ((wallAngle + Math.PI / 2) * 180 / Math.PI) % 360;
          if (newRotation < 0) newRotation += 360;
        }
        
        // Snap rotation to increments if enabled
        if (runSnapSettings.rotationSnap > 0) {
          newRotation = Math.round(newRotation / runSnapSettings.rotationSnap) * runSnapSettings.rotationSnap;
        }
        
        return {
          shouldSnap: true,
          newRotation: newRotation,
          snapEdge: isParallel ? 'left' : 'rear', // This is simplified - would need more logic to determine actual edge
          snapWall: {
            roomId: room.id,
            wallIndex: wallIndex
          }
        };
      }
    }
    
    return { shouldSnap: false };
  };
  
  // Find the best wall to snap a run to
  const findBestWallSnapForRun = (run: CabinetRun): RunSnapResult => {
    // Don't try to snap if there are no rooms
    if (!rooms.some(r => r.isComplete)) {
      return { shouldSnap: false };
    }
    
    // Calculate current corners of the run using the new LEFT rear corner model
    const corners = calculateRunCorners(run);
    
    // Get only the rear edge of the run
    const edges = calculateRunEdges(corners);
    
    // Track the best snap found
    let bestSnap = {
      shouldSnap: false,
      snapDistance: SNAP_DISTANCE_MM / scale,
      snapEdge: 'rear' as 'rear' | undefined,
      snapWall: { roomId: '', wallIndex: -1 },
      newX: run.start_pos_x,
      newY: run.start_pos_y,
      newRotation: run.rotation_z
    };
    
    // Check all completed rooms
    for (const room of rooms) {
      if (!room.isComplete || room.points.length < 3) continue;
      
      // Check each wall in the room
      for (let wallIndex = 0; wallIndex < room.points.length; wallIndex++) {
        const wallStart = room.points[wallIndex];
        const wallEnd = room.points[(wallIndex + 1) % room.points.length];
        
        // Use the rear edge only
        const edge = edges[0];
        
        // Use the midpoint of the edge for initial distance check
        const edgeMidpoint = {
          x: (edge.start.x + edge.end.x) / 2,
          y: (edge.start.y + edge.end.y) / 2
        };
        
        // Calculate distance from edge midpoint to wall
        const { distance, closestPoint } = distancePointToWall(
          edgeMidpoint, wallStart, wallEnd
        );
        
        // If this is closer than our current best and within threshold
        if (distance < bestSnap.snapDistance) {
          // Calculate an alignment rotation
          const newRotation = calculateWallAlignment(
            wallStart, wallEnd, run.rotation_z
          );
          
          // Calculate how much we need to move to snap
          const dx = closestPoint.x - edgeMidpoint.x;
          const dy = closestPoint.y - edgeMidpoint.y;
          
          // Update best snap
          bestSnap = {
            shouldSnap: true,
            snapDistance: distance,
            snapEdge: 'rear',
            snapWall: { roomId: room.id, wallIndex },
            newX: run.start_pos_x + dx,
            newY: run.start_pos_y + dy,
            newRotation
          };
        }
      }
    }
    
    return bestSnap;
  };

  const findBestWallSnap = (run: CabinetRun): {
    shouldSnap: boolean;
    newX?: number;
    newY?: number;
    newRotation?: number;
    snapEdge?: string;
    snapWall?: {
      roomId: string;
      wallIndex: number;
    };
    snapDistance?: number;
  } => {
    // Don't try to snap if there are no rooms
    if (!rooms.some(r => r.isComplete)) {
      return { shouldSnap: false };
    }
    
    // Calculate current corners of the run
    const corners = calculateRunCorners(run);
    
    // Get only the rear edge of the run
    const edges = calculateRunEdges(corners);
    
    // Track the best snap found
    let bestSnap = {
      shouldSnap: false,
      snapDistance: SNAP_DISTANCE_MM / scale,
      snapEdge: '',
      snapWall: { roomId: '', wallIndex: -1 },
      newX: run.start_pos_x,
      newY: run.start_pos_y,
      newRotation: run.rotation_z
    };
    
    // Check all completed rooms
    for (const room of rooms) {
      if (!room.isComplete || room.points.length < 3) continue;
      
      // Check each wall in the room
      for (let wallIndex = 0; wallIndex < room.points.length; wallIndex++) {
        const wallStart = room.points[wallIndex];
        const wallEnd = room.points[(wallIndex + 1) % room.points.length];
        
        // Get the rear edge of the cabinet
        const edge = edges[0];
        
        // Use the midpoint of the edge for initial distance check
        const edgeMidpoint = {
          x: (edge.start.x + edge.end.x) / 2,
          y: (edge.start.y + edge.end.y) / 2
        };
        
        // Calculate distance from edge midpoint to wall
        const { distance, closestPoint } = distancePointToWall(
          edgeMidpoint, wallStart, wallEnd
        );
        
        // If this is closer than our current best and within threshold
        if (distance < bestSnap.snapDistance) {
          // Calculate an alignment rotation - will align rear edge to wall
          const newRotation = calculateWallAlignment(
            wallStart, wallEnd, run.rotation_z
          );
          
          // Calculate how much we need to move to snap
          const dx = closestPoint.x - edgeMidpoint.x;
          const dy = closestPoint.y - edgeMidpoint.y;
          
          // Update best snap
          bestSnap = {
            shouldSnap: true,
            snapDistance: distance,
            snapEdge: 'rear',
            snapWall: { roomId: room.id, wallIndex },
            newX: run.start_pos_x + dx,
            newY: run.start_pos_y + dy,
            newRotation
          };
        }
      }
    }
    
    return bestSnap;
  };

  // Apply run snap (for existing runs being dragged)
  const applyRunSnap = (
    runId: string | null, 
    mousePos: Point, 
    currentRun?: CabinetRun
  ): void => {
    // For clarity: If the user clicked at mousePos, we want to place
    // the LEFT rear corner of the cabinet at this position
    
    // Create a temporary run at the clicked position
    const tempRun: CabinetRun = currentRun || {
      id: 'temp',
      start_pos_x: mousePos.x,  // Directly use mouse position as left rear corner
      start_pos_y: mousePos.y,
      length: DEFAULT_RUN_LENGTH,
      depth: DEFAULT_RUN_DEPTH,
      rotation_z: 0,
      type: newRunType,
      start_type: 'Open',
      end_type: 'Open',
      top_filler: false,
      is_island: false
    };
    
    // Find best wall to snap to
    const snapResult = findBestWallSnap(tempRun);
    
    if (snapResult.shouldSnap) {
      if (runId) {
        // Update existing run
        setCabinetRuns(prev => prev.map(run => {
          if (run.id === runId) {
            return {
              ...run,
              start_pos_x: snapResult.newX!,
              start_pos_y: snapResult.newY!,
              rotation_z: snapResult.newRotation!,
              snapInfo: {
                isSnapped: true,
                snappedEdge: snapResult.snapEdge as 'rear' | undefined,
                snappedToWall: snapResult.snapWall
              }
            };
          }
          return run;
        }));
      } else {
        // Create new run with snap
        const highestId = cabinetRuns.length > 0 
          ? Math.max(...cabinetRuns.map(run => parseInt(run.id.toString())))
          : 0;
        const newRunId = (highestId + 1).toString();
        
        const newRun: CabinetRun = {
          id: newRunId,
          start_pos_x: mousePos.x,
          start_pos_y: mousePos.y,
          length: DEFAULT_RUN_LENGTH,
          depth: DEFAULT_RUN_DEPTH,
          rotation_z: currentRun?.rotation_z || 0, // Use exact rotation from current run, no snapping
          type: newRunType,
          start_type: 'Open',
          end_type: 'Open',
          top_filler: false,
          is_island: false
        };
        
        setCabinetRuns([...cabinetRuns, newRun]);
        setSelectedRun(newRunId);
      }
    } else {
      // No snap - just update or create at mouse position
      if (runId) {
        setCabinetRuns(prev => prev.map(run => {
          if (run.id === runId) {
            return {
              ...run,
              start_pos_x: mousePos.x,
              start_pos_y: mousePos.y,
              snapInfo: undefined
            };
          }
          return run;
        }));
      } else {
        // Create new run without snap
        const highestId = cabinetRuns.length > 0 
          ? Math.max(...cabinetRuns.map(run => parseInt(run.id.toString())))
          : 0;
        const newRunId = (highestId + 1).toString();
        
        const newRun: CabinetRun = {
          id: newRunId,
          start_pos_x: mousePos.x,
          start_pos_y: mousePos.y,
          length: DEFAULT_RUN_LENGTH,
          depth: DEFAULT_RUN_DEPTH,
          rotation_z: currentRun?.rotation_z || 0,
          type: newRunType,
          start_type: 'Open',
          end_type: 'Open',
          top_filler: false,
          is_island: false
        };
        
        setCabinetRuns([...cabinetRuns, newRun]);
        setSelectedRun(newRunId);
      }
    }
    
    setIsAddingRun(false);
  };
  
  // Calculate the snap position for a run during placement or dragging
  const calculateRunSnapPosition = (
    mousePos: Point, 
    currentRotation: number, 
    runLength: number = DEFAULT_RUN_LENGTH, 
    runDepth: number = DEFAULT_RUN_DEPTH
  ): RunSnapResult => {
    // mousePos is directly the rear left corner of the cabinet
    // Create a temporary run at the mouse position
    const tempRun: CabinetRun = {
      id: 'temp',
      start_pos_x: mousePos.x,
      start_pos_y: mousePos.y,
      length: runLength,
      depth: runDepth,
      rotation_z: currentRotation,
      type: 'Base',
      start_type: 'Open',
      end_type: 'Open',
      top_filler: false,
      is_island: false
    };
    
    // Find the best wall to snap to
    return findBestWallSnapForRun(tempRun);
  };

  // Start adding a new cabinet run
const startAddingRun = () => {
  if (!rooms.some(room => room.isMain && room.isComplete)) {
    alert('Please complete the main room first');
    return;
  }
  
  setIsAddingRun(true);
  setNewRunType('Base'); // Default to Base type
};

// Function to create a new cabinet run at the specified position
const createCabinetRun = (position: Point) => {
  // Check if we should snap to a wall
  const snapResult = calculateRunSnapPosition(position, 0);
  
  // Create new cabinet run with a unique integer ID
  const highestId = cabinetRuns.length > 0 
    ? Math.max(...cabinetRuns.map(run => parseInt(run.id.toString())))
    : 0;
  const newRunId = (highestId + 1).toString();
  
  // Get position from snap result or mouse position for the rear-left corner
  let posX = snapResult.shouldSnap && snapResult.newX !== undefined ? snapResult.newX : position.x;
  let posY = snapResult.shouldSnap && snapResult.newY !== undefined ? snapResult.newY : position.y;
  const rotation = snapResult.shouldSnap && snapResult.newRotation !== undefined ? snapResult.newRotation : 0;
  
  // Create new run with the position representing the rear left corner
  const newRun: CabinetRun = {
    id: newRunId,
    start_pos_x: posX,
    start_pos_y: posY,
    length: DEFAULT_RUN_LENGTH,
    depth: DEFAULT_RUN_DEPTH,
    rotation_z: rotation,
    type: newRunType,
    start_type: 'Open',
    end_type: 'Open',
    top_filler: false,
    is_island: false,
    snapInfo: snapResult.shouldSnap ? {
      isSnapped: true,
      snappedEdge: snapResult.snapEdge as 'rear'  | undefined,
      snappedToWall: snapResult.snapWall
    } : undefined
  };
  
  setCabinetRuns(prevRuns => [...prevRuns, newRun]);
  setSelectedRun(newRunId);
  setIsAddingRun(false);
};

// Update a cabinet run property
const updateRunProperty = (id: string, property: keyof CabinetRun, value: any) => {
  setCabinetRuns(prevRuns => prevRuns.map(run => 
    run.id === id 
      ? { ...run, [property]: value }
      : run
  ));
};

// Delete a cabinet run
const deleteRun = (id: string) => {
  setCabinetRuns(prevRuns => prevRuns.filter(run => run.id !== id));
  if (selectedRun === id) {
    setSelectedRun(null);
  }
};


// Function to rotate a cabinet run
const rotateRun = (id: string, angle: number) => {
  setCabinetRuns(prevRuns => prevRuns.map(run => {
    if (run.id !== id) return run;
    
    // Add the angle to the current rotation
    let newRotation = (run.rotation_z + angle) % 360;
    if (newRotation < 0) newRotation += 360;
    
    // Snap to increments if enabled
    if (runSnapSettings.rotationSnap > 0) {
      newRotation = Math.round(newRotation / runSnapSettings.rotationSnap) * runSnapSettings.rotationSnap;
    }
    
    return {
      ...run,
      rotation_z: newRotation,
      // Clear snapping info as rotation likely broke the alignment
      snapInfo: undefined
    };
  }));
};

// Function to toggle run properties
const toggleRunProperty = (id: string, property: 'top_filler' | 'is_island') => {
  setCabinetRuns(prevRuns => prevRuns.map(run => 
    run.id === id 
      ? { ...run, [property]: !run[property] }
      : run
  ));
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
      } : {
        count: 0,
        from: [],
        to: [],
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

  // Create cabinet run export data
  const cabinetRunData = cabinetRuns.map(run => {
    return {
      id: run.id,
      type: run.type,
      position: {
        x: Math.round(run.start_pos_x),
        y: Math.round(run.start_pos_y)
      },
      dimensions: {
        length: Math.round(run.length),
        depth: Math.round(run.depth)
      },
      rotation_z: Math.round(run.rotation_z),
      properties: {
        start_type: run.start_type,
        end_type: run.end_type,
        top_filler: run.top_filler,
        is_island: run.is_island
      }
    };
  });

  // Additional metadata with cabinet runs included
  const exportObject = {
    projectData: {
      rooms: exportData,
      cabinetRuns: cabinetRunData,
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
    
    // If we're adding a cabinet run, place it
    if (isAddingRun) {
      createCabinetRun(mousePos);
      return;
    }
    
    // Check if clicking on a cabinet run - prioritize this check
    const runId = findRunAtPosition(mousePos);
    if (runId) {
      const run = cabinetRuns.find(r => r.id === runId);
      if (run) {
        setSelectedRun(runId);
        setDraggedRun({
          id: runId,
          startX: mousePos.x,
          startY: mousePos.y,
          initialRotation: run.rotation_z
        });
        setIsDragging(true);
        e.stopPropagation(); // Prevent this event from triggering other handlers
        return;
      }
    }
    
    // Existing code for doors
    if (addingDoor) {
      const closestLine = findClosestLine(mousePos);
      if (closestLine) {
        let targetRoomId = closestLine.roomId;
        let targetWallIndex = closestLine.wallIndex;
        let targetPoint = closestLine.point;
        
        // Check if this is a secondary room wall shared with main room
        const room = rooms.find(r => r.id === closestLine.roomId);
        
        if (room && !room.isMain) {
          const sharedWallInfo = findSharedWallInMainRoom(room, closestLine.wallIndex);
          
          if (sharedWallInfo.found) {
            const mainRoom = rooms.find(r => r.isMain);
            if (mainRoom) {
              // Recalculate the point on the main room's wall
              const mainP1 = mainRoom.points[sharedWallInfo.wallIndex];
              const mainP2 = mainRoom.points[(sharedWallInfo.wallIndex + 1) % mainRoom.points.length];
              
              const dx = mainP2.x - mainP1.x;
              const dy = mainP2.y - mainP1.y;
              const len2 = dx * dx + dy * dy;
              
              if (len2 > 0) {
                const t = Math.max(0, Math.min(1, (
                  (closestLine.point.x - mainP1.x) * dx + (closestLine.point.y - mainP1.y) * dy
                ) / len2));
                
                targetRoomId = mainRoom.id;
                targetWallIndex = sharedWallInfo.wallIndex;
                targetPoint = {
                  x: mainP1.x + t * dx,
                  y: mainP1.y + t * dy
                };
              }
            }
          }
        }
        
        if (!doorStartPoint) {
          setDoorStartPoint({
            roomId: targetRoomId,
            wallIndex: targetWallIndex,
            point: targetPoint
          });
        } else if (doorStartPoint.roomId === targetRoomId && 
                  doorStartPoint.wallIndex === targetWallIndex) {
          addDoor(doorStartPoint.roomId, doorStartPoint.wallIndex, doorStartPoint.point, targetPoint);
          setAddingDoor(false);
          setDoorStartPoint(null);
        }
      }
      return;
    }
  
    // Existing code for windows
    if (addingWindow) {
      const closestLine = findClosestLine(mousePos);
      if (closestLine) {
        let targetRoomId = closestLine.roomId;
        let targetWallIndex = closestLine.wallIndex;
        let targetPoint = closestLine.point;
        
        // Check if this is a secondary room wall shared with main room
        const room = rooms.find(r => r.id === closestLine.roomId);
        
        if (room && !room.isMain) {
          const sharedWallInfo = findSharedWallInMainRoom(room, closestLine.wallIndex);
          
          if (sharedWallInfo.found) {
            const mainRoom = rooms.find(r => r.isMain);
            if (mainRoom) {
              // Recalculate the point on the main room's wall
              const mainP1 = mainRoom.points[sharedWallInfo.wallIndex];
              const mainP2 = mainRoom.points[(sharedWallInfo.wallIndex + 1) % mainRoom.points.length];
              
              const dx = mainP2.x - mainP1.x;
              const dy = mainP2.y - mainP1.y;
              const len2 = dx * dx + dy * dy;
              
              if (len2 > 0) {
                const t = Math.max(0, Math.min(1, (
                  (closestLine.point.x - mainP1.x) * dx + (closestLine.point.y - mainP1.y) * dy
                ) / len2));
                
                targetRoomId = mainRoom.id;
                targetWallIndex = sharedWallInfo.wallIndex;
                targetPoint = {
                  x: mainP1.x + t * dx,
                  y: mainP1.y + t * dy
                };
              }
            }
          }
        }
        
        if (!windowStartPoint) {
          setWindowStartPoint({
            roomId: targetRoomId,
            wallIndex: targetWallIndex,
            point: targetPoint
          });
        } else if (windowStartPoint.roomId === targetRoomId && 
                  windowStartPoint.wallIndex === targetWallIndex) {
          addWindow(windowStartPoint.roomId, windowStartPoint.wallIndex, windowStartPoint.point, targetPoint);
          setAddingWindow(false);
          setWindowStartPoint(null);
        }
      }
      return;
    }
  
    // Existing code for points, doors, windows
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
  
  const getUpdatedDoorsAndWindows = (room: Room, newPoints: Point[], oldPoints: Point[]) => {
    // Skip if room is not complete or has no doors/windows
    if (!room.isComplete || (room.doors.length === 0 && room.windows.length === 0)) {
      return { doors: room.doors, windows: room.windows };
    }
    
    // Update doors within this room
    const updatedDoors = room.doors.map(door => {
      const wallIndex = door.wallIndex;
      
      // Skip doors on non-existent walls
      if (wallIndex >= oldPoints.length || wallIndex >= newPoints.length) {
        return door;
      }
      
      // Get new wall vertices
      const newStartVertex = newPoints[wallIndex];
      const newEndVertex = newPoints[(wallIndex + 1) % newPoints.length];
      
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
      
      // Get new wall vertices
      const newStartVertex = newPoints[wallIndex];
      const newEndVertex = newPoints[(wallIndex + 1) % newPoints.length];
      
      // Calculate new wall vector
      const newWallDx = newEndVertex.x - newStartVertex.x;
      const newWallDy = newEndVertex.y - newStartVertex.y;
      const newWallLength = Math.sqrt(newWallDx * newWallDx + newWallDy * newWallDy);
      
      // Skip if wall has zero length
      if (newWallLength === 0) return window;
      
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
      doors: updatedDoors,
      windows: updatedWindows
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mousePos = getMousePosition(e);
    
    // Check for hover over runs when not dragging
    if (!isDragging && !isPanning) {
      const runId = findRunAtPosition(mousePos);
      if (runId !== hoverRun) {
        setHoverRun(runId);
        
        // Change cursor style
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.style.cursor = runId ? 'move' : 'crosshair';
        }
      }
    }
    
    if (isDragging) {
      // Handle dragging cabinet runs
      if (draggedRun) {
        const run = cabinetRuns.find(r => r.id === draggedRun.id);
        if (!run) return;
        
        // Calculate the movement delta
        const dx = mousePos.x - draggedRun.startX;
        const dy = mousePos.y - draggedRun.startY;
        
        // New position without snapping - direct update to LEFT rear corner
        const newPosX = run.start_pos_x + dx;
        const newPosY = run.start_pos_y + dy;
        
        // Create temporary run at the new position to check for snapping
        const tempRun: CabinetRun = {
          ...run,
          start_pos_x: newPosX,
          start_pos_y: newPosY
        };
        
        // Check for snapping if enabled
        if (runSnapSettings.enabled) {
          const snapResult = findBestWallSnapForRun(tempRun);
          
          if (snapResult.shouldSnap && snapResult.newX !== undefined && snapResult.newY !== undefined) {
            // Update existing run
            setCabinetRuns(prevRuns => prevRuns.map(r => 
              r.id === draggedRun.id 
                ? {
                    ...r,
                    start_pos_x: snapResult.newX!,
                    start_pos_y: snapResult.newY!,
                    rotation_z: snapResult.newRotation !== undefined ? snapResult.newRotation : r.rotation_z,
                    snapInfo: {
                      isSnapped: true,
                      snappedEdge: 'rear', // Always reference the rear edge for clarity
                      snappedToWall: snapResult.snapWall
                    }
                  }
                : r
            ));
          } else {
            // No snap - just update position
            setCabinetRuns(prevRuns => prevRuns.map(r => 
              r.id === draggedRun.id 
                ? {
                    ...r,
                    start_pos_x: newPosX,
                    start_pos_y: newPosY,
                    snapInfo: undefined
                  }
                : r
            ));
          }
        } else {
          // Snapping disabled - just update position
          setCabinetRuns(prevRuns => prevRuns.map(r => 
            r.id === draggedRun.id 
              ? {
                  ...r,
                  start_pos_x: newPosX,
                  start_pos_y: newPosY,
                  snapInfo: undefined
                }
              : r
          ));
        }
        
        // Update drag start position for next move
        setDraggedRun({
          ...draggedRun,
          startX: mousePos.x,
          startY: mousePos.y
        });
        
        return;
      }
      
      // Handle dragging points
      if (selectedPoint) {
        lastDraggedPointRef.current = { ...selectedPoint };
        
        // Get the room with the selected point
        const room = rooms.find(r => r.id === selectedPoint.roomId);
        if (!room) return;
        
        const pointIndex = selectedPoint.index;
        const point = room.points[pointIndex];
        
        // Store original points for door/window updates
        const oldPoints = [...room.points];
        
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
            const newRooms = prevRooms.map(r => {
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
              
              // For completed rooms with doors/windows, update them in one step
              if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
                const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
                return { 
                  ...r, 
                  points: newPoints,
                  doors,
                  windows
                };
              }
              
              return { ...r, points: newPoints };
            });
            
            return newRooms;
          });
          
          setTimeout(updateAttachedPoints, 0);
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
          setRooms(prevRooms => {
            const newRooms = prevRooms.map(r => {
              if (r.id !== selectedPoint.roomId) return r;
              
              const dx = mousePos.x - r.points[0].x;
              const dy = mousePos.y - r.points[0].y;
              
              const newPoints = r.points.map(p => ({
                ...p,
                x: p.x + dx,
                y: p.y + dy
              }));
              
              // For completed rooms with doors/windows, update them in one step
              if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
                const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
                return { 
                  ...r, 
                  points: newPoints,
                  doors,
                  windows
                };
              }
              
              return { ...r, points: newPoints };
            });
            
            return newRooms;
          });
          
          setTimeout(updateAttachedPoints, 0);
        } else {
          // Regular point movement (non-attached, non-origin) - ONLY move this specific point
          setRooms(prevRooms => {
            const newRooms = prevRooms.map(r => {
              if (r.id !== selectedPoint.roomId) return r;
              
              const newPoints = [...r.points];
              newPoints[pointIndex] = { ...newPoints[pointIndex], x: mousePos.x, y: mousePos.y };
              
              // For completed rooms with doors/windows, update them in one step
              if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
                const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
                return { 
                  ...r, 
                  points: newPoints,
                  doors,
                  windows
                };
              }
              
              return { ...r, points: newPoints };
            });
            
            return newRooms;
          });
          
          setTimeout(updateAttachedPoints, 0);
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
        
        setTimeout(updateAttachedPoints, 0);
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
        
        setTimeout(updateAttachedPoints, 0);
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

  // Helper function to update doors and windows during dragging
const updateDoorsAndWindowsDuringDrag = (room: Room, oldPoints: Point[]): Room => {
  if (!room.isComplete || (room.doors.length === 0 && room.windows.length === 0)) {
    return room;
  }
  
  const updatedRoom = { ...room };
  
  // Update doors within this room
  if (updatedRoom.doors.length > 0) {
    updatedRoom.doors = updatedRoom.doors.map(door => {
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
  }
  
  // Update windows within this room
  if (updatedRoom.windows.length > 0) {
    updatedRoom.windows = updatedRoom.windows.map(window => {
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
  }
  
  return updatedRoom;
};
  
const handleCanvasMouseUp = () => {
  // Clean up dragging state for cabinet runs
  if (draggedRun) {
    const run = cabinetRuns.find(r => r.id === draggedRun.id);
    if (run && run.snapInfo) {
      // Apply final snap adjustments if needed
    }
    setDraggedRun(null);
  }
  
  // Existing cleanup code
  setIsDragging(false);
  setSelectedPoint(null);
  setSelectedDoorPoint(null);
  setSelectedWindowPoint(null);
  setIsPanning(false);
  setLastPanPosition(null);
  setResizingRun(null);
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
  
    // Check for room completion
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
  
      // For main room or conventional completion (clicking near first point)
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
      
      // For secondary rooms - check if first and last points are on the same wall
      if (!activeRoom.isMain && activeRoom.points.length >= 3) {
        const firstPoint = activeRoom.points[0];
        
        // Check if both first and current points are attached to walls
        if (firstPoint.attachedTo && mousePos.attachedTo) {
          // Check if they're attached to the same wall
          if (firstPoint.attachedTo.roomId === mousePos.attachedTo.roomId && 
              firstPoint.attachedTo.wallIndex === mousePos.attachedTo.wallIndex) {
            
            console.log("Closing secondary room - first and last points on same wall");
            
            // Add the new point at the user's clicked position on the wall
            setRooms(prevRooms => {
              return prevRooms.map(room => 
                room.id === activeRoom.id 
                  ? { 
                      ...room, 
                      // Add the last point (snapped to the wall at user's clicked position)
                      points: [...room.points, mousePos],
                      // Mark the room as complete
                      isComplete: true,
                      // Set the flag to indicate no closing wall
                      noClosingWall: true
                    }
                  : room
              );
            });
            
            setIsAddingSecondaryRoom(false);
            return;
          }
        }
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
  // Create a deep copy to avoid direct mutations
  const updatedRooms = JSON.parse(JSON.stringify(rooms));
  let needsUpdate = false;
  let changedRoomPoints = new Map(); // Track which rooms have point changes
  
  // STEP 1: Update all attached points in secondary rooms
  for (let i = 0; i < updatedRooms.length; i++) {
    const room = updatedRooms[i];
    
    // Skip the active room that's being dragged (its points are already being updated)
    if (selectedPoint && room.id === selectedPoint.roomId) continue;
    
    // Store original points before any changes
    const originalPoints = JSON.parse(JSON.stringify(room.points));
    let roomChanged = false;
    
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
          const t = point.attachedTo.t;
          const newX = wallStart.x + t * (wallEnd.x - wallStart.x);
          const newY = wallStart.y + t * (wallEnd.y - wallStart.y);
          
          // Only update if position has changed
          if (point.x !== newX || point.y !== newY) {
            point.x = newX;
            point.y = newY;
            roomChanged = true;
            needsUpdate = true;
          }
        }
      }
    }
    
    // If any point in this room changed, store it for door/window updates
    if (roomChanged) {
      changedRoomPoints.set(room.id, originalPoints);
    }
  }
  
  // STEP 2: Update doors and windows for all rooms that had point changes
  for (let i = 0; i < updatedRooms.length; i++) {
    const room = updatedRooms[i];
    
    // Check if this room's points changed and it has doors/windows to update
    if (room.isComplete && (room.doors.length > 0 || room.windows.length > 0)) {
      // If this room had direct point changes
      if (changedRoomPoints.has(room.id)) {
        const oldPoints = changedRoomPoints.get(room.id);
        const { doors, windows } = getUpdatedDoorsAndWindows(room, room.points, oldPoints);
        updatedRooms[i].doors = doors;
        updatedRooms[i].windows = windows;
        needsUpdate = true;
      } 
      // Check if room points might have moved due to other changes
      else {
        // Create a new deep copy of doors/windows in case they needed updating
        // This handles cases where the room's points didn't change directly
        // but its doors/windows need to be repositioned due to changes in other rooms
        const oldPoints = JSON.parse(JSON.stringify(room.points));
        const { doors, windows } = getUpdatedDoorsAndWindows(room, room.points, oldPoints);
        updatedRooms[i].doors = doors;
        updatedRooms[i].windows = windows;
      }
    }
  }
  
  // Only update state if something changed
  if (needsUpdate) {
    setRooms(updatedRooms);
  }
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
      console.log(`Updating angle at ${roomId}, index ${index}, angle=${newAngle}`);
      updateAngle(roomId, index, newAngle);
      
      // Force an immediate update of secondary rooms
      console.log("Forcing secondary room update after angle change");
      setTimeout(handleForceUpdateSecondaryRooms, 50);
    }
    
    // Clear the editing state
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
      console.log(`Updating wall length at ${roomId}, index ${index}, length=${newLength}`);
      updateWallLength(roomId, index, newLength);
      
      // Force an immediate update of secondary rooms
      console.log("Forcing secondary room update after wall length change");
      setTimeout(handleForceUpdateSecondaryRooms, 50);
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
        console.log(`Updating point at ${roomId}, index ${index}, x=${x}, y=${y}`);
        updatePoint(roomId, index, x, y);
        
        // Force an immediate update of secondary rooms
        console.log("Forcing secondary room update after coordinate change");
        setTimeout(handleForceUpdateSecondaryRooms, 50);
      }
    }
    
    // Clear the editing state
    const newEditingCoordinates = { ...editingCoordinates };
    delete newEditingCoordinates[key];
    setEditingCoordinates(newEditingCoordinates);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const mousePos = getMousePosition(e);
    
    // Check if clicking on a point
    const nearestPoint = findNearestPoint(mousePos);
    if (nearestPoint) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'point',
        data: {
          index: nearestPoint.index,
          point: nearestPoint.point
        }
      });
      return;
    }
    
    // Check if clicking on a line
    const closestLine = findClosestLine(mousePos);
    if (closestLine) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'line',
        data: {
          index: closestLine.wallIndex
        }
      });
      return;
    }
    
    // Close the menu if clicking on empty space
    setContextMenu(null);
  };

  const handleAddPointOnLine = (roomId: string, wallIndex: number, point: Point) => {
    // Find the room
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Insert the new point between the wall's start and end points
    const newPoints = [...room.points];
    newPoints.splice(wallIndex + 1, 0, point);
    
    // Store old points for door/window updates
    const oldPoints = [...room.points];
    
    // Update the room with the new point
    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      
      // For completed rooms with doors/windows, update them in one step
      if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
        const { doors, windows } = getUpdatedDoorsAndWindows(r, newPoints, oldPoints);
        
        // Update doors wall indices after the insertion point
        const updatedDoors = doors.map(door => {
          if (door.wallIndex >= wallIndex + 1) {
            return { ...door, wallIndex: door.wallIndex + 1 };
          }
          return door;
        });
        
        // Update windows wall indices after the insertion point
        const updatedWindows = windows.map(window => {
          if (window.wallIndex >= wallIndex + 1) {
            return { ...window, wallIndex: window.wallIndex + 1 };
          }
          return window;
        });
        
        return { 
          ...r, 
          points: newPoints,
          doors: updatedDoors,
          windows: updatedWindows
        };
      }
      
      return { ...r, points: newPoints };
    }));
    
    // After adding a point, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
    
    // Close the context menu
    setContextMenu(null);
  };


  const handleDeletePoint = (roomId: string, pointIndex: number) => {
    // Find the room
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Can't delete points if there are fewer than 4 points in a completed room
    // or fewer than 2 points in an incomplete room
    if ((room.isComplete && room.points.length <= 4) || 
        (!room.isComplete && room.points.length <= 2)) {
      alert('Cannot delete point: minimum number of points reached');
      setContextMenu(null);
      return;
    }
    
    // Store old points for door/window updates
    const oldPoints = [...room.points];
    
    // Remove the point
    const newPoints = room.points.filter((_, index) => index !== pointIndex);
    
    // Update the room without the deleted point
    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      
      // For completed rooms with doors/windows, update them in one step
      if (r.isComplete && (r.doors.length > 0 || r.windows.length > 0)) {
        // Remove doors and windows on the deleted wall
        let updatedDoors = r.doors.filter(door => door.wallIndex !== pointIndex);
        let updatedWindows = r.windows.filter(window => window.wallIndex !== pointIndex);
        
        // Update wall indices for doors and windows after the deleted point
        updatedDoors = updatedDoors.map(door => {
          if (door.wallIndex > pointIndex) {
            return { ...door, wallIndex: door.wallIndex - 1 };
          }
          return door;
        });
        
        updatedWindows = updatedWindows.map(window => {
          if (window.wallIndex > pointIndex) {
            return { ...window, wallIndex: window.wallIndex - 1 };
          }
          return window;
        });
        
        // Update the positions of doors and windows that remain
        const { doors, windows } = getUpdatedDoorsAndWindows(
          { ...r, doors: updatedDoors, windows: updatedWindows },
          newPoints, 
          oldPoints
        );
        
        return { 
          ...r, 
          points: newPoints,
          doors,
          windows
        };
      }
      
      return { ...r, points: newPoints };
    }));
    
    // After deleting a point, update attached points from other rooms
    setTimeout(updateAttachedPoints, 0);
    
    // Close the context menu
    setContextMenu(null);
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
        
        // Only close the path if the room is complete and doesn't have the noClosingWall flag
        if (room.isComplete && !room.noClosingWall) {
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
  
    // Draw cabinet runs
    cabinetRuns.forEach(run => {
      // Save canvas state
      ctx.save();
      
      // Get corners based on the rear-left reference point
      const corners = calculateRunCorners(run);
      
      const rearLeft = worldToScreen(run.start_pos_x, run.start_pos_y);
    
      // Transform for rotation around left rear corner
      ctx.translate(rearLeft.x, rearLeft.y);
      ctx.rotate((-run.rotation_z * Math.PI) / 180);
      
      // Calculate dimensions in screen coordinates
      const width = run.length * scale;
      const height = -run.depth * scale;
      
      // Calculate visual height for 3D effect based on run type
      const visualHeight = run.type === 'Base' ? DEFAULT_BASE_HEIGHT * scale : DEFAULT_UPPER_HEIGHT * scale;
      
      // Draw 3D effect for runs
      if (run.type === 'Upper') {
        // Upper cabinets with shadow
        ctx.fillStyle = 'rgba(220, 220, 230, 0.2)';
        ctx.fillRect(0, -visualHeight, width, 0); // From rear wall to ceiling
      }
      
      // Draw main cabinet body - starting from rear-left corner
      ctx.beginPath();
      ctx.rect(0, 0, width, -height); // Negative height to draw upward from rear wall
      
      // Fill with color based on type
      if (run.type === 'Base') {
        ctx.fillStyle = 'rgba(255, 240, 220, 0.6)'; // Light wooden color for base
      } else {
        ctx.fillStyle = 'rgba(240, 245, 255, 0.6)'; // Light blue-ish for upper
      }
      ctx.fill();
      
      // Stroke with color based on selection state
      ctx.strokeStyle = selectedRun === run.id ? '#dc2626' : run.type === 'Base' ? '#d97706' : '#3b82f6';
      ctx.lineWidth = selectedRun === run.id ? 3 : 2;
      ctx.stroke();
  
      // Add a subtle visual cue if the run is being hovered over
      if (hoverRun === run.id) {
        // Draw a subtle highlight around the run
        ctx.beginPath();
        ctx.rect(-5, 5, width + 10, -(height + 10));
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; // Light blue highlight
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 2]); // Dotted outline
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern
      }
  
      // Draw rear wall with dashed line (already at bottom-left of rear wall)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(width, 0);
      ctx.setLineDash([5, 3]); // Set dashed line pattern
      ctx.strokeStyle = '#4B5563'; // Dark gray for rear wall
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash pattern for subsequent drawing
      
      // Draw visual cues for start and end types
      if (run.start_type === 'Wall') {
        // Draw wall indicator at start
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -height);
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      
      if (run.end_type === 'Wall') {
        // Draw wall indicator at end
        ctx.beginPath();
        ctx.moveTo(width, 0);
        ctx.lineTo(width, -height);
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      
      // Draw island indicator if applicable
      if (run.is_island) {
        const centerX = width / 2;
        const centerY = -height / 2;
        const radius = Math.min(width, height) * 0.1;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#8b5cf6'; // Purple for island indicator
        ctx.fill();
      }
      
      // Draw top filler indicator if applicable
      if (run.top_filler) {
        ctx.beginPath();
        ctx.moveTo(0, -height);
        ctx.lineTo(width, -height);
        ctx.strokeStyle = '#059669'; // Green for top filler
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      
      // Draw snap indicator if snapping
      if (run.snapInfo?.isSnapped) {
        const edgeName = run.snapInfo.snappedEdge;
        
        ctx.beginPath();
        if (edgeName === 'rear') {
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -height);
        } 
        // else if (edgeName === 'right') {
        //   ctx.moveTo(width, 0);
        //   ctx.lineTo(width, -height);
        // } else if (edgeName === 'top') {
        //   ctx.moveTo(0, -height);
        //   ctx.lineTo(width, -height);
        // } else if (edgeName === 'bottom') {
        //   ctx.moveTo(0, 0);
        //   ctx.lineTo(width, 0);
        // }
        
        ctx.strokeStyle = '#10b981'; // Green for snap indicator
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      
      // Draw run ID and dimensions
      ctx.font = '12px Arial';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw run ID
      const runNumber = run.id;
      ctx.fillText(`Run ${runNumber} (${run.type})`, width / 2, -height / 2);
      
      // Draw dimensions below
      ctx.fillText(`${Math.round(run.length)}mm × ${Math.round(run.depth)}mm`, width / 2, -height / 2 + 16);
      
      // Restore canvas state
      ctx.restore();
    });
  };

  useEffect(() => {
    drawRoom();
  }, [rooms, selectedPoint, activeRoomId, pan, scale, selectedDoorPoint, selectedWindowPoint, addingDoor, addingWindow, cabinetRuns, selectedRun, draggedRun, isAddingRun]);

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
              onClick={startAddingRun}
              disabled={!rooms.some(r => r.isMain && r.isComplete) || isAddingRun}
              className="flex items-center gap-2 px-4 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BookmarkPlus size={16} />
              {isAddingRun ? 'Adding Cabinet Run...' : 'Add Cabinet Run'}
            </button>
            <button
            onClick={() => {
              setRooms([]);
              setActiveRoomId(null);
              setIsAddingSecondaryRoom(false);
              setCabinetRuns([]); // Add this line to clear cabinet runs
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

        {isAddingRun && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-amber-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-amber-800">Adding Cabinet Run</h3>
                <p className="text-sm text-amber-700">
                  Click in the room where you want to place the cabinet run. It will snap to walls when placed nearby.
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex items-center">
                    <label htmlFor="runType" className="mr-2 text-sm text-amber-800">Type:</label>
                    <select
                      id="runType"
                      value={newRunType}
                      onChange={(e) => setNewRunType(e.target.value as 'Base' | 'Upper')}
                      className="px-2 py-1 border border-amber-300 rounded bg-white"
                    >
                      <option value="Base">Base</option>
                      <option value="Upper">Upper</option>
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsAddingRun(false)}
                className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH_px}
          height={CANVAS_HEIGHT_px}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          className="border border-gray-300 rounded cursor-crosshair"
        />

{contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          {contextMenu.type === 'point' && (
            <div>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                onClick={() => {
                  const pointInfo = contextMenu.data;
                  if (pointInfo && pointInfo.point) {
                    const roomId = pointInfo.point.roomId || 
                                  (activeRoomId ? activeRoomId : rooms.find(r => r.isMain)?.id || '');
                    handleDeletePoint(roomId, pointInfo.index);
                  }
                }}
              >
                Delete Point
              </button>
            </div>
          )}
          {contextMenu.type === 'line' && (
            <div>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                onClick={() => {
                  const closestLine = findClosestLine(getMousePosition({
                    clientX: contextMenu.x,
                    clientY: contextMenu.y
                  } as React.MouseEvent<HTMLCanvasElement>));
                  
                  if (closestLine) {
                    handleAddPointOnLine(closestLine.roomId, closestLine.wallIndex, closestLine.point);
                  }
                }}
              >
                Add Point
              </button>
            </div>
          )}
        </ContextMenu>
      )}  
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

    {cabinetRuns.length > 0 && (
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Cabinet Runs</h2>
          
          <select
            value={selectedRun || ''}
            onChange={(e) => setSelectedRun(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded"
          >
            <option value="">Select Cabinet Run</option>
            {cabinetRuns.map(run => (
              <option key={run.id} value={run.id}>
                Run {run.id.split('-')[1]} ({run.type})
              </option>
            ))}
          </select>
        </div>

        {selectedRun ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Position properties */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    X Position (Rear Left Corner) (mm)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="number"
                      value={Math.round(cabinetRuns.find(r => r.id === selectedRun)?.start_pos_x || 0)}
                      onChange={(e) => updateRunProperty(selectedRun, 'start_pos_x', Number(e.target.value))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Y Position (Rear Left Corner) (mm)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="number"
                      value={Math.round(cabinetRuns.find(r => r.id === selectedRun)?.start_pos_y || 0)}
                      onChange={(e) => updateRunProperty(selectedRun, 'start_pos_y', Number(e.target.value))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                  </td>
                </tr>
                
                {/* Dimension properties */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Length (mm)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="number"
                      value={Math.round(cabinetRuns.find(r => r.id === selectedRun)?.length || 0)}
                      onChange={(e) => updateRunProperty(selectedRun, 'length', Number(e.target.value))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Depth (mm)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="number"
                      value={Math.round(cabinetRuns.find(r => r.id === selectedRun)?.depth || 0)}
                      onChange={(e) => updateRunProperty(selectedRun, 'depth', Number(e.target.value))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                  </td>
                </tr>
                
                {/* Rotation property */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Rotation (°)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-2">
                    <input
                      type="number"
                      value={Math.round(cabinetRuns.find(r => r.id === selectedRun)?.rotation_z || 0)}
                      onChange={(e) => updateRunProperty(selectedRun, 'rotation_z', Number(e.target.value))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                    <button 
                      onClick={() => rotateRun(selectedRun, -90)}
                      className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                      title="Rotate 90° Counter-Clockwise"
                    >
                      -90°
                    </button>
                    <button 
                      onClick={() => rotateRun(selectedRun, 90)}
                      className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                      title="Rotate 90° Clockwise"
                    >
                      +90°
                    </button>
                  </td>
                </tr>
                
                {/* Type properties */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Type
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select
                      value={cabinetRuns.find(r => r.id === selectedRun)?.type || 'Base'}
                      onChange={(e) => updateRunProperty(selectedRun, 'type', e.target.value)}
                      className="w-32 px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="Base">Base</option>
                      <option value="Upper">Upper</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Start Type
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select
                      value={cabinetRuns.find(r => r.id === selectedRun)?.start_type || 'Open'}
                      onChange={(e) => updateRunProperty(selectedRun, 'start_type', e.target.value)}
                      className="w-32 px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="Open">Open</option>
                      <option value="Wall">Wall</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    End Type
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select
                      value={cabinetRuns.find(r => r.id === selectedRun)?.end_type || 'Open'}
                      onChange={(e) => updateRunProperty(selectedRun, 'end_type', e.target.value)}
                      className="w-32 px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="Open">Open</option>
                      <option value="Wall">Wall</option>
                    </select>
                  </td>
                </tr>
                
                {/* Boolean properties */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Top Filler
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="checkbox"
                      checked={cabinetRuns.find(r => r.id === selectedRun)?.top_filler || false}
                      onChange={() => toggleRunProperty(selectedRun, 'top_filler')}
                      className="w-4 h-4 border border-gray-300 rounded"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Is Island
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="checkbox"
                      checked={cabinetRuns.find(r => r.id === selectedRun)?.is_island || false}
                      onChange={() => toggleRunProperty(selectedRun, 'is_island')}
                      className="w-4 h-4 border border-gray-300 rounded"
                    />
                  </td>
                </tr>
                
                {/* Actions */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    Actions
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button
                      onClick={() => deleteRun(selectedRun)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">Select a cabinet run to edit its properties</p>
        )}
      </div>
    )}
  </div>
);
};

export default RoomDesigner;