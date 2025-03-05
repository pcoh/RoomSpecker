import React, { useState, useRef, useEffect } from 'react';
import { Copy, RotateCcw, Save, Send, DoorOpen, Square } from 'lucide-react';
import ContextMenu from './ContextMenu';
import roomApi from '../services/api';

interface Point {
  x: number;
  y: number;
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
  position: number; // Position in mm from the start of the wall
}

interface Window {
  wallIndex: number;
  startPoint: Point;
  endPoint: Point;
  width: number;
  height: number;
  sillHeight: number;
  position: number; // Position in mm from the start of the wall
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
const SNAP_DISTANCE = 15;
const MIN_SCALE = 0.025;
const MAX_SCALE = 2.0;
const ZOOM_FACTOR = 1.1;
const LABEL_OFFSET = 20;
const DEFAULT_DOOR_WIDTH = 900; // 90cm in mm
const DEFAULT_WINDOW_WIDTH = 1000; // 100cm in mm
const DEFAULT_WINDOW_HEIGHT = 1200; // 120cm in mm
const DEFAULT_WINDOW_SILL_HEIGHT = 900; // 90cm in mm

// Define canvas dimensions in millimeters (10m x 8m)
const CANVAS_WIDTH_MM = 10000; // 10 meters in mm
const CANVAS_HEIGHT_MM = 8000; // 8 meters in mm

const RoomDesigner: React.FC = () => {
  const [points, setPoints] = useState<Point[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedDoorPoint, setSelectedDoorPoint] = useState<{doorIndex: number, pointType: 'start' | 'end'} | null>(null);
  const [selectedWindowPoint, setSelectedWindowPoint] = useState<{windowIndex: number, pointType: 'start' | 'end'} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<Point | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Initial scale to fit the 10m x 8m area
  const [scale, setScale] = useState(0.08); // Adjusted to fit 10m x 8m
  const [editingAngles, setEditingAngles] = useState<{ [key: number]: string }>({});
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [externalApiUrl, setExternalApiUrl] = useState<string>('');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [addingDoor, setAddingDoor] = useState(false);
  const [doorStartPoint, setDoorStartPoint] = useState<{wallIndex: number, point: Point} | null>(null);
  const [addingWindow, setAddingWindow] = useState(false);
  const [windowStartPoint, setWindowStartPoint] = useState<{wallIndex: number, point: Point} | null>(null);
  const [windowHeight, setWindowHeight] = useState<number>(DEFAULT_WINDOW_HEIGHT);
  const [windowSillHeight, setWindowSillHeight] = useState<number>(DEFAULT_WINDOW_SILL_HEIGHT);

  // Convert screen coordinates to world coordinates
  // Note: Y is now inverted to make Y-axis point up
  const screenToWorld = (screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    return {
      x: (screenX - pan.x) / scale,
      y: ((canvas.height - screenY) - pan.y) / scale // Invert Y to make it point up
    };
  };

  // Convert world coordinates to screen coordinates
  // Note: Y is now inverted to make Y-axis point up
  const worldToScreen = (worldX: number, worldY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    return {
      x: worldX * scale + pan.x,
      y: canvas.height - (worldY * scale + pan.y) // Invert Y to make it point up
    };
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

    // Adjust pan to keep the point under the mouse in the same position
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

  const resetRoom = () => {
    setPoints([]);
    setDoors([]);
    setWindows([]);
    setIsComplete(false);
    setSelectedPoint(null);
    setSelectedDoorPoint(null);
    setSelectedWindowPoint(null);
    setEditingAngles({});
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    setIsPanning(false);
    setLastPanPosition(null);
    setScale(0.08);
    setAddingDoor(false);
    setDoorStartPoint(null);
    setAddingWindow(false);
    setWindowStartPoint(null);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoom();
  };

  // Safe logging function to prevent DataCloneError
  const safeLog = (message: string, data: any) => {
    try {
      // Create a safe copy with only serializable data
      const safeData = JSON.parse(JSON.stringify(data));
      console.log(message, safeData);
    } catch (error) {
      console.log(message, "Data contained non-serializable values");
    }
  };

  const saveRoom = async () => {
    if (!isComplete || points.length < 3) {
      alert('Please complete the room design first');
      return;
    }

    if (isSaving) return;

    try {
      setIsSaving(true);
      
      // Create a simple data structure with only primitive values
      const roomData = {
        name: `Room ${new Date().toLocaleString()}`,
        points: points.map(point => ({
          x: Math.round(point.x),
          y: Math.round(point.y)
        }))
      };

      const result = await roomApi.saveRoom(roomData);
      alert('Room saved successfully!');
      safeLog('Saved room:', result);
    } catch (error) {
      console.error('Error saving room:', error instanceof Error ? error.message : String(error));
      alert('Error saving room');
    } finally {
      setIsSaving(false);
    }
  };

  const processRoom = async () => {
    if (!isComplete || points.length < 3) {
      alert('Please complete the room design first');
      return;
    }

    if (isProcessing) return;

    try {
      setIsProcessing(true);
      
      // Create a simple data structure with only primitive values
      const roomData = {
        points: points.map(point => ({
          x: Math.round(point.x),
          y: Math.round(point.y)
        }))
      };

      // If external API URL is set, send to that endpoint
      if (externalApiUrl) {
        const response = await roomApi.sendToExternalApi(roomData, externalApiUrl);
        safeLog('Sent to external API:', response);
        alert('Room data sent to external API successfully!');
      } else {
        // Otherwise use the default endpoint
        const response = await roomApi.processRoom(roomData);
        safeLog('Processed room:', response);
        alert('Room processed successfully! Check the console for details.');
      }
    } catch (error) {
      console.error('Error processing room:', error instanceof Error ? error.message : String(error));
      alert('Error processing room');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateWallData = (): WallData[] => {
    if (points.length < 2) return [];
    
    return points.map((point, index) => {
      const nextPoint = points[(index + 1) % points.length];
      const prevPoint = points[(index - 1 + points.length) % points.length];
      
      const dx = nextPoint.x - point.x;
      const dy = nextPoint.y - point.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (points.length > 2) {
        // With Y-axis pointing up, we need to adjust angle calculation
        const vector1 = {
          x: prevPoint.x - point.x,
          y: prevPoint.y - point.y
        };
        const vector2 = {
          x: nextPoint.x - point.x,
          y: nextPoint.y - point.y
        };
        
        // Calculate the angle between vectors using the cross product and dot product
        // Note: With Y-axis pointing up, positive angles are counterclockwise
        let angle = Math.atan2(
          vector1.x * vector2.y - vector1.y * vector2.x,
          vector1.x * vector2.x + vector1.y * vector2.y
        ) * (180 / Math.PI);
        
        // Adjust angle to be positive (0-360 degrees)
        // With Y-axis pointing up, we need to flip the sign
        angle = -angle;
        if (angle < 0) angle += 360;

        return { length, angle };
      }
      
      return { length, angle: 0 };
    });
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

  const findClosestLine = (mousePos: Point): { index: number, point: Point, t: number } | null => {
    if (points.length < 2 || !isComplete) return null;

    let closestDist = Infinity;
    let closestIndex = -1;
    let closestPoint: Point | null = null;
    let closestT = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
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
        closestIndex = i;
        closestPoint = pointOnLine;
        closestT = t;
      }
    }

    if (closestDist < SNAP_DISTANCE / scale && closestPoint) {
      return { index: closestIndex, point: closestPoint, t: closestT };
    }

    return null;
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isComplete) return;

    const mousePos = getMousePosition(e);
    const pointIndex = findNearestPoint(mousePos);
    
    if (pointIndex !== null && pointIndex !== 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'point',
        data: { index: pointIndex }
      });
      return;
    }

    const closestLine = findClosestLine(mousePos);
    if (closestLine) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'line',
        data: { 
          index: closestLine.index,
          point: closestLine.point
        }
      });
    }
  };

  const handleAddPoint = (index: number, point: Point) => {
    const newPoints = [...points];
    newPoints.splice(index + 1, 0, point);
    setPoints(newPoints);
  };

  const handleRemovePoint = (index: number) => {
    if (index === 0 || points.length <= 3) return;
    const newPoints = points.filter((_, i) => i !== index);
    setPoints(newPoints);
  };

  const findNearestDoorPoint = (mousePos: Point): {doorIndex: number, pointType: 'start' | 'end'} | null => {
    for (let i = 0; i < doors.length; i++) {
      const door = doors[i];
      
      // Check start point
      const startDist = Math.sqrt(
        Math.pow(mousePos.x - door.startPoint.x, 2) + 
        Math.pow(mousePos.y - door.startPoint.y, 2)
      );
      
      if (startDist < DOOR_POINT_RADIUS * 2 / scale) {
        return { doorIndex: i, pointType: 'start' };
      }
      
      // Check end point
      const endDist = Math.sqrt(
        Math.pow(mousePos.x - door.endPoint.x, 2) + 
        Math.pow(mousePos.y - door.endPoint.y, 2)
      );
      
      if (endDist < DOOR_POINT_RADIUS * 2 / scale) {
        return { doorIndex: i, pointType: 'end' };
      }
    }
    
    return null;
  };

  const findNearestWindowPoint = (mousePos: Point): {windowIndex: number, pointType: 'start' | 'end'} | null => {
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      
      // Check start point
      const startDist = Math.sqrt(
        Math.pow(mousePos.x - window.startPoint.x, 2) + 
        Math.pow(mousePos.y - window.startPoint.y, 2)
      );
      
      if (startDist < WINDOW_POINT_RADIUS * 2 / scale) {
        return { windowIndex: i, pointType: 'start' };
      }
      
      // Check end point
      const endDist = Math.sqrt(
        Math.pow(mousePos.x - window.endPoint.x, 2) + 
        Math.pow(mousePos.y - window.endPoint.y, 2)
      );
      
      if (endDist < WINDOW_POINT_RADIUS * 2 / scale) {
        return { windowIndex: i, pointType: 'end' };
      }
    }
    
    return null;
  };

  const startAddingDoor = () => {
    if (!isComplete || points.length < 3) {
      alert('Please complete the room design first');
      return;
    }
    
    setAddingDoor(true);
    setDoorStartPoint(null);
  };

  const startAddingWindow = () => {
    if (!isComplete || points.length < 3) {
      alert('Please complete the room design first');
      return;
    }
    
    setAddingWindow(true);
    setWindowStartPoint(null);
  };

  const addDoor = (wallIndex: number, startPoint: Point, endPoint: Point) => {
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Calculate door width
    const width = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    // Calculate position along the wall in mm from start
    const startDist = Math.sqrt(
      Math.pow(startPoint.x - p1.x, 2) + 
      Math.pow(startPoint.y - p1.y, 2)
    );
    
    const newDoor: Door = {
      wallIndex,
      startPoint,
      endPoint,
      width,
      position: startDist // Position in mm from wall start
    };
    
    setDoors([...doors, newDoor]);
  };

  const addWindow = (wallIndex: number, startPoint: Point, endPoint: Point) => {
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Calculate window width
    const width = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    // Calculate position along the wall in mm from start
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
      position: startDist // Position in mm from wall start
    };
    
    setWindows([...windows, newWindow]);
  };

  const removeDoor = (index: number) => {
    const newDoors = doors.filter((_, i) => i !== index);
    setDoors(newDoors);
  };

  const removeWindow = (index: number) => {
    const newWindows = windows.filter((_, i) => i !== index);
    setWindows(newWindows);
  };

  const updateDoorWidth = (doorIndex: number, newWidth: number) => {
    if (newWidth <= 0) return;
    
    const newDoors = [...doors];
    const door = newDoors[doorIndex];
    const wallIndex = door.wallIndex;
    
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Calculate wall direction vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize direction vector
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;
    
    // Keep the start point fixed and only move the end point
    const startPoint = door.startPoint;
    
    // Calculate new end point based on the new width
    const endPoint = {
      x: startPoint.x + newWidth * dirX,
      y: startPoint.y + newWidth * dirY
    };
    
    // Update door
    door.endPoint = endPoint;
    door.width = newWidth;
    
    setDoors(newDoors);
  };

  const updateDoorPosition = (doorIndex: number, newPosition: number) => {
    if (newPosition < 0) return;
    
    const newDoors = [...doors];
    const door = newDoors[doorIndex];
    const wallIndex = door.wallIndex;
    
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Calculate wall direction vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    
    if (newPosition + door.width > wallLength) {
      newPosition = wallLength - door.width;
    }
    
    // Normalize direction vector
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;
    
    // Calculate new start point based on the new position
    const startPoint = {
      x: p1.x + newPosition * dirX,
      y: p1.y + newPosition * dirY
    };
    
    // Calculate new end point based on the door width
    const endPoint = {
      x: startPoint.x + door.width * dirX,
      y: startPoint.y + door.width * dirY
    };
    
    // Update door
    door.startPoint = startPoint;
    door.endPoint = endPoint;
    door.position = newPosition;
    
    setDoors(newDoors);
  };

  const updateWindowWidth = (windowIndex: number, newWidth: number) => {
    if (newWidth <= 0) return;
    
    const newWindows = [...windows];
    const window = newWindows[windowIndex];
    const wallIndex = window.wallIndex;
    
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Calculate wall direction vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize direction vector
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;
    
    // Keep the start point fixed and only move the end point
    const startPoint = window.startPoint;
    
    // Calculate new end point based on the new width
    const endPoint = {
      x: startPoint.x + newWidth * dirX,
      y: startPoint.y + newWidth * dirY
    };
    
    // Update window
    window.endPoint = endPoint;
    window.width = newWidth;
    
    setWindows(newWindows);
  };

  const updateWindowPosition = (windowIndex: number, newPosition: number) => {
    if (newPosition < 0) return;
    
    const newWindows = [...windows];
    const window = newWindows[windowIndex];
    const wallIndex = window.wallIndex;
    
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Calculate wall direction vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    
    if (newPosition + window.width > wallLength) {
      newPosition = wallLength - window.width;
    }
    
    // Normalize direction vector
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;
    
    // Calculate new start point based on the new position
    const startPoint = {
      x: p1.x + newPosition * dirX,
      y: p1.y + newPosition * dirY
    };
    
    // Calculate new end point based on the window width
    const endPoint = {
      x: startPoint.x + window.width * dirX,
      y: startPoint.y + window.width * dirY
    };
    
    // Update window
    window.startPoint = startPoint;
    window.endPoint = endPoint;
    window.position = newPosition;
    
    setWindows(newWindows);
  };

  const updateWindowHeight = (windowIndex: number, newHeight: number) => {
    if (newHeight <= 0) return;
    
    const newWindows = [...windows];
    const window = newWindows[windowIndex];
    
    // Update window height
    window.height = newHeight;
    
    setWindows(newWindows);
  };

  const updateWindowSillHeight = (windowIndex: number, newSillHeight: number) => {
    if (newSillHeight < 0) return;
    
    const newWindows = [...windows];
    const window = newWindows[windowIndex];
    
    // Update window sill height
    window.sillHeight = newSillHeight;
    
    setWindows(newWindows);
  };

  const moveDoorPoint = (doorIndex: number, pointType: 'start' | 'end', newPoint: Point) => {
    const newDoors = [...doors];
    const door = newDoors[doorIndex];
    const wallIndex = door.wallIndex;
    
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Find closest point on the wall line
    const closestPoint = findClosestPointOnLine(newPoint, p1, p2);
    if (!closestPoint) return;
    
    if (pointType === 'start') {
      // Update start point
      door.startPoint = closestPoint;
      
      // Calculate new position from wall start
      door.position = Math.sqrt(
        Math.pow(closestPoint.x - p1.x, 2) + 
        Math.pow(closestPoint.y - p1.y, 2)
      );
      
      // Recalculate width based on distance to end point
      door.width = Math.sqrt(
        Math.pow(door.endPoint.x - closestPoint.x, 2) + 
        Math.pow(door.endPoint.y - closestPoint.y, 2)
      );
    } else {
      // Update end point
      door.endPoint = closestPoint;
      
      // Recalculate width based on distance from start point
      door.width = Math.sqrt(
        Math.pow(closestPoint.x - door.startPoint.x, 2) + 
        Math.pow(closestPoint.y - door.startPoint.y, 2)
      );
    }
    
    setDoors(newDoors);
  };

  const moveWindowPoint = (windowIndex: number, pointType: 'start' | 'end', newPoint: Point) => {
    const newWindows = [...windows];
    const window = newWindows[windowIndex];
    const wallIndex = window.wallIndex;
    
    const p1 = points[wallIndex];
    const p2 = points[(wallIndex + 1) % points.length];
    
    // Find closest point on the wall line
    const closestPoint = findClosestPointOnLine(newPoint, p1, p2);
    if (!closestPoint) return;
    
    if (pointType === 'start') {
      // Update start point
      window.startPoint = closestPoint;
      
      // Calculate new position from wall start
      window.position = Math.sqrt(
        Math.pow(closestPoint.x - p1.x, 2) + 
        Math.pow(closestPoint.y - p1.y, 2)
      );
      
      // Recalculate width based on distance to end point
      window.width = Math.sqrt(
        Math.pow(window.endPoint.x - closestPoint.x, 2) + 
        Math.pow(window.endPoint.y - closestPoint.y, 2)
      );
    } else {
      // Update end point
      window.endPoint = closestPoint;
      
      // Recalculate width based on distance from start point
      window.width = Math.sqrt(
        Math.pow(closestPoint.x - window.startPoint.x, 2) + 
        Math.pow(closestPoint.y - window.startPoint.y, 2)
      );
    }
    
    setWindows(newWindows);
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
    
    // Draw grid with 1 meter spacing (1000mm)
    const gridSizeMM = 1000; // 1 meter in mm
    const gridSizePixels = gridSizeMM * scale;
    
    const offsetX = pan.x % gridSizePixels;
    const offsetY = pan.y % gridSizePixels;
    
    // Draw grid lines
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
    
    // Draw meter labels on grid
    ctx.font = '10px Arial';
    ctx.fillStyle = '#999';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // X-axis labels (meters)
    const startX = Math.floor((0 - pan.x) / (scale * gridSizeMM));
    const endX = Math.ceil((canvas.width - pan.x) / (scale * gridSizeMM));
    
    for (let i = startX; i <= endX; i++) {
      const x = i * gridSizeMM * scale + pan.x;
      if (x >= 0 && x < canvas.width) {
        ctx.fillText(`${i}m`, x + 2, canvas.height - 15);
      }
    }
    
    // Y-axis labels (meters)
    const startY = Math.floor((0 - pan.y) / (scale * gridSizeMM));
    const endY = Math.ceil((canvas.height - pan.y) / (scale * gridSizeMM));
    
    for (let i = startY; i <= endY; i++) {
      const y = canvas.height - (i * gridSizeMM * scale + pan.y);
      if (y >= 0 && y < canvas.height) {
        ctx.fillText(`${i}m`, 2, y - 15);
      }
    }

    if (points.length > 0) {
      ctx.beginPath();
      const firstScreenPoint = worldToScreen(points[0].x, points[0].y);
      ctx.moveTo(firstScreenPoint.x, firstScreenPoint.y);
      
      points.forEach((point, index) => {
        if (index > 0) {
          const screenPoint = worldToScreen(point.x, point.y);
          ctx.lineTo(screenPoint.x, screenPoint.y);
        }
      });
      
      if (isComplete) {
        ctx.closePath();
      }
      // ctx.strokeStyle = '#2563eb';
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw axes with thinner, lighter lines
      const origin = worldToScreen(0, 0);
      
      // X-axis
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(canvas.width, origin.y);
      ctx.stroke();
      
      // X-axis arrow
      ctx.beginPath();
      ctx.moveTo(canvas.width - 10, origin.y - 5);
      ctx.lineTo(canvas.width, origin.y);
      ctx.lineTo(canvas.width - 10, origin.y + 5);
      ctx.stroke();
      
      // X-axis label
      ctx.font = '12px Arial';
      ctx.fillStyle = '#999999';
      ctx.textAlign = 'right';
      ctx.fillText('X (mm)', canvas.width - 15, origin.y - 10);
      
      // Y-axis
      ctx.beginPath();
      ctx.moveTo(origin.x, canvas.height);
      ctx.lineTo(origin.x, 0);
      ctx.stroke();
      
      // Y-axis arrow
      ctx.beginPath();
      ctx.moveTo(origin.x - 5, 10);
      ctx.lineTo(origin.x, 0);
      ctx.lineTo(origin.x + 5, 10);
      ctx.stroke();
      
      // Y-axis label
      ctx.textAlign = 'left';
      ctx.fillText('Y (mm)', origin.x + 10, 20);
    }

    // Draw doors
    doors.forEach((door, index) => {
      const startScreen = worldToScreen(door.startPoint.x, door.startPoint.y);
      const endScreen = worldToScreen(door.endPoint.x, door.endPoint.y);
      
      // Draw door line
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(endScreen.x, endScreen.y);
      ctx.strokeStyle = '#10b981'; // Green color for doors
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Draw door points
      const isStartSelected = selectedDoorPoint && 
                             selectedDoorPoint.doorIndex === index && 
                             selectedDoorPoint.pointType === 'start';
      
      const isEndSelected = selectedDoorPoint && 
                           selectedDoorPoint.doorIndex === index && 
                           selectedDoorPoint.pointType === 'end';
      
      // Draw start point
      ctx.beginPath();
      ctx.arc(startScreen.x, startScreen.y, DOOR_POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isStartSelected ? '#dc2626' : '#10b981';
      ctx.fill();
      
      // Draw end point
      ctx.beginPath();
      ctx.arc(endScreen.x, endScreen.y, DOOR_POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isEndSelected ? '#dc2626' : '#10b981';
      ctx.fill();
      
      // Draw door width label
      const midX = (startScreen.x + endScreen.x) / 2;
      const midY = (startScreen.y + endScreen.y) / 2;
      
      ctx.font = '12px Arial';
      ctx.fillStyle = '#10b981';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(door.width)}mm`, midX, midY - 15);
    });

    // Draw windows
    windows.forEach((window, index) => {
      const startScreen = worldToScreen(window.startPoint.x, window.startPoint.y);
      const endScreen = worldToScreen(window.endPoint.x, window.endPoint.y);
      
      // Draw window line
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(endScreen.x, endScreen.y);
      ctx.strokeStyle = '#3b82f6'; // Blue color for windows
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Draw window points
      const isStartSelected = selectedWindowPoint && 
                             selectedWindowPoint.windowIndex === index && 
                             selectedWindowPoint.pointType === 'start';
      
      const isEndSelected = selectedWindowPoint && 
                           selectedWindowPoint.windowIndex === index && 
                           selectedWindowPoint.pointType === 'end';
      
      // Draw start point
      ctx.beginPath();
      ctx.arc(startScreen.x, startScreen.y, WINDOW_POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isStartSelected ? '#dc2626' : '#3b82f6';
      ctx.fill();
      
      // Draw end point
      ctx.beginPath();
      ctx.arc(endScreen.x, endScreen.y, WINDOW_POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isEndSelected ? '#dc2626' : '#3b82f6';
      ctx.fill();
      
      // Draw window width label
      const midX = (startScreen.x + endScreen.x) / 2;
      const midY = (startScreen.y + endScreen.y) / 2;
      
      ctx.font = '12px Arial';
      ctx.fillStyle = '#3b82f6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(window.width)}mm × ${Math.round(window.height)}mm`, midX, midY - 15);
    });

    const wallData = calculateWallData();
    points.forEach((point, index) => {
      const screenPoint = worldToScreen(point.x, point.y);
      
      ctx.beginPath();
      ctx.arc(screenPoint.x, screenPoint.y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = selectedPoint === index ? '#dc2626' : '#888888';
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

      if (wallData[index] && points.length > 2 && index > 0) {
        const angle = wallData[index].angle.toFixed(1);
        
        const prevPoint = worldToScreen(points[(index - 1 + points.length) % points.length].x, points[(index - 1 + points.length) % points.length].y);
        const nextPoint = worldToScreen(points[(index + 1) % points.length].x, points[(index + 1) % points.length].y);
        
        const v1 = {
          x: prevPoint.x - screenPoint.x,
          y: prevPoint.y - screenPoint.y
        };
        const v2 = {
          x: nextPoint.x - screenPoint.x,
          y: nextPoint.y - screenPoint.y
        };
        
        const bisectorX = (v1.x / Math.hypot(v1.x, v1.y) + v2.x / Math.hypot(v2.x, v2.y)) / 2;
        const bisectorY = (v1.y / Math.hypot(v1.x, v1.y) + v2.y / Math.hypot(v2.x, v2.y)) / 2;
        
        const labelDistance = LABEL_OFFSET * 1.5;
        const angleLabelX = screenPoint.x + bisectorX * labelDistance;
        const angleLabelY = screenPoint.y + bisectorY * labelDistance;
        
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${angle}°`, angleLabelX, angleLabelY);
      }
    });
  };

  useEffect(() => {
    drawRoom();
  }, [points, selectedPoint, isComplete, pan, scale, doors, selectedDoorPoint, windows, selectedWindowPoint, addingDoor, addingWindow]);

  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return screenToWorld(screenX, screenY);
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

  const findNearestPoint = (mousePos: Point): number | null => {
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const distance = Math.sqrt(
        Math.pow(mousePos.x - point.x, 2) + Math.pow(mousePos.y - point.y, 2)
      );
      if (distance < POINT_RADIUS * 2 / scale) {
        return i;
      }
    }
    return null;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isComplete && !addingDoor && !addingWindow) return;

    const mousePos = getMousePosition(e);
    
    // Check if we're adding a door
    if (addingDoor) {
      const closestLine = findClosestLine(mousePos);
      if (closestLine) {
        if (!doorStartPoint) {
          // Set the first point of the door
          setDoorStartPoint({
            wallIndex: closestLine.index,
            point: closestLine.point
          });
        } else if (doorStartPoint.wallIndex === closestLine.index) {
          // Add the door if the second point is on the same wall
          addDoor(doorStartPoint.wallIndex, doorStartPoint.point, closestLine.point);
          setAddingDoor(false);
          setDoorStartPoint(null);
        } else {
          // If clicked on a different wall, reset the door start point
          setDoorStartPoint({
            wallIndex: closestLine.index,
            point: closestLine.point
          });
        }
      }
      return;
    }

    // Check if we're adding a window
    if (addingWindow) {
      const closestLine = findClosestLine(mousePos);
      if (closestLine) {
        if (!windowStartPoint) {
          // Set the first point of the window
          setWindowStartPoint({
            wallIndex: closestLine.index,
            point: closestLine.point
          });
        } else if (windowStartPoint.wallIndex === closestLine.index) {
          // Add the window if the second point is on the same wall
          addWindow(windowStartPoint.wallIndex, windowStartPoint.point, closestLine.point);
          setAddingWindow(false);
          setWindowStartPoint(null);
        } else {
          // If clicked on a different wall, reset the window start point
          setWindowStartPoint({
            wallIndex: closestLine.index,
            point: closestLine.point
          });
        }
      }
      return;
    }

    // Check if we're clicking on a window point
    const windowPoint = findNearestWindowPoint(mousePos);
    if (windowPoint) {
      setSelectedWindowPoint(windowPoint);
      setIsDragging(true);
      return;
    }

    // Check if we're clicking on a door point
    const doorPoint = findNearestDoorPoint(mousePos);
    if (doorPoint) {
      setSelectedDoorPoint(doorPoint);
      setIsDragging(true);
      return;
    }

    // Check if we're clicking on a room point
    const pointIndex = findNearestPoint(mousePos);
    if (pointIndex !== null && pointIndex !== 0) {
      setSelectedPoint(pointIndex);
      setIsDragging(true);
    } else {
      setIsPanning(true);
      setLastPanPosition(getScreenMousePosition(e));
    }
  };

  // 
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const mousePos = getMousePosition(e);
      
      if (selectedWindowPoint) {
        // Move window point
        moveWindowPoint(
          selectedWindowPoint.windowIndex,
          selectedWindowPoint.pointType,
          mousePos
        );
      } else if (selectedDoorPoint) {
        // Move door point
        moveDoorPoint(
          selectedDoorPoint.doorIndex,
          selectedDoorPoint.pointType,
          mousePos
        );
      } else if (selectedPoint !== null && selectedPoint !== 0) {
        // Save old points before updating
        const oldPoints = [...points];
        
        // Move room point
        const newPoints = [...points];
        newPoints[selectedPoint] = mousePos;
        setPoints(newPoints);
        
        // Update doors and windows based on the new room shape
        if (isComplete && (doors.length > 0 || windows.length > 0)) {
          updateDoorsAndWindows(newPoints, oldPoints);
        }
      }
    } else if (isPanning && lastPanPosition) {
      // Panning code remains unchanged
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
    if (isComplete || isDragging || isPanning || addingDoor || addingWindow) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const mousePos = getMousePosition(e);

    if (points.length === 0) {
      // For the first point, set it at the origin (0,0)
      setPoints([{ x: 0, y: 0 }]);
      
      // Center the origin in the bottom left of the canvas
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      setPan({ 
        x: screenX, 
        y: canvas.height - screenY // Adjust for inverted Y-axis
      });
      return;
    }

    if (points.length > 2) {
      const firstPoint = points[0];
      const distance = Math.sqrt(
        Math.pow(mousePos.x - firstPoint.x, 2) + Math.pow(mousePos.y - firstPoint.y, 2)
      );

      if (distance < SNAP_DISTANCE / scale) {
        setIsComplete(true);
        return;
      }
    }

    setPoints([...points, mousePos]);
  };

  // const updatePoint = (index: number, newX: number, newY: number) => {
  //   const newPoints = [...points];
  //   if (index === 0) {
  //     const dx = newX - points[0].x;
  //     const dy = newY - points[0].y;
  //     newPoints.forEach((point, i) => {
  //       point.x += dx;
  //       point.y += dy;
  //     });
  //   } else {
  //     newPoints[index] = { x: newX, y: newY };
  //   }
  //   setPoints(newPoints);
  // };

  // 3. Modify updatePoint function - handles manual coordinate editing
const updatePoint = (index: number, newX: number, newY: number) => {
  // Save old points before updating
  const oldPoints = [...points];
  
  const newPoints = [...points];
  if (index === 0) {
    const dx = newX - points[0].x;
    const dy = newY - points[0].y;
    newPoints.forEach((point, i) => {
      point.x += dx;
      point.y += dy;
    });
  } else {
    newPoints[index] = { x: newX, y: newY };
  }
  
  setPoints(newPoints);
  
  // Update doors and windows based on the new room shape
  if (isComplete && (doors.length > 0 || windows.length > 0)) {
    updateDoorsAndWindows(newPoints, oldPoints);
  }
};

  // const updateWallLength = (index: number, newLength: number) => {
  //   const newPoints = [...points];
  //   const currentPoint = points[index];
  //   const nextPoint = points[(index + 1) % points.length];
    
  //   const angle = Math.atan2(
  //     nextPoint.y - currentPoint.y,
  //     nextPoint.x - currentPoint.x
  //   );
    
  //   newPoints[(index + 1) % points.length] = {
  //     x: currentPoint.x + Math.cos(angle) * newLength,
  //     y: currentPoint.y + Math.sin(angle) * newLength
  //   };
    
  //   setPoints(newPoints);
  // };
  const updateWallLength = (index: number, newLength: number) => {
    // Save old points before updating
    const oldPoints = [...points];
    
    const newPoints = [...points];
    const currentPoint = points[index];
    const nextPoint = points[(index + 1) % points.length];
    
    const angle = Math.atan2(
      nextPoint.y - currentPoint.y,
      nextPoint.x - currentPoint.x
    );
    
    newPoints[(index + 1) % points.length] = {
      x: currentPoint.x + Math.cos(angle) * newLength,
      y: currentPoint.y + Math.sin(angle) * newLength
    };
    
    setPoints(newPoints);
    
    // Update doors and windows based on the new room shape
    if (isComplete && (doors.length > 0 || windows.length > 0)) {
      updateDoorsAndWindows(newPoints, oldPoints);
    }
  };

  const updateAngle = (index: number, newAngle: number) => {
    if (isNaN(newAngle)) return;
    
    const newPoints = [...points];
    const currentPoint = points[index];
    const prevPoint = points[(index - 1 + points.length) % points.length];
    const nextPoint = points[(index + 1) % points.length];

    // Calculate the angle of the previous wall
    // With Y-axis pointing up, positive angles are counterclockwise
    const angle1 = Math.atan2(
      prevPoint.y - currentPoint.y,
      prevPoint.x - currentPoint.x
    );

    // Convert the new angle from degrees to radians
    // With Y-axis pointing up, we need to negate the angle to maintain counterclockwise direction
    const angleRad = (-newAngle * Math.PI) / 180;
    
    // Calculate the new angle for the next wall
    const newAngleRad = angle1 + angleRad;
    
    // Calculate the length of the current wall
    const currentWallLength = Math.sqrt(
      Math.pow(nextPoint.x - currentPoint.x, 2) + 
      Math.pow(nextPoint.y - currentPoint.y, 2)
    );

    // Update the position of the next point
    newPoints[(index + 1) % points.length] = {
      x: currentPoint.x + currentWallLength * Math.cos(newAngleRad),
      y: currentPoint.y + currentWallLength * Math.sin(newAngleRad)
    };

    setPoints(newPoints);
  };

  const copyRoomJson = () => {
    const roomData = {
      points: {
        x: points.map(p => Math.round(p.x)),
        y: points.map(p => Math.round(p.y))
      },
      doors: doors.map(door => ({
        wallIndex: door.wallIndex,
        position: Math.round(door.position) / 1000, // Convert mm to meters
        width: Math.round(door.width) / 1000 // Convert mm to meters
      })),
      windows: windows.map(window => ({
        wallIndex: window.wallIndex,
        position: Math.round(window.position) / 1000, // Convert mm to meters
        width: Math.round(window.width) / 1000, // Convert mm to meters
        height: Math.round(window.height) / 1000, // Convert mm to meters
        sillHeight: Math.round(window.sillHeight) / 1000 // Convert mm to meters
      }))
    };
    
    navigator.clipboard.writeText(JSON.stringify(roomData, null, 2));
    alert('Room JSON copied to clipboard!');
  };

  const handleAngleChange = (index: number, value: string) => {
    setEditingAngles({ ...editingAngles, [index]: value });
  };

  const handleAngleBlur = (index: number) => {
    const newAngle = Number(editingAngles[index]);
    if (!isNaN(newAngle)) {
      updateAngle(index, newAngle);
    }
    const newEditingAngles = { ...editingAngles };
    delete newEditingAngles[index];
    setEditingAngles(newEditingAngles);
  };

  const toggleApiConfig = () => {
    setShowApiConfig(!showApiConfig);
  };

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExternalApiUrl(e.target.value);
  };

  const handleWindowHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWindowHeight(Number(e.target.value));
  };

  const handleWindowSillHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWindowSillHeight(Number(e.target.value));
  };

  const wallData = calculateWallData();

  const updateDoorsAndWindows = (newPoints: Point[], oldPoints: Point[]) => {
    // Update doors
    const updatedDoors = doors.map(door => {
      const wallIndex = door.wallIndex;
      const startVertex = oldPoints[wallIndex];
      const endVertex = oldPoints[(wallIndex + 1) % oldPoints.length];
      
      // Calculate the old wall vector
      const oldWallDx = endVertex.x - startVertex.x;
      const oldWallDy = endVertex.y - startVertex.y;
      const oldWallLength = Math.sqrt(oldWallDx * oldWallDx + oldWallDy * oldWallDy);
      
      // Get the normalized direction vector of the old wall
      const oldDirX = oldWallDx / oldWallLength;
      const oldDirY = oldWallDy / oldWallLength;
      
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
    
    // Update windows using the same approach
    const updatedWindows = windows.map(window => {
      const wallIndex = window.wallIndex;
      const startVertex = oldPoints[wallIndex];
      const endVertex = oldPoints[(wallIndex + 1) % oldPoints.length];
      
      // Calculate the old wall vector
      const oldWallDx = endVertex.x - startVertex.x;
      const oldWallDy = endVertex.y - startVertex.y;
      const oldWallLength = Math.sqrt(oldWallDx * oldWallDx + oldWallDy * oldWallDy);
      
      // Get the normalized direction vector of the old wall
      const oldDirX = oldWallDx / oldWallLength;
      const oldDirY = oldWallDy / oldWallLength;
      
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
    
    setDoors(updatedDoors);
    setWindows(updatedWindows);
  };



  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex justify-between mb-4">
          <div className="text-sm text-gray-600">
            Scale: 1px = {(1/scale).toFixed(1)}mm | Canvas: 10m × 8m
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetRoom}
              className="flex items-center gap-2 px-4 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              <RotateCcw size={16} />
              Reset Room
            </button>
            {/* <button
              onClick={saveRoom}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save Room'}
            </button> */}
            {/* <button
              onClick={processRoom}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              {isProcessing ? 'Processing...' : 'Send to API'}
            </button>
            <button
              onClick={toggleApiConfig}
              className="flex items-center gap-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {showApiConfig ? 'Hide API Config' : 'Configure API'}
            </button> */}
            <button
              onClick={startAddingDoor}
              disabled={addingDoor}
              // className="flex items-center gap-2 px-4 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              className="flex items-center gap-2 px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DoorOpen size={16} />
              {addingDoor ? 'Adding Door...' : 'Add Door'}
            </button>
            <button
              onClick={startAddingWindow}
              disabled={addingWindow}
              className="flex items-center gap-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square size={16} />
              {addingWindow ? 'Adding Window...' : 'Add Window'}
            </button>
            <button
              onClick={copyRoomJson}
              className="flex items-center gap-2 px-4 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              <Copy size={16} />
              Copy JSON
            </button>
          </div>
        </div>

        {showApiConfig && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h3 className="text-lg font-medium mb-2">API Configuration</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="apiUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  External API URL
                </label>
                <input
                  type="text"
                  id="apiUrl"
                  value={externalApiUrl}
                  onChange={handleApiUrlChange}
                  placeholder="https://your-api-endpoint.com/process"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Leave empty to use the default local API endpoint
                </p>
              </div>
            </div>
          </div>
        )}

        {addingDoor && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-amber-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-amber-800">Adding Door</h3>
                <p className="text-sm text-amber-700">
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
                className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {addingWindow && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-indigo-800">Adding Window</h3>
                <p className="text-sm text-indigo-700">
                  {!windowStartPoint 
                    ? "Click on a wall to place the window's start point" 
                    : "Click on the same wall to place the window's end point"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="windowHeight" className="text-sm text-indigo-700">
                    Height (mm):
                  </label>
                  <input
                    type="number"
                    id="windowHeight"
                    value={windowHeight}
                    onChange={handleWindowHeightChange}
                    className="w-20 px-2 py-1 border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="windowSillHeight" className="text-sm text-indigo-700">
                    Sill Height (mm):
                  </label>
                  <input
                    type="number"
                    id="windowSillHeight"
                    value={windowSillHeight}
                    onChange={handleWindowSillHeightChange}
                    className="w-20 px-2 py-1 border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={() => {
                    setAddingWindow(false);
                    setWindowStartPoint(null);
                  }}
                  className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="relative">
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
            onContextMenu={handleContextMenu}
            className={`border border-gray-300 rounded ${isPanning ? 'cursor-grab' : 'cursor-crosshair'} ${isPanning && lastPanPosition ? 'cursor-grabbing' : ''} ${addingDoor ? 'cursor-cell' : ''} ${addingWindow ? 'cursor-cell' : ''}`}
          />
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={
                contextMenu.type === 'line'
                  ? [
                      {
                        label: 'Add Point',
                        onClick: () => handleAddPoint(contextMenu.data.index, contextMenu.data.point!),
                      },
                    ]
                  : [
                      {
                        label: 'Remove Point',
                        onClick: () => handleRemovePoint(contextMenu.data.index),
                      },
                    ]
              }
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Room Dimensions</h2>
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
              {points.map((point, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {index === 0 ? 'Origin' : `Point ${index}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="number"
                      value={Math.round(point.x)}
                      onChange={(e) => updatePoint(index, Number(e.target.value), point.y)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input
                      type="number"
                      value={Math.round(point.y)}
                      onChange={(e) => updatePoint(index, point.x, Number(e.target.value))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {index < points.length - 1 || isComplete ? (
                      <input
                        type="number"
                        value={Math.round(wallData[index]?.length || 0)}
                        onChange={(e) => updateWallLength(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    ) : null}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {index > 0 && points.length > 2 ? (
                      <input
                        type="text"
                        value={editingAngles[index] !== undefined ? editingAngles[index] : wallData[index]?.angle.toFixed(1) || '0'}
                        onChange={(e) => handleAngleChange(index, e.target.value)}
                        onBlur={() => handleAngleBlur(index)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {doors.length > 0 && (
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
                {doors.map((door, index) => (
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
                        onChange={(e) => updateDoorPosition(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(door.width)}
                        onChange={(e) => updateDoorWidth(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => removeDoor(index)}
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

      {windows.length > 0 && (
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
                {windows.map((window, index) => (
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
                        onChange={(e) => updateWindowPosition(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(window.width)}
                        onChange={(e) => updateWindowWidth(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(window.height)}
                        onChange={(e) => updateWindowHeight(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={Math.round(window.sillHeight)}
                        onChange={(e) => updateWindowSillHeight(index, Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => removeWindow(index)}
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