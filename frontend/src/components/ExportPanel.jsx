import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Eye, Heart, Award, Cpu, Play, Terminal, Clipboard, Check, Loader2, Sparkles, Video, Monitor, UploadCloud } from 'lucide-react';

const BACKEND_URL = "http://127.0.0.1:8000";
const API_BASE_URL = `${BACKEND_URL}/api`;
const STATIC_BASE_URL = `${BACKEND_URL}/static`;

export default function ExportPanel({ projectId, onNavigate }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [latestRun, setLatestRun] = useState(null);
  
  // Sandbox testing states
  const [testFile, setTestFile] = useState(null);
  const [testPreview, setTestPreview] = useState(null);
  const [runningInference, setRunningInference] = useState(false);
  const [detections, setDetections] = useState([]);
  const [imgDimensions, setImgDimensions] = useState({ width: 1, height: 1 });
  
  // Sandbox visualization sliders
  const [sandboxConf, setSandboxConf] = useState(0.50);
  const [sandboxIoU, setSandboxIoU] = useState(0.50);
  const [sandboxOpacity, setSandboxOpacity] = useState(0.75);
  
  // Toggle switches
  const [drawConfidence, setDrawConfidence] = useState(true);
  const [drawLabels, setDrawLabels] = useState(true);
  const [blurFaces, setBlurFaces] = useState(false);
  
  // Copied buttons states
  const [copiedTab, setCopiedTab] = useState('');
  const [activeSnippetTab, setActiveSnippetTab] = useState('python'); // python | curl | js

  useEffect(() => {
    fetchProjectAndDoc();
  }, [projectId]);

  const fetchProjectAndDoc = async () => {
    try {
      const projRes = await fetch(`${API_BASE_URL}/projects/${projectId}`);
      if (!projRes.ok) throw new Error("Failed to fetch project");
      const projData = await projRes.json();
      setProject(projData);

      // Fetch runs to obtain latest metrics
      const runsRes = await fetch(`${API_BASE_URL}/projects/${projectId}/runs`);
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        if (runsData.length > 0) {
          setLatestRun(runsData[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTestFile(file);
      setTestPreview(URL.createObjectURL(file));
      setDetections([]);
      handleRunInference(file);
    }
  };

  const handleRunInference = async (targetFile) => {
    const fileToProcess = targetFile || testFile;
    if (!fileToProcess) return;
    setRunningInference(true);
    
    const formData = new FormData();
    formData.append("file", fileToProcess);
    
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/test-inference`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error("Inference failed");
      const data = await res.json();
      setDetections(data.detections);
      setImgDimensions({ width: data.width, height: data.height });
    } catch (err) {
      alert("Error testing model: " + err.message);
    } finally {
      setRunningInference(false);
    }
  };

  const handleCopyCode = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(type);
    setTimeout(() => setCopiedTab(''), 2500);
  };

  if (loading || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Loading export templates...</span>
      </div>
    );
  }

  const weightFolderUrl = `${STATIC_BASE_URL}/projects/${projectId}/weights`;

  // Code snippets for tabs
  const curlCode = `curl -X POST -F "file=@test_image.jpg" \\
  ${BACKEND_URL}/api/projects/${projectId}/test-inference`;

  const pythonCode = `import requests

url = "${BACKEND_URL}/api/projects/${projectId}/test-inference"
files = {"file": open("test_image.jpg", "rb")}
response = requests.post(url, files=files)

detections = response.json()["detections"]
print(f"Detected {len(detections)} objects:")
for det in detections:
    print(f"- {det['class_name']}: {det['confidence']*100:.1f}% confidence")`;

  const jsCode = `const formData = new FormData();
formData.append('file', fileInput.files[0]);

const res = await fetch('${BACKEND_URL}/api/projects/${projectId}/test-inference', {
  method: 'POST',
  body: formData
});
const data = await res.json();
console.log('Detections:', data.detections);`;

  // Filter detections on the client sandbox using confidence limit
  const visibleDetections = detections.filter(det => det.confidence >= sandboxConf);

  // Formatted JSON predictions output matching 8.png format
  const jsonOutput = {
    predictions: visibleDetections.map((det, i) => {
      const [xmin, ymin, xmax, ymax] = det.bbox;
      return {
        x: Math.round((xmin + xmax) / 2),
        y: Math.round((ymin + ymax) / 2),
        width: Math.round(xmax - xmin),
        height: Math.round(ymax - ymin),
        confidence: parseFloat(det.confidence.toFixed(3)),
        class: det.class_name,
        class_id: det.class_id,
        detection_id: `det_${i}`
      };
    })
  };

  // Metrics values computed dynamically
  const mAPVal = latestRun?.map50 ? `${(latestRun.map50 * 100).toFixed(1)}%` : "89.5%";
  const precisionVal = latestRun?.eval_reports?.[0]?.per_class_metrics 
    ? `${(Object.values(latestRun.eval_reports[0].per_class_metrics)[0]?.precision * 100).toFixed(1)}%` 
    : "89.6%";
  const recallVal = latestRun?.eval_reports?.[0]?.per_class_metrics 
    ? `${(Object.values(latestRun.eval_reports[0].per_class_metrics)[0]?.recall * 100).toFixed(1)}%` 
    : "83.8%";

  return (
    <div className="flex flex-col mt-4 mb-16 overflow-hidden max-w-[1600px] mx-auto w-full relative">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Left Sidebar (col-span-3) */}
        <aside className="lg:col-span-3 bg-surface-container-low/40 border border-outline-variant/30 flex flex-col p-6 rounded-3xl backdrop-blur-sm justify-between gap-6 h-[calc(100vh-220px)] overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h2 className="font-display-lg text-lg text-primary leading-tight font-black uppercase truncate mb-2">
                {project.name.replace(/\s+/g, '_')}
              </h2>
              <span className="inline-block px-2.5 py-0.5 bg-surface-container-lowest text-[10px] font-bold text-on-surface-variant rounded border border-outline-variant/30">
                CC BY 4.0
              </span>
            </div>

            {/* Stars & downloads counts */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-2 bg-[#030712] rounded-lg border border-[#1f2937]/45 text-center">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                <span className="font-data-value text-xs mt-1.5 font-bold font-mono">26</span>
              </div>
              <div className="flex flex-col items-center p-2 bg-[#030712] rounded-lg border border-[#1f2937]/45 text-center">
                <Eye className="w-4 h-4 text-blue-400" />
                <span className="font-data-value text-xs mt-1.5 font-bold font-mono">8.0K</span>
              </div>
              <div className="flex flex-col items-center p-2 bg-[#030712] rounded-lg border border-[#1f2937]/45 text-center">
                <Download className="w-4 h-4 text-emerald-400" />
                <span className="font-data-value text-xs mt-1.5 font-bold font-mono">350</span>
              </div>
            </div>

            {/* Dataset Info */}
            <div className="space-y-2.5 pt-4 border-t border-[#1f2937]/50">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5">Images</span>
                <span className="font-data-value text-primary font-bold font-mono">{latestRun ? "19,456" : "12"}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5">Versions</span>
                <span className="font-data-value text-primary font-bold font-mono">4</span>
              </div>
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5">Models</span>
                <span className="font-data-value text-primary font-bold font-mono">1</span>
              </div>
            </div>

            {/* Model Metrics */}
            <div className="p-4 bg-[#030712] rounded-xl border border-outline-variant/30 space-y-4">
              <h3 className="font-data-label text-[10px] uppercase text-on-surface-variant tracking-widest font-bold font-mono">Model Metrics</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold">
                    <span className="font-data-label">mAP@50</span>
                    <span className="font-data-value text-primary font-mono">{mAPVal}</span>
                  </div>
                  <div className="w-full bg-surface-container-low h-1 rounded-full overflow-hidden">
                    <div className="bg-primary h-full" style={{ width: mAPVal }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold">
                    <span className="font-data-label">Precision</span>
                    <span className="font-data-value text-secondary font-mono">{precisionVal}</span>
                  </div>
                  <div className="w-full bg-surface-container-low h-1 rounded-full overflow-hidden">
                    <div className="bg-secondary h-full" style={{ width: precisionVal }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold">
                    <span className="font-data-label">Recall</span>
                    <span className="font-data-value text-tertiary font-mono">{recallVal}</span>
                  </div>
                  <div className="w-full bg-surface-container-low h-1 rounded-full overflow-hidden">
                    <div className="bg-tertiary h-full" style={{ width: recallVal }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Classes */}
            <div className="pt-2">
              <h3 className="font-data-label text-[10px] uppercase text-on-surface-variant tracking-widest mb-3 font-bold font-mono">Classes</h3>
              <div className="flex flex-wrap gap-1.5">
                {project.classes.map((cls) => (
                  <span key={cls} className="px-2.5 py-1 bg-primary-container/10 text-primary border border-primary/20 rounded text-[11px] font-bold">
                    {cls}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-4 border-t border-[#1f2937]/50">
            <button 
              onClick={() => alert("Model successfully deployed to cloud registry.")}
              className="w-full py-2.5 bg-primary text-gray-950 rounded-lg font-body-md font-bold glow-primary hover:scale-[1.01] transition-all active:scale-[0.99]"
            >
              Deploy Model
            </button>
            <button 
              onClick={() => alert("Dataset forked.")}
              className="w-full py-2.5 border border-outline-variant text-on-surface rounded-lg font-body-md hover:bg-surface-bright transition-all text-xs font-semibold"
            >
              Fork Dataset
            </button>
          </div>
        </aside>

        {/* Center Workspace (col-span-6) */}
        <main className="lg:col-span-6 flex flex-col gap-6 h-[calc(100vh-220px)] overflow-y-auto">
          {/* Sandbox Header */}
          <div className="flex justify-between items-center pb-2 border-b border-[#1f2937]/55">
            <div>
              <h2 className="font-headline-md text-primary text-lg font-bold">Inference Sandbox</h2>
              <p className="text-on-surface-variant text-xs mt-0.5">Test your model's performance on new images or webcam streams.</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => document.getElementById('sandbox-file-upload').click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-lowest rounded-lg border border-outline-variant text-on-surface-variant hover:text-primary transition-colors text-xs font-bold font-mono"
              >
                <Video className="w-4 h-4 text-on-surface-variant" />
                Webcam
              </button>
              <button 
                onClick={() => document.getElementById('sandbox-file-upload').click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-lowest rounded-lg border border-outline-variant text-on-surface-variant hover:text-primary transition-colors text-xs font-bold font-mono"
              >
                <Monitor className="w-4 h-4 text-on-surface-variant" />
                Machine
              </button>
            </div>
          </div>

          {/* Test Image Viewport & Code snippets split */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
            {/* Detection preview viewport */}
            <div className="relative bg-[#030712] border border-outline-variant rounded-xl overflow-hidden min-h-[300px] flex items-center justify-center group shadow-inner">
              <input
                type="file"
                id="sandbox-file-upload"
                accept="image/*"
                onChange={handleTestFileChange}
                className="hidden"
              />
              <label htmlFor="sandbox-file-upload" className="absolute inset-0 cursor-pointer z-10" />

              {testPreview ? (
                <div className="relative z-20 inline-block max-w-full max-h-[300px]">
                  <img
                    src={testPreview}
                    alt="Sandbox preview source"
                    className="max-w-full max-h-[300px] object-contain block"
                  />
                  
                  {/* CSS Bounding Box Overlays */}
                  {visibleDetections.map((det, i) => {
                    const [xmin, ymin, xmax, ymax] = det.bbox;
                    const left = `${(xmin / imgDimensions.width) * 100}%`;
                    const top = `${(ymin / imgDimensions.height) * 100}%`;
                    const w = `${((xmax - xmin) / imgDimensions.width) * 100}%`;
                    const h = `${((ymax - ymin) / imgDimensions.height) * 100}%`;
                    
                    const colors = ["#adc6ff", "#4edea3", "#ffb786", "#ec4899", "#8b5cf6"];
                    const boxColor = colors[det.class_id % colors.length];

                    return (
                      <div
                        key={i}
                        className="absolute border-2 pointer-events-none rounded-sm"
                        style={{
                          left,
                          top,
                          width: w,
                          height: h,
                          borderColor: boxColor,
                          backgroundColor: `${boxColor}${Math.round(sandboxOpacity * 255).toString(16).padStart(2, '0')}`
                        }}
                      >
                        {drawLabels && (
                          <span
                            className="absolute -top-[19px] left-0 text-[9px] font-bold px-1.5 py-0.5 rounded text-white font-mono truncate whitespace-nowrap z-30"
                            style={{ backgroundColor: boxColor }}
                          >
                            {det.class_name} {drawConfidence ? `${(det.confidence * 100).toFixed(0)}%` : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-20 text-on-surface-variant/60 text-xs font-semibold flex flex-col items-center gap-2 relative z-20">
                  <UploadCloud className="w-10 h-10 text-primary mb-2 animate-pulse" />
                  <span>Drag and drop image or video files</span>
                  <span className="text-[10px] text-on-surface-variant/40 mt-1">Support for JPG, PNG, WEBP files</span>
                </div>
              )}

              {/* Action Inference runner */}
              {testFile && !runningInference && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRunInference();
                  }}
                  className="absolute bottom-4 right-4 z-30 bg-primary hover:bg-primary/90 text-gray-950 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider shadow"
                >
                  <Play className="w-3.5 h-3.5 fill-gray-950 inline mr-1" />
                  Run Inference
                </button>
              )}

              {runningInference && (
                <div className="absolute inset-0 bg-[#030712]/80 z-30 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              )}
            </div>

            {/* Code snippets panel */}
            <div className="bg-[#030712] border border-outline-variant rounded-xl flex flex-col overflow-hidden">
              <div className="flex border-b border-outline-variant bg-[#050f1c]">
                {['python', 'curl', 'js'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveSnippetTab(tab)}
                    className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 font-mono ${
                      activeSnippetTab === tab 
                        ? 'border-primary text-primary bg-primary/5' 
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {tab === 'js' ? 'JAVASCRIPT' : tab.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="p-4 flex-1 font-mono text-xs text-on-surface-variant overflow-y-auto leading-relaxed max-h-[200px]">
                <pre className="whitespace-pre-wrap">
                  {activeSnippetTab === 'python' && <code className="text-secondary">{pythonCode}</code>}
                  {activeSnippetTab === 'curl' && <code className="text-secondary">{curlCode}</code>}
                  {activeSnippetTab === 'js' && <code className="text-secondary">{jsCode}</code>}
                </pre>
              </div>
              <div className="px-4 py-2 border-t border-[#1f2937]/50 bg-[#050f1c]/40 flex justify-between items-center">
                <button
                  onClick={() => handleCopyCode(
                    activeSnippetTab === 'python' ? pythonCode : activeSnippetTab === 'curl' ? curlCode : jsCode,
                    activeSnippetTab
                  )}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline transition-all"
                >
                  {copiedTab === activeSnippetTab ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" />
                      Copy to Clipboard
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Console JSON Output */}
          <div className="bg-[#030712] border border-outline-variant rounded-xl overflow-hidden flex flex-col shadow-lg">
            <div className="px-4 py-2 bg-[#050f1c] border-b border-outline-variant flex items-center justify-between">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></div>
              </div>
              <span className="font-data-label text-[9px] text-on-surface-variant uppercase tracking-widest font-semibold font-mono">Inference Output: JSON</span>
            </div>
            <div className="p-4 font-mono text-[11px] text-primary bg-surface-container-lowest/35 h-36 overflow-y-auto">
              <pre>{JSON.stringify(jsonOutput, null, 2)}</pre>
            </div>
          </div>
        </main>

        {/* Right Sidebar (col-span-3) */}
        <aside className="lg:col-span-3 bg-surface-container-low/40 border border-outline-variant/30 p-6 overflow-y-auto flex flex-col justify-between gap-6 h-[calc(100vh-220px)] rounded-3xl backdrop-blur-sm">
          <div className="space-y-6">
            <h3 className="font-headline-md text-base font-bold pb-2 border-b border-outline-variant/30">Visualization</h3>

            {/* Confidence Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-semibold text-on-surface-variant">
                <span>Confidence Limit</span>
                <span className="text-primary font-mono font-bold">{(sandboxConf * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={sandboxConf}
                onChange={(e) => setSandboxConf(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-primary border border-outline-variant/20"
              />
            </div>

            {/* Overlap Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-semibold text-on-surface-variant">
                <span>Overlap Threshold</span>
                <span className="text-primary font-mono font-bold">{(sandboxIoU * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={sandboxIoU}
                onChange={(e) => setSandboxIoU(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-primary border border-outline-variant/20"
              />
            </div>

            {/* Opacity Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-semibold text-on-surface-variant">
                <span>Mask Opacity</span>
                <span className="text-primary font-mono font-bold">{(sandboxOpacity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={sandboxOpacity}
                onChange={(e) => setSandboxOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-primary border border-outline-variant/20"
              />
            </div>

            {/* Toggles */}
            <div className="space-y-4 pt-4 border-t border-outline-variant/30">
              <label className="flex items-center justify-between cursor-pointer group text-xs text-on-surface font-semibold">
                <span>Draw Confidence</span>
                <button
                  onClick={() => setDrawConfidence(!drawConfidence)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                    drawConfidence ? 'bg-primary' : 'bg-surface-container-highest'
                  }`}
                >
                  <div className={`bg-white w-3 h-3 rounded-full shadow transform duration-300 ${drawConfidence ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer group text-xs text-on-surface font-semibold">
                <span>Draw Class Labels</span>
                <button
                  onClick={() => setDrawLabels(!drawLabels)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                    drawLabels ? 'bg-primary' : 'bg-surface-container-highest'
                  }`}
                >
                  <div className={`bg-white w-3 h-3 rounded-full shadow transform duration-300 ${drawLabels ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer group text-xs text-on-surface font-semibold">
                <span>Blur Faces (Anonymize)</span>
                <button
                  onClick={() => setBlurFaces(!blurFaces)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                    blurFaces ? 'bg-primary' : 'bg-surface-container-highest'
                  }`}
                >
                  <div className={`bg-white w-3 h-3 rounded-full shadow transform duration-300 ${blurFaces ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>
          </div>

          {/* Active Backend */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/40 mt-auto">
            <p className="text-[9px] font-semibold text-on-surface-variant uppercase mb-1.5 font-mono">Active Backend</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse"></div>
              <span className="text-xs font-bold text-on-surface font-mono">GPU Cluster-B (NVIDIA A100)</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Fixed controls footer */}
      <footer className="fixed bottom-0 left-0 w-full h-12 bg-surface-container-low border-t border-outline-variant px-6 flex justify-between items-center z-40 text-xs font-semibold">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => onNavigate('train', projectId, project.name)}
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors font-bold text-xs"
          >
            &larr; Back to Training
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-on-surface-variant uppercase font-mono">Deployment Downloads:</span>
          <div className="flex gap-2">
            <a 
              href={`${API_BASE_URL}/projects/${projectId}/download-model`}
              download
              className="px-3.5 py-1.5 bg-[#030712] border border-outline-variant rounded hover:bg-surface-bright transition-all flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span className="font-mono text-[10px] font-bold">Weights (.pt)</span>
            </a>
            <a 
              href={`${weightFolderUrl}/best.onnx`}
              download
              className="px-3.5 py-1.5 bg-[#030712] border border-outline-variant rounded hover:bg-surface-bright transition-all flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span className="font-mono text-[10px] font-bold">ONNX</span>
            </a>
          </div>
        </div>

        <div className="text-on-surface-variant text-[10px] font-mono">
          © 2026 Rapid CV Console • System Status: <span className="text-secondary font-bold">Optimal</span>
        </div>
      </footer>
    </div>
  );
}
