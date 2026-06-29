import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Download, Code2, Terminal, Globe,
  ArrowLeft, TrendingUp, Loader2, Sliders, Eye,
  Copy, Check, Star, Zap, AlertTriangle, RefreshCcw
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

const CLASS_COLORS_HEX = [
  '#eab308', '#3b82f6', '#10b981', '#f97316',
  '#ec4899', '#06b6d4', '#7c3aed', '#ef4444'
];

function useClassColors(classes) {
  const map = {};
  (classes || []).forEach((c, i) => { map[c] = CLASS_COLORS_HEX[i % CLASS_COLORS_HEX.length]; });
  return map;
}

// ── Inference Canvas ──────────────────────────────────────────────────────────
function InferenceCanvas({ imageUrl, detections, classes, confidence, opacity = 0.85 }) {
  const colorMap = useClassColors(classes);
  const imgRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1, displayW: 1, displayH: 1 });

  const handleLoad = () => {
    const el = imgRef.current;
    if (el) {
      setImgSize({
        w: el.naturalWidth,
        h: el.naturalHeight,
        displayW: el.clientWidth,
        displayH: el.clientHeight,
      });
    }
  };

  const filtered = detections.filter(d => d.confidence >= confidence);

  const scale = (v, axis) => {
    const ratio = axis === 'x' ? imgSize.displayW / imgSize.w : imgSize.displayH / imgSize.h;
    return v * ratio;
  };

  return (
    <div className="relative inline-block">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="inference"
        onLoad={handleLoad}
        className="max-h-[440px] max-w-full rounded-xl object-contain"
        style={{ opacity }}
      />
      {filtered.map((det, i) => {
        const [x1, y1, x2, y2] = det.bbox;
        const left = scale(x1, 'x');
        const top = scale(y1, 'y');
        const width = scale(x2 - x1, 'x');
        const height = scale(y2 - y1, 'y');
        const color = colorMap[det.class_name] || '#eab308';
        return (
          <div key={i} className="detection-box" style={{ left, top, width, height, borderColor: color }}>
            <div className="detection-label" style={{ background: color, color: '#fff', fontSize: 10 }}>
              {det.class_name} {Math.round(det.confidence * 100)}%
            </div>
          </div>
        );
      })}
      {filtered.length > 0 && (
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-[10px] font-bold rounded-lg">
          {filtered.length} object{filtered.length !== 1 ? 's' : ''} detected
        </div>
      )}
    </div>
  );
}

