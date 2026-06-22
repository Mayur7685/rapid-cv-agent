import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Search, RotateCcw,
  MousePointer2, Square, Hand, ZoomIn, ZoomOut, Share2, ChevronUp, ChevronDown, Eye
} from 'lucide-react';
import BoxCanvas from './BoxCanvas';

const BACKEND_URL = 'http://127.0.0.1:8000';
const API_BASE = `${BACKEND_URL}/api`;
const STATIC_BASE = `${BACKEND_URL}/static`;

const CLASS_COLORS = [
  '#7c3aed', '#3b82f6', '#10b981', '#f97316',
  '#ec4899', '#06b6d4', '#eab308', '#ef4444'
];

export default function LabelReview({ projectId, projectName, onNext, onBack, onNavigate }) {
  const [project, setProject] = useState(null);
  const [images, setImages] = useState([]);
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);

  const [activeImageId, setActiveImageId] = useState(null);
  const [activeClassIndex, setActiveClassIndex] = useState(0);
  const [confidence, setConfidence] = useState(0.50);
  const [nlpPrompt, setNlpPrompt] = useState('');
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('editor'); // editor | gallery

  const canvasRef = useRef(null);

  useEffect(() => {
    fetchAll();
  }, [projectId]);

  useEffect(() => {
    if (images.length > 0 && activeImageId === null) {
      const pending = images.find(i => i.status !== 'reviewed');
      setActiveImageId(pending ? pending.id : images[0].id);
    }
  }, [images]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (viewMode !== 'editor' || !activeImageId) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.key === 'd') { e.preventDefault(); navigateImage(1); }
      if (e.key === 'a') { e.preventDefault(); navigateImage(-1); }
      const n = parseInt(e.key);
      if (!isNaN(n) && n > 0 && n <= (project?.classes?.length || 0)) {
        e.preventDefault();
        setActiveClassIndex(n - 1);
        canvasRef.current?.updateSelectedBoxClass?.(n - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, activeImageId, project]);

  const fetchAll = async () => {
    try {
      const [projRes, imgRes, lblRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}`),
        fetch(`${API_BASE}/projects/${projectId}/images`),
        fetch(`${API_BASE}/projects/${projectId}/labels`),
      ]);
      const proj = await projRes.json();
      const imgs = await imgRes.json();
      const lbls = lblRes.ok ? await lblRes.json() : {};
      setProject(proj);
      setImages(imgs);
      setLabels(lbls);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const navigateImage = (dir) => {
    const idx = images.findIndex(i => i.id === activeImageId);
    const next = images[idx + dir];
    if (next) { setActiveImageId(next.id); setSelectedBoxId(null); }
  };

  const handleApprove = async () => {
    if (!activeImageId || !canvasRef.current) return;
    setSaving(true);
    const boxes = canvasRef.current.getNormalizedBoxes();
    try {
      await fetch(`${API_BASE}/images/${activeImageId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: boxes })
      });
      await fetchAll();
      navigateImage(1);
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); setSelectedBoxId(null); }
  };

  const handleRunDINO = () => {
    const term = nlpPrompt.trim().toLowerCase();
    if (term && project && !project.classes.includes(term)) {
      setProject(prev => ({ ...prev, classes: [...prev.classes, term] }));
    }
    setNlpPrompt('');
  };

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-[#060b14]">
        <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
      </div>
    );
  }

  const activeImg = images.find(i => i.id === activeImageId);
  const activeLabels = activeImageId ? (labels[activeImageId]?.labels || []) : [];
  const reviewedCount = images.filter(i => i.status === 'reviewed').length;
  const totalCount = images.length;
  const TARGET = Math.max(10, Math.min(totalCount, 20));
  const classes = project.classes || [];

  // Gallery filtered list
  const filteredImages = images;

  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#060b14]">

      {/* ── Left: Thumbnail Rail ── */}
      <aside className="w-[72px] bg-[#0a0f1c] border-r border-white/[0.06] flex flex-col items-center py-2 gap-1.5 overflow-y-auto">
        <button onClick={() => navigateImage(-1)} className="p-1.5 text-white/30 hover:text-white/60 transition-colors">
          <ChevronUp className="w-4 h-4" />
        </button>

        {images.map(img => {
          const imgLabels = labels[img.id]?.labels || [];
          const isReviewed = img.status === 'reviewed';
          const isActive = img.id === activeImageId;

          return (
            <button
              key={img.id}
              onClick={() => { setActiveImageId(img.id); setSelectedBoxId(null); }}
              className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                isActive ? 'border-[#7c3aed] shadow-lg shadow-purple-500/30' :
                isReviewed ? 'border-emerald-500/40 opacity-75 hover:opacity-100' :
                'border-transparent opacity-50 hover:opacity-90 hover:border-white/20'
              }`}
            >
              <img src={`${STATIC_BASE}/${img.file_path}`} alt="" className="w-full h-full object-cover" />
              {isReviewed && (
                <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" strokeWidth={3} />
                </div>
              )}
              {!isReviewed && imgLabels.length > 0 && (
                <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-amber-500 rounded-full" />
              )}
            </button>
          );
        })}

        <button onClick={() => navigateImage(1)} className="p-1.5 text-white/30 hover:text-white/60 transition-colors mt-auto">
          <ChevronDown className="w-4 h-4" />
        </button>
      </aside>

      {/* ── Center: Canvas ── */}
      <main className="flex-1 flex flex-col bg-[#070c18] relative">
        {/* Toolbar */}
        <div className="h-10 border-b border-white/[0.06] flex items-center justify-between px-3 gap-2">
          {activeImg && (
            <span className="text-white/40 text-xs font-mono truncate max-w-[200px]">
              {activeImg.file_path?.split('/').pop()}
              {activeImg.status === 'reviewed' && (
                <span className="ml-2 text-emerald-400 font-semibold">Draft ✓</span>
              )}
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {/* View mode toggle */}
            <div className="flex bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('editor')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${viewMode === 'editor' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}
              >
                Editor
              </button>
              <button
                onClick={() => setViewMode('gallery')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${viewMode === 'gallery' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}
              >
                Gallery
              </button>
            </div>

            {/* Annotation tools */}
            {viewMode === 'editor' && (
              <>
                <div className="h-4 w-px bg-white/[0.08]" />
                <button className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded transition-all" title="Select (V)">
                  <MousePointer2 className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded transition-all" title="Draw Box (W)">
                  <Square className="w-3.5 h-3.5" />
                </button>
                <div className="h-4 w-px bg-white/[0.08]" />
                <button onClick={fetchAll} className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded transition-all" title="Reset">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Canvas or Gallery */}
        {viewMode === 'editor' ? (
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            {activeImg ? (
              <BoxCanvas
                ref={canvasRef}
                imageUrl={`${STATIC_BASE}/${activeImg.file_path}`}
                initialBoxes={activeLabels}
                classes={classes}
                activeClassIndex={activeClassIndex}
                confidenceThreshold={confidence}
                onSelect={setSelectedBoxId}
              />
            ) : (
              <div className="text-white/20 text-sm">Select an image from the left</div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {filteredImages.map(img => {
                const imgLabels = labels[img.id]?.labels || [];
                const isReviewed = img.status === 'reviewed';
                return (
                  <button
                    key={img.id}
                    onClick={() => { setActiveImageId(img.id); setViewMode('editor'); }}
                    className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${
                      isReviewed ? 'border-emerald-500/40' :
                      imgLabels.length === 0 ? 'border-red-500/30' : 'border-amber-500/30'
                    }`}
                  >
                    <img src={`${STATIC_BASE}/${img.file_path}`} alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        isReviewed ? 'bg-emerald-500 text-white' :
                        imgLabels.length === 0 ? 'bg-red-500/80 text-white' : 'bg-amber-500/80 text-white'
                      }`}>
                        {isReviewed ? '✓' : imgLabels.length}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── Right: Guidance Panel ── */}
      <aside className="w-72 guidance-panel flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">How is your model looking?</h3>
          <p className="text-xs text-gray-400 mt-0.5">Adjust confidence and approve images before training.</p>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Options: Use Model / Improve Model */}
          <div className="space-y-2">
            <div
              className="guidance-action-card active"
              onClick={onNext}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Proceed to Training</p>
                  <p className="text-xs text-gray-400 mt-0.5">Move to augmentation and model training.</p>
                </div>
              </div>
            </div>

            <div className="guidance-action-card" onClick={onBack}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700">Add More Images</p>
                  <p className="text-xs text-gray-400 mt-0.5">Go back to upload more data.</p>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Confidence slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-600">Confidence Threshold</span>
              <span className="text-xs font-bold text-purple-600">{Math.round(confidence * 100)}%</span>
            </div>
            <input
              type="range" min={0.1} max={1.0} step={0.05}
              value={confidence}
              onChange={e => setConfidence(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-purple-600 bg-gray-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* Find Objects prompt */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 block">Find Objects (Zero-Shot)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nlpPrompt}
                onChange={e => setNlpPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRunDINO()}
                placeholder="person, card, dog..."
                className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 placeholder-gray-300 text-gray-700 transition-all"
              />
              <button
                onClick={handleRunDINO}
                className="px-3 py-2 bg-[#7c3aed] text-white rounded-xl text-xs font-bold hover:bg-[#6d28d9] transition-colors"
              >
                Find
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {classes.map((cls, i) => (
                <span key={cls} className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 rounded-full text-[10px] font-semibold text-purple-700">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
                  {cls}
                </span>
              ))}
            </div>
          </div>

          {/* Active drawing class */}
          {viewMode === 'editor' && classes.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 block">Active Class</label>
              <div className="flex flex-wrap gap-1.5">
                {classes.map((cls, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveClassIndex(i)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                      activeClassIndex === i
                        ? 'text-white border-transparent'
                        : 'text-gray-500 border-gray-200 hover:border-purple-200 hover:text-purple-600'
                    }`}
                    style={activeClassIndex === i ? { background: CLASS_COLORS[i % CLASS_COLORS.length], borderColor: CLASS_COLORS[i % CLASS_COLORS.length] } : {}}
                  >
                    {cls} <span className="opacity-50 text-[9px]">[{i + 1}]</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected box controls */}
          {selectedBoxId && viewMode === 'editor' && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-purple-700 uppercase">Selected Box</span>
                <button
                  onClick={() => canvasRef.current?.deleteSelectedBox?.()}
                  className="text-[10px] font-bold text-red-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {classes.map((cls, i) => (
                  <button
                    key={i}
                    onClick={() => canvasRef.current?.updateSelectedBoxClass?.(i)}
                    className="px-2 py-1 bg-white border border-gray-200 hover:border-purple-300 text-[10px] font-bold text-gray-600 rounded-lg truncate text-left"
                  >
                    {cls}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Keyboard hints */}
          <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
            <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Shortcuts</p>
            <div className="space-y-1 text-[10px] text-gray-500">
              <div className="flex justify-between"><kbd className="bg-white border border-gray-200 px-1.5 rounded font-mono">D</kbd> <span>Next image</span></div>
              <div className="flex justify-between"><kbd className="bg-white border border-gray-200 px-1.5 rounded font-mono">A</kbd> <span>Prev image</span></div>
              <div className="flex justify-between"><kbd className="bg-white border border-gray-200 px-1.5 rounded font-mono">1-9</kbd> <span>Set class</span></div>
              <div className="flex justify-between"><kbd className="bg-white border border-gray-200 px-1.5 rounded font-mono">Del</kbd> <span>Delete box</span></div>
            </div>
          </div>
        </div>

        {/* Approve button footer */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500 font-medium">
              <span>{TARGET - reviewedCount > 0 ? `${TARGET - reviewedCount} more until next retrain` : 'Ready to train!'}</span>
              <span className="text-gray-700 font-bold">{reviewedCount}/{TARGET}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7c3aed] rounded-full transition-all"
                style={{ width: `${Math.min(100, (reviewedCount / TARGET) * 100)}%` }}
              />
            </div>
          </div>

          <button
            onClick={handleApprove}
            disabled={!activeImg || saving}
            className="w-full py-3 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-500/20"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Check className="w-4 h-4" /> Approve Image</>
            )}
          </button>

          <button
            onClick={onNext}
            className="w-full py-2.5 border border-gray-200 text-gray-600 font-semibold text-xs rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            Proceed to Augment & Split <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    </div>
  );
}
