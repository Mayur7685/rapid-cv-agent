import React, { useState, useCallback, useRef } from 'react';
import { Upload, Camera, Tag, X, Plus, Trash2, Loader2, ArrowRight, ArrowLeft, Folder, Search, Sparkles } from 'lucide-react';
import GuidancePanel from './GuidancePanel';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const API_BASE = 'http://127.0.0.1:8000/api';

const CLASS_COLORS = ['bg-yellow-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500', 'bg-violet-500', 'bg-red-500'];

export default function UploadStage({
  projectId, projectName, projectClasses, onClassesChange, onNext, onBack
}) {
  const [classes, setClasses] = useState(projectClasses || []);
  const [newClass, setNewClass] = useState('');
  const [stagedFiles, setStagedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Webcam stream states
  const [webcamActive, setWebcamActive] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const videoRef = useRef(null);
  const [mediaStream, setMediaStream] = useState(null);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      setMediaStream(stream);
      setWebcamActive(true);
      setCapturedPreview(null);
      setCapturedBlob(null);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (e) {
      alert("Unable to access webcam: " + e.message);
    }
  };

  const stopWebcam = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setWebcamActive(false);
    setCapturedPreview(null);
    setCapturedBlob(null);
  };

  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPreview(previewUrl);
      }
    }, "image/jpeg", 0.95);
  };

  const saveWebcamImage = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `webcam_${Date.now()}.jpg`, { type: "image/jpeg" });
    addFiles([file]);
    stopWebcam();
  };

  const handleAddClass = (val) => {
    const c = (val || newClass).trim().toLowerCase();
    if (c && !classes.includes(c)) {
      const updated = [...classes, c];
      setClasses(updated);
      onClassesChange?.(updated);
    }
    setNewClass('');
  };

  const handleRemoveClass = (cls) => {
    const updated = classes.filter(c => c !== cls);
    setClasses(updated);
    onClassesChange?.(updated);
  };

  const handleVlmSuggestClasses = async () => {
    setSuggesting(true);
    try {
      // 1. Fetch images for this project
      const imgRes = await fetch(`${API_BASE}/projects/${projectId}/images`);
      const imgs = await imgRes.json();
      if (imgs.length === 0) {
        alert("Please upload and ingest at least one image first to run class suggestions.");
        return;
      }
      
      // 2. Query the first image for class suggestions
      const targetImageId = imgs[0].id;
      const res = await fetch(`${API_BASE}/vlm/${projectId}/images/${targetImageId}/suggest-classes`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      
      if (data.suggested_classes && data.suggested_classes.length > 0) {
        let updated = [...classes];
        data.suggested_classes.forEach(c => {
          if (!updated.includes(c)) updated.push(c);
        });
        setClasses(updated);
        onClassesChange?.(updated);
      } else {
        alert("Local VLM did not return any distinct class suggestions.");
      }
    } catch (e) {
      alert("Failed to auto-suggest classes: " + e.message);
    } finally {
      setSuggesting(false);
    }
  };

  const addFiles = (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    setStagedFiles(prev => [...prev, ...imgs]);
    const newPreviews = imgs.map(f => ({
      name: f.name,
      size: (f.size / 1024 / 1024).toFixed(1) + ' MB',
      url: URL.createObjectURL(f)
    }));
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  const handleFileInput = (e) => addFiles(e.target.files);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleRemove = (i) => {
    setStagedFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleUpload = async () => {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    const form = new FormData();
    stagedFiles.forEach(f => form.append('files', f));
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/images/upload`, {
        method: 'POST',
        body: form
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUploadResult(data);
      setUploadDone(true);
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const suggestions = ['helmet', 'safety vest', 'person', 'car', 'truck', 'fire', 'crack', 'defect'];

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* ── Left: Staging Yard ── */}
      <aside className="w-56 bg-[#0a0f1c] border-r border-white/[0.06] flex flex-col p-3 gap-3">
        <div className="border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2 text-white/80 text-xs font-bold">
            <Folder className="w-3.5 h-3.5" />
            Staging Yard
          </div>
          <p className="text-white/30 text-[10px] mt-1">{stagedFiles.length} files</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {previews.length === 0 ? (
            <div className="text-center py-8 text-white/20 text-xs border border-white/[0.06] border-dashed rounded-xl">
              No files staged
            </div>
          ) : (
            previews.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-white/[0.04] rounded-lg border border-white/[0.06] group">
                <img src={f.url} alt="" className="w-8 h-8 object-cover rounded flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-[10px] truncate font-mono">{f.name}</p>
                  <p className="text-white/30 text-[9px]">{f.size}</p>
                </div>
                <button
                  onClick={() => handleRemove(i)}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all p-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Center: Drop Zone ── */}
      <main className="flex-1 bg-[#060b14] flex flex-col items-center justify-center p-8 relative">
        <input
          type="file"
          id="upload-input"
          multiple
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Upload dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`w-full max-w-2xl border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center min-h-[360px] transition-all duration-200 ${
            dragOver
              ? 'border-[#eab308] bg-yellow-500/5'
              : uploadDone
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-white/[0.12] bg-white/[0.02] hover:border-white/20'
          }`}
        >
          {webcamActive ? (
            <div className="w-full flex flex-col items-center gap-4 relative z-20">
              <h3 className="text-sm font-bold text-white mb-1">Webcam Snapshot Capture</h3>
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black aspect-video max-w-md w-full">
                {capturedPreview ? (
                  <img src={capturedPreview} alt="Snapshot preview" className="w-full h-full object-cover" />
                ) : (
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex gap-2.5">
                {capturedPreview ? (
                  <>
                    <button onClick={() => { setCapturedPreview(null); setCapturedBlob(null); }} className="px-4 py-2 border border-white/10 text-white hover:bg-white/5 font-bold rounded-xl text-xs">
                      Retake
                    </button>
                    <button onClick={saveWebcamImage} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs">
                      Add to Staging Yard
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={captureFrame} className="px-4 py-2 bg-[#eab308] hover:bg-[#ca8a04] text-black font-extrabold rounded-xl text-xs cursor-pointer">
                      Take Photo
                    </button>
                    <button onClick={stopWebcam} className="px-4 py-2 border border-white/10 text-white hover:bg-white/5 font-bold rounded-xl text-xs">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : uploadDone ? (
            <>
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Upload Complete!</h3>
              <p className="text-white/40 text-sm text-center">
                {uploadResult?.images_ingested} images ingested
                {uploadResult?.images_deduplicated > 0 && ` · ${uploadResult.images_deduplicated} duplicates removed`}
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                  <Upload className="w-5 h-5 text-white/50" />
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                  <Camera className="w-5 h-5 text-white/50" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {stagedFiles.length > 0 ? `${stagedFiles.length} files ready` : 'Drop images here'}
              </h3>
              <p className="text-white/30 text-sm text-center mb-6">
                JPG, PNG, WEBP supported. Drag & drop or choose files.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => document.getElementById('upload-input').click()}
                  className="btn-primary"
                >
                  Choose Files
                </button>
                <button
                  onClick={startWebcam}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Camera className="w-3.5 h-3.5" /> Use Webcam
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="absolute bottom-6 left-8 right-0 flex items-center gap-3">
          <Button onClick={onBack} variant="outline" className="flex items-center gap-2 text-xs cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
          {uploadDone ? (
            <Button
              onClick={() => onNext(projectId, projectName)}
              className="bg-[#eab308] hover:bg-[#ca8a04] text-black font-extrabold flex items-center gap-2 text-xs shadow-lg shadow-yellow-500/10 cursor-pointer"
            >
              Start Auto-Labeling <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              onClick={handleUpload}
              disabled={stagedFiles.length === 0 || uploading}
              className="bg-[#eab308] hover:bg-[#ca8a04] text-black font-extrabold flex items-center gap-2 text-xs disabled:opacity-50 shadow-lg shadow-yellow-500/10 cursor-pointer"
            >
              {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Uploading...</> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload {stagedFiles.length > 0 ? `${stagedFiles.length} Files` : 'Files'}</>}
            </Button>
          )}
        </div>
      </main>

      {/* ── Right: Ontology Builder (Guidance Panel) ── */}
      <aside className="w-64 guidance-panel p-4 flex flex-col gap-4 overflow-y-auto bg-white border-l border-gray-100">
        <div className="border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2 text-gray-800 font-bold text-sm">
            <Tag className="w-4 h-4 text-yellow-600" />
            What objects are you looking for?
          </div>
          <p className="text-gray-400 text-xs mt-1">Powered by Grounding DINO</p>
        </div>

        {/* Add class */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
          <Input
            type="text"
            value={newClass}
            onChange={e => setNewClass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClass(); }}}
            placeholder="Add class (e.g. helmet)"
            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-700 outline-none focus-visible:ring-yellow-200"
          />
        </div>

        {/* Suggest classes from local VLM */}
        {projectId && (
          <Button
            type="button"
            onClick={handleVlmSuggestClasses}
            disabled={suggesting}
            variant="outline"
            className="w-full py-2 bg-yellow-50 hover:bg-yellow-100/50 disabled:opacity-50 text-yellow-800 font-bold text-[10px] rounded-lg border border-yellow-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {suggesting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 animate-pulse text-yellow-600 mr-1.5" /> VLM Auto-Suggest Classes</>
            )}
          </Button>
        )}

        {/* Suggestions */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Try these:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.filter(s => !classes.includes(s)).slice(0, 6).map(s => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => handleAddClass(s)}
                className="h-7 px-2.5 rounded-full text-[11px] text-gray-500 hover:border-yellow-400 hover:text-yellow-700 transition-all cursor-pointer"
              >
                + {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Active classes */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Active Classes ({classes.length})</p>
          <div className="space-y-2">
            {classes.length === 0 ? (
              <p className="text-xs text-gray-300 italic">No classes yet</p>
            ) : (
              classes.map((cls, i) => (
                <Card key={cls} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-xl group relative">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${CLASS_COLORS[i % CLASS_COLORS.length]}`} />
                    <span className="text-xs font-semibold text-gray-700">{cls}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveClass(cls)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-0 h-6 w-6 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="mt-auto p-3 bg-yellow-50 border border-yellow-100 rounded-xl">
          <p className="text-[11px] text-yellow-800 font-semibold leading-relaxed">
            💡 Upload 20–50 images per class for best results. You can always add more later.
          </p>
        </div>
      </aside>
      </div>
  );
}