// ── Code snippet tabs ─────────────────────────────────────────────────────────
const CODE_SNIPPETS = {
  python: (pid) => `from inference_sdk import InferenceHTTPClient

CLIENT = InferenceHTTPClient(
    api_url="http://localhost:8000",
)

result = CLIENT.infer(
    "YOUR_IMAGE.jpg",
    model_id="${pid}"
)
print(result)`,
  curl: (pid) => `curl -X POST "http://localhost:8000/api/projects/${pid}/inference" \\
  -F "file=@your_image.jpg" \\
  -F "confidence=0.5"`,
  javascript: (pid) => `const formData = new FormData();
formData.append('file', imageFile);

const response = await fetch(
  \`http://localhost:8000/api/projects/${pid}/inference?confidence=0.5\`,
  { method: 'POST', body: formData }
);
const result = await response.json();
console.log(result.detections);`,
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function TestDeployStage({
  projectId, projectName, projectClasses, onBack, onImprove, initialTab = 'test'
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [modelStatus, setModelStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Test tab state
  const [testImage, setTestImage] = useState(null);
  const [testImageUrl, setTestImageUrl] = useState(null);
  const [detections, setDetections] = useState([]);
  const [inferencing, setInferencing] = useState(false);
  const [infError, setInfError] = useState('');

  // Visualization controls
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [overlapThreshold, setOverlapThreshold] = useState(0.5);
  const [opacity, setOpacity] = useState(0.85);
  const [labelDisplay, setLabelDisplay] = useState('confidence');

  // Deploy tab
  const [codeTab, setCodeTab] = useState('python');
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchModelStatus(); }, [projectId]);

  const fetchModelStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/model-status`);
      if (res.ok) setModelStatus(await res.json());
    } finally { setLoadingStatus(false); }
  };

  const handleImageSelect = (file) => {
    if (!file) return;
    setTestImage(file);
    setTestImageUrl(URL.createObjectURL(file));
    setDetections([]);
    setInfError('');
  };

  const handleInfer = async () => {
    if (!testImage) return;
    setInferencing(true);
    setInfError('');
    const form = new FormData();
    form.append('file', testImage);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/inference?confidence=${confThreshold}`, {
        method: 'POST',
        body: form
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDetections(data.detections || []);
    } catch (e) {
      setInfError('Inference failed: ' + e.message);
    } finally { setInferencing(false); }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS[codeTab](projectId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const evalReport = modelStatus?.eval_report || {};
  const perClass = evalReport?.per_class_metrics || {};
  const latestRun = modelStatus?.latest_run;
  const classes = projectClasses || [];

  const filteredDetections = detections.filter(d => d.confidence >= confThreshold);

  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#0a0f1c]">

      {/* ── Left sidebar: test set + upload ── */}
      {activeTab === 'test' && (
        <aside className="w-56 bg-[#060b14] border-r border-white/[0.06] flex flex-col p-4 gap-4">
          <div>
            <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-3">Test Image</p>
            <div className="border-2 border-dashed border-white/[0.12] rounded-xl p-4 text-center hover:border-purple-500/40 transition-all cursor-pointer"
              onClick={() => document.getElementById('test-upload').click()}
            >
              <Upload className="w-5 h-5 text-white/20 mx-auto mb-1" />
              <p className="text-white/30 text-[11px] font-medium">Drop Files or</p>
              <button className="text-[11px] font-bold text-purple-400 hover:text-purple-300 mt-0.5">+ Select Files</button>
              <input id="test-upload" type="file" accept="image/*" className="hidden" onChange={e => handleImageSelect(e.target.files[0])} />
            </div>
          </div>

          {testImageUrl && (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-yellow-500/30">
                <img src={testImageUrl} alt="" className="w-full h-24 object-cover" />
              </div>
              <button
                onClick={handleInfer}
                disabled={inferencing}
                className="w-full py-2 bg-[#eab308] hover:bg-[#ca8a04] disabled:bg-white/10 disabled:text-white/30 text-black font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-yellow-500/10 cursor-pointer"
              >
                {inferencing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running...</> : <><Zap className="w-3.5 h-3.5" /> Run Inference</>}
              </button>
            </div>
          )}

          {infError && (
            <p className="text-red-400 text-[10px] leading-relaxed">{infError}</p>
          )}

          {/* Model visualizations note */}
          {detections.length > 0 && (
            <div className="p-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl">
              <p className="text-white/40 text-[10px] leading-relaxed">
                {modelStatus?.is_real_model ? '✓ Real YOLO model' : '⚡ Mock detections'}
              </p>
            </div>
          )}
        </aside>
      )}

      {/* ── Center: Canvas / Deploy content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Tab bar */}
        <div className="h-10 border-b border-white/[0.06] flex items-center px-4 gap-4">
          {['test', 'deploy'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs font-bold capitalize transition-colors pb-0.5 border-b-2 cursor-pointer ${
                activeTab === tab
                  ? 'text-white border-[#eab308]'
                  : 'text-white/30 border-transparent hover:text-white/60'
              }`}
            >
              {tab === 'test' ? '🔬 Test Model' : '🚀 Deploy & API'}
            </button>
          ))}

          {latestRun && (
            <div className="ml-auto flex items-center gap-3 text-xs text-white/30">
              <span>mAP50: <span className="text-emerald-400 font-bold">{((latestRun.map50 || 0) * 100).toFixed(1)}%</span></span>
              <span>Loss: <span className="text-white/50 font-mono">{latestRun.loss?.toFixed(4)}</span></span>
            </div>
          )}
        </div>

        {activeTab === 'test' && (
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
            {testImageUrl ? (
              <div className="relative">
                <InferenceCanvas
                  imageUrl={testImageUrl}
                  detections={detections}
                  classes={classes}
                  confidence={confThreshold}
                  opacity={opacity}
                />
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-white/[0.04] border border-white/[0.08] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-7 h-7 text-white/20" />
                </div>
                <p className="text-white/30 text-sm font-semibold mb-1">No image selected</p>
                <p className="text-white/20 text-xs">Upload an image from the left panel to test your model</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'deploy' && (
          <div className="flex-1 overflow-y-auto p-6">
            {loadingStatus ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Model card */}
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-white/[0.06]">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-white">{projectName}</h2>
                        <p className="text-white/40 text-sm">Computer Vision Model · Object Detection</p>
                      </div>
                      {modelStatus?.is_real_model ? (
                        <span className="badge badge-green">Real Model</span>
                      ) : (
                        <span className="badge badge-amber">Mock</span>
                      )}
                    </div>
                  </div>
                  <div className="p-5 grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-white/[0.03] rounded-xl">
                      <p className="text-xl font-bold text-emerald-400">{((latestRun?.map50 || 0) * 100).toFixed(1)}%</p>
                      <p className="text-white/30 text-xs mt-0.5">mAP@50</p>
                    </div>
                    <div className="text-center p-3 bg-white/[0.03] rounded-xl">
                      <p className="text-xl font-bold text-white">{classes.length}</p>
                      <p className="text-white/30 text-xs mt-0.5">Classes</p>
                    </div>
                    <div className="text-center p-3 bg-white/[0.03] rounded-xl">
                      <p className="text-xl font-bold text-purple-400">{latestRun?.epoch || '—'}</p>
                      <p className="text-white/30 text-xs mt-0.5">Epochs</p>
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <p className="text-xs text-white/30 font-bold uppercase mb-2">Classes ({classes.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {classes.map((cls, i) => (
                        <span key={cls} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.05] border border-white/[0.08] rounded-full text-xs font-semibold text-white/70">
                          <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLORS_HEX[i % CLASS_COLORS_HEX.length] }} />
                          {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Code snippets */}
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">How to use the API</h3>
                    <div className="flex gap-1">
                      {Object.keys(CODE_SNIPPETS).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setCodeTab(tab)}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            codeTab === tab ? 'bg-[#eab308] text-black' : 'text-white/40 hover:text-white/70'
                          }`}
                        >
                          {tab === 'python' ? 'Python' : tab === 'curl' ? 'cURL' : 'JavaScript'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <pre className="p-5 text-xs font-mono text-[#fef08a] overflow-x-auto bg-[#050505] border border-white/[0.04] leading-relaxed">
                      {CODE_SNIPPETS[codeTab](projectId)}
                    </pre>
                    <button
                      onClick={copyCode}
                      className="absolute top-3 right-3 p-2 bg-white/[0.06] hover:bg-white/10 rounded-lg transition-all"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white/40" />}
                    </button>
                  </div>
                </div>

                {/* Downloads */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Download Model (.pt)', icon: Download, desc: 'PyTorch weights file', action: () => window.open(`${API_BASE}/projects/${projectId}/download-model`, '_blank') },
                    { label: 'Improve Model', icon: RefreshCcw, desc: 'Upload more images & retrain', action: onImprove },
                  ].map(({ label, icon: Icon, desc, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/[0.08] hover:border-white/20 rounded-2xl text-left transition-all group"
                    >
                      <div className="w-9 h-9 bg-white/[0.06] rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-all">
                        <Icon className="w-4.5 h-4.5 text-white/50" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-white/80 font-bold text-xs">{label}</p>
                        <p className="text-white/30 text-[10px]">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Right: Visualization controls ── */}
      {activeTab === 'test' && (
        <aside className="w-64 guidance-panel flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-yellow-600" />
              Model Visualizations
            </h3>
          </div>

          <div className="p-4 space-y-5 flex-1">
            {/* Sliders */}
            {[
              { label: 'Confidence Threshold', val: confThreshold, set: setConfThreshold, min: 0.1, max: 1.0, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
              { label: 'Overlap Threshold', val: overlapThreshold, set: setOverlapThreshold, min: 0.1, max: 1.0, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
              { label: 'Opacity Threshold', val: opacity, set: setOpacity, min: 0.3, max: 1.0, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
            ].map(({ label, val, set, min, max, step, fmt }) => (
              <div key={label} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-600">{label}</span>
                  <span className="text-xs font-bold text-yellow-750">{fmt(val)}</span>
                </div>
                <input
                  type="range" min={min} max={max} step={step}
                  value={val} onChange={e => set(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-yellow-500 bg-gray-200 rounded-lg cursor-pointer"
                />
              </div>
            ))}

            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-600 block">Label Display</span>
              <select
                value={labelDisplay}
                onChange={e => setLabelDisplay(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-700 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 cursor-pointer"
              >
                <option value="confidence">Draw Confidence</option>
                <option value="class">Class Name Only</option>
                <option value="none">No Labels</option>
              </select>
            </div>

            {/* Detection output */}
            {filteredDetections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Output</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-[10px] font-mono text-gray-600 overflow-auto max-h-48">
                  {JSON.stringify({ predictions: filteredDetections }, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 space-y-2">
            <button onClick={onBack} className="w-full py-2 text-xs border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-semibold flex items-center justify-center gap-1 cursor-pointer">
              <ArrowLeft className="w-3 h-3" /> Back to Training
            </button>
            <button
              onClick={() => setActiveTab('deploy')}
              className="w-full py-2 bg-[#eab308] text-black text-xs rounded-xl font-extrabold hover:bg-[#ca8a04] transition-colors cursor-pointer"
            >
              🚀 Deploy API
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
