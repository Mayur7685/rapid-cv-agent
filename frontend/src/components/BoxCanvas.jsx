import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Transformer, Line, Path as KonvaPath } from 'react-konva';
import { Loader2 } from 'lucide-react';

const BoxCanvas = forwardRef(({ imageUrl, initialBoxes, classes, activeClassIndex, confidenceThreshold = 0.0, showGrid = false, onSelect }, ref) => {
  const [imgElement, setImgElement] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [pixelBoxes, setPixelBoxes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [newBox, setNewBox] = useState(null); // { x, y, width, height, id } during drawing

  const stageRef = useRef();
  const trRef = useRef();
  const imageRef = useRef();

  const selectId = (id) => {
    setSelectedId(id);
    if (onSelect) onSelect(id);
  };

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => {
      setImgElement(img);
    };
  }, [imageUrl]);

  // Handle canvas sizing based on loaded image
  useEffect(() => {
    if (!imgElement) return;
    const maxW = 680;
    const maxH = 460;
    let w = imgElement.width;
    let h = imgElement.height;
    const ratio = w / h;
    
    if (w > maxW) {
      w = maxW;
      h = maxW / ratio;
    }
    if (h > maxH) {
      h = maxH;
      w = maxH * ratio;
    }
    setDimensions({ width: w, height: h });
  }, [imgElement]);

  // Map normalized boxes to pixel coordinates
  useEffect(() => {
    if (dimensions.width === 0 || !initialBoxes) return;
    
    const mapped = initialBoxes.map((box, idx) => {
      const [xc, yc, bw, bh] = box.bbox;
      const w = bw * dimensions.width;
      const h = bh * dimensions.height;
      const x = (xc - bw / 2) * dimensions.width;
      const y = (yc - bh / 2) * dimensions.height;
      
      return {
        id: box.id ? String(box.id) : `box_${idx}_${Date.now()}`,
        class_id: box.class_id,
        class_name: box.class_name,
        x,
        y,
        width: w,
        height: h,
        confidence: box.confidence,
        segmentation_path: box.segmentation_path
      };
    });
    
    setPixelBoxes(mapped);
    selectId(null);
  }, [initialBoxes, dimensions]);

  // Selection transformer hook
  useEffect(() => {
    if (trRef.current) {
      if (selectedId) {
        const stage = trRef.current.getStage();
        const selectedNode = stage.findOne('#' + selectedId);
        if (selectedNode) {
          trRef.current.nodes([selectedNode]);
        } else {
          trRef.current.nodes([]);
        }
      } else {
        trRef.current.nodes([]);
      }
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedId, pixelBoxes]);

  // Keyboard listener for deletion
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setPixelBoxes(prev => prev.filter(b => b.id !== selectedId));
        selectId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  // Filter boxes dynamically based on confidence slider
  const visibleBoxes = pixelBoxes.filter(box => {
    if (box.confidence === null || box.confidence === undefined) return true;
    return box.confidence >= confidenceThreshold;
  });

  // Expose methods to parent via forwardRef
  useImperativeHandle(ref, () => ({
    getNormalizedBoxes: () => {
      if (dimensions.width === 0) return [];
      return visibleBoxes.map(b => {
        const w_norm = b.width / dimensions.width;
        const h_norm = b.height / dimensions.height;
        const xc_norm = (b.x + b.width / 2) / dimensions.width;
        const yc_norm = (b.y + b.height / 2) / dimensions.height;
        
        return {
          class_id: b.class_id,
          class_name: b.class_name,
          bbox: [
            Math.min(1.0, Math.max(0.0, xc_norm)),
            Math.min(1.0, Math.max(0.0, yc_norm)),
            Math.min(1.0, Math.max(0.0, w_norm)),
            Math.min(1.0, Math.max(0.0, h_norm))
          ],
          confidence: b.confidence,
          segmentation_path: b.segmentation_path
        };
      });
    },
    getSelectedId: () => selectedId,
    setSelectedId: (id) => selectId(id),
    deleteSelectedBox: () => {
      if (selectedId) {
        setPixelBoxes(prev => prev.filter(b => b.id !== selectedId));
        selectId(null);
      }
    },
    updateSelectedBoxClass: (classIdx) => {
      setPixelBoxes(prev => prev.map(b => {
        if (b.id === selectedId) {
          return {
            ...b,
            class_id: classIdx,
            class_name: classes[classIdx]
          };
        }
        return b;
      }));
    },
    getSelectedBoxClassName: () => {
      const box = pixelBoxes.find(b => b.id === selectedId);
      return box ? box.class_name : null;
    },
    updateSelectedBoxSegmentationPath: (path) => {
      setPixelBoxes(prev => prev.map(b => {
        if (b.id === selectedId) {
          return {
            ...b,
            segmentation_path: path
          };
        }
        return b;
      }));
    },
    getPixelBoxes: () => pixelBoxes,
    getVisibleBoxesCount: () => visibleBoxes.length
  }));

  const handleStageMouseDown = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.getName() === 'bg-image';
    if (clickedOnEmpty) {
      selectId(null);
      
      const pos = e.target.getStage().getPointerPosition();
      setNewBox({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        id: 'temp_draw'
      });
    }
  };

  const handleStageMouseMove = (e) => {
    if (!newBox) return;
    const pos = e.target.getStage().getPointerPosition();
    
    setNewBox(prev => ({
      ...prev,
      width: pos.x - prev.x,
      height: pos.y - prev.y
    }));
  };

  const handleStageMouseUp = () => {
    if (!newBox) return;
    
    if (Math.abs(newBox.width) > 6 && Math.abs(newBox.height) > 6) {
      const x = newBox.width < 0 ? newBox.x + newBox.width : newBox.x;
      const y = newBox.height < 0 ? newBox.y + newBox.height : newBox.y;
      const width = Math.abs(newBox.width);
      const height = Math.abs(newBox.height);
      
      const createdBox = {
        id: `box_${Date.now()}`,
        class_id: activeClassIndex,
        class_name: classes[activeClassIndex],
        x,
        y,
        width,
        height,
        confidence: null // Human created
      };
      
      setPixelBoxes(prev => [...prev, createdBox]);
      selectId(createdBox.id);
    }
    setNewBox(null);
  };

  const handleBoxDragEnd = (e, boxId) => {
    const node = e.target;
    setPixelBoxes(prev => prev.map(b => {
      if (b.id === boxId) {
        return {
          ...b,
          x: node.x(),
          y: node.y()
        };
      }
      return b;
    }));
  };

  const handleBoxTransformEnd = (e, boxId) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    
    setPixelBoxes(prev => prev.map(b => {
      if (b.id === boxId) {
        return {
          ...b,
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * scaleX),
          height: Math.max(5, node.height() * scaleY)
        };
      }
      return b;
    }));
  };

  return (
    <div 
      className="relative border border-gray-800 bg-[#030712] rounded-xl overflow-hidden shadow-inner flex items-center justify-center select-none canvas-glow group"
      style={{ width: dimensions.width || 500, height: dimensions.height || 350 }}
    >
      {imgElement ? (
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
          <Layer>
            <KonvaImage
              ref={imageRef}
              name="bg-image"
              image={imgElement}
              width={dimensions.width}
              height={dimensions.height}
            />
            
            {showGrid && (
              <>
                {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
                  <Line
                    key={`grid-v-${ratio}`}
                    points={[ratio * dimensions.width, 0, ratio * dimensions.width, dimensions.height]}
                    stroke="#ffffff"
                    strokeWidth={1}
                    opacity={0.12}
                    dash={[3, 3]}
                  />
                ))}
                {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
                  <Line
                    key={`grid-h-${ratio}`}
                    points={[0, ratio * dimensions.height, dimensions.width, ratio * dimensions.height]}
                    stroke="#ffffff"
                    strokeWidth={1}
                    opacity={0.12}
                    dash={[3, 3]}
                  />
                ))}
              </>
            )}
            
            {visibleBoxes.map((box) => {
              const isSelected = box.id === selectedId;
              const colors = [
                { rect: "#3b82f6", text: "#60a5fa" }, // Blue
                { rect: "#10b981", text: "#34d399" }, // Emerald
                { rect: "#f59e0b", text: "#fbbf24" }, // Amber
                { rect: "#ec4899", text: "#f472b6" }, // Pink
                { rect: "#8b5cf6", text: "#a78bfa" }  // Violet
              ];
              const activeColor = colors[box.class_id % colors.length];
              
              return (
                <React.Fragment key={box.id}>
                  {box.segmentation_path && (
                    <KonvaPath
                      data={box.segmentation_path}
                      scaleX={dimensions.width}
                      scaleY={dimensions.height}
                      fill={isSelected ? `${activeColor.rect}4c` : `${activeColor.rect}22`}
                      stroke={activeColor.rect}
                      strokeWidth={1.5 / dimensions.width}
                      listening={false}
                    />
                  )}
                  <Rect
                    id={box.id}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    stroke={activeColor.rect}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    fill={isSelected ? `${activeColor.rect}18` : "transparent"}
                    draggable={true}
                    onDragEnd={(e) => handleBoxDragEnd(e, box.id)}
                    onTransformEnd={(e) => handleBoxTransformEnd(e, box.id)}
                    onClick={() => selectId(box.id)}
                    onTap={() => selectId(box.id)}
                  />
                  <Text
                    x={box.x + 3}
                    y={box.y - 13 > 0 ? box.y - 13 : box.y + 3}
                    text={`${box.class_name}${box.confidence ? ` ${(box.confidence * 100).toFixed(0)}%` : ''}`}
                    fontSize={10}
                    fontFamily="Outfit, sans-serif"
                    fontStyle="bold"
                    fill={activeColor.text}
                    listening={false}
                  />
                </React.Fragment>
              );
            })}

            {newBox && (
              <Rect
                x={newBox.width < 0 ? newBox.x + newBox.width : newBox.x}
                y={newBox.height < 0 ? newBox.y + newBox.height : newBox.y}
                width={Math.abs(newBox.width)}
                height={Math.abs(newBox.height)}
                stroke="#ef4444"
                strokeWidth={1.5}
                dash={[3, 2]}
                fill="rgba(239, 68, 68, 0.05)"
              />
            )}

            <Transformer
              ref={trRef}
              rotateEnabled={false}
              borderStroke="#3b82f6"
              anchorStroke="#3b82f6"
              anchorFill="#ffffff"
              anchorSize={6}
              keepRatio={false}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      ) : (
        <div className="text-gray-500 text-xs font-semibold flex items-center">
          <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-500" /> Rendering canvas layer...
        </div>
      )}
    </div>
  );
});

export default BoxCanvas;
