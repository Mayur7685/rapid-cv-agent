import React, { useState, useEffect } from 'react';
import { ArrowLeft, Tag, X, Cpu, Loader2, Image as ImageIcon, Camera, Sparkles, Folder, Check, Upload, Search, Trash2 } from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000/api";

export default function NewProjectWizard({ onCancel, onStartReview }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [classes, setClasses] = useState([]);
  const [classInput, setClassInput] = useState('');
  const [projectId, setProjectId] = useState(null);
  
  // Step 2: Upload states
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [stagedFilesData, setStagedFilesData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  
  // Step 3: Auto-label states
  const [useMock, setUseMock] = useState(true); 
  const [labelingJobId, setLabelingJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState(null);

  // Poll job status in Step 3
  useEffect(() => {
    if (!labelingJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${labelingJobId}`);
        if (!res.ok) throw new Error("Failed to poll job");
        const job = await res.json();
        
        setJobStatus(job.status);
        setJobProgress(job.progress);
        
        if (job.status === "completed") {
          clearInterval(interval);
        } else if (job.status === "failed") {
          setJobError(job.error_message || "Autolabeling task encountered an error.");
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
        setJobError("Error communicating with job monitor.");
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [labelingJobId]);

  const handleAddClass = (val) => {
    const formatted = val.trim().toLowerCase();
    if (formatted && !classes.includes(formatted)) {
      setClasses([...classes, formatted]);
    }
  };

  const handleClassInputKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddClass(classInput);
      setClassInput('');
    }
  };

  const handleRemoveClass = (indexToRemove) => {
    setClasses(classes.filter((_, i) => i !== indexToRemove));
  };

  const handleCreateProject = async () => {
    if (!name.trim()) return;
    if (classes.length === 0) return;
    
    try {
      const res = await fetch(`${API_BASE}/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, classes })
      });
      if (!res.ok) throw new Error("Failed to create project");
      const data = await res.json();
      setProjectId(data.id);
      setStep(2);
    } catch (err) {
      alert("Error creating project: " + err.message);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
    
    // Create local object URLs for previews
    const previews = files.map(file => ({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      url: URL.createObjectURL(file)
    }));
    setStagedFilesData(prev => [...prev, ...previews]);
  };

  const handleRemoveStagedFile = (idx) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    setStagedFilesData(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    
    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });
    
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/images/upload`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error("Failed to upload images");
      const data = await res.json();
      setUploadResult(data);
      setStep(3);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTriggerAutolabel = async () => {
    setJobError(null);
    setJobStatus("queued");
    setJobProgress(0);
    
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/autolabel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_mock: useMock })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to trigger autolabeling");
      }
      const data = await res.json();
      setLabelingJobId(data.job_id);
    } catch (err) {
      setJobError(err.message);
      setJobStatus("failed");
    }
  };

  return (
    <div className="space-y-6 flex flex-col min-h-[75vh] relative pb-24">
      {/* Wizard Steps indicator bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-900/60">
        <button
          onClick={onCancel}
          className="flex items-center text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>
        <div className="flex items-center space-x-6 text-[11px] font-bold uppercase tracking-wider font-technical-sm">
          <span className={`transition-colors ${step >= 1 ? 'text-primary' : 'text-gray-650'}`}>1. Details</span>
          <span className="text-gray-800 font-normal">&rarr;</span>
          <span className={`transition-colors ${step >= 2 ? 'text-primary' : 'text-gray-650'}`}>2. Upload & Ontologies</span>
          <span className="text-gray-800 font-normal">&rarr;</span>
          <span className={`transition-colors ${step >= 3 ? 'text-primary' : 'text-gray-650'}`}>3. Agent Auto-Label</span>
        </div>
      </div>

      {/* STEP 1: Project Details Config */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto glass-panel rounded-3xl p-8 shadow-xl space-y-8 w-full mt-4">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-extrabold text-gray-100 font-display-lg tracking-tight">Build a Computer Vision Model in Minutes</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Start small and we'll help improve it as your dataset grows.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider font-technical-xs">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Hardhat Detection"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant/30 hover:border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-on-surface outline-none transition-all text-sm font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-technical-xs">Object Classes</label>
              <div className="flex flex-wrap gap-2 p-2.5 bg-surface-container-lowest border border-outline-variant/30 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary rounded-xl min-h-[48px] transition-all">
                {classes.map((cls, idx) => (
                  <span
                    key={idx}
                    className="flex items-center px-2.5 py-1 bg-surface-container border border-outline-variant/20 rounded-lg text-xs font-mono font-bold text-on-surface-variant shadow-sm"
                  >
                    <Tag className="w-3 h-3 mr-1.5 text-gray-550" />
                    {cls}
                    <button
                      onClick={() => handleRemoveClass(idx)}
                      className="ml-2 hover:text-red-400 text-gray-550 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={classes.length === 0 ? "Type a class name and press Enter..." : "Add class..."}
                  value={classInput}
                  onChange={(e) => setClassInput(e.target.value)}
                  onKeyDown={handleClassInputKey}
                  className="flex-grow px-2 py-0.5 bg-transparent text-gray-200 text-sm outline-none placeholder-gray-650"
                />
              </div>
              <p className="text-[10px] text-gray-500">
                Add objects you want the agent to automatically find. Press Enter or use commas.
              </p>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleCreateProject}
              disabled={!name.trim() || classes.length === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-primary-container to-blue-600 hover:brightness-110 disabled:from-surface-container disabled:text-on-surface-variant/40 text-on-primary font-bold text-xs uppercase tracking-wider rounded-lg shadow-md transition-all duration-300"
            >
              Continue to Upload
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Split Layout Upload & Ontologies */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch mt-4">
          {/* Left Panel: Staging Yard */}
          <aside className="lg:col-span-3 glass-panel rounded-xl flex flex-col p-4">
            <div className="pb-3 border-b border-[#1f2937] mb-4">
              <h2 className="font-headline-md text-base text-on-surface flex items-center gap-2">
                <Folder className="w-4.5 h-4.5 text-primary" />
                Staging Yard
              </h2>
              <p className="font-technical-xs text-[10px] text-on-surface-variant mt-1">
                {selectedFiles.length} files staged
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 max-h-[400px] pr-1">
              {stagedFilesData.length === 0 ? (
                <div className="py-20 text-center text-xs text-gray-600 border border-gray-850 border-dashed rounded-2xl">
                  Staging yard empty. Upload files in the dropzone.
                </div>
              ) : (
                stagedFilesData.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 rounded-lg border border-outline-variant bg-surface-container hover:border-primary/30 transition-all group"
                  >
                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 border border-outline-variant">
                      <img className="w-full h-full object-cover" src={file.url} alt="staged preview" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-technical-sm text-xs text-on-surface truncate font-semibold">{file.name}</p>
                      <p className="font-technical-xs text-[10px] text-on-surface-variant font-mono">{file.size}</p>
                    </div>
                    <button 
                      onClick={() => handleRemoveStagedFile(idx)}
                      className="text-on-surface-variant hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Center Workspace: Dropzone */}
          <section className="lg:col-span-6 flex flex-col justify-center items-center p-6 border-2 border-dashed border-[#1f2937] bg-[#050f1c]/40 rounded-xl hover:border-primary/50 hover:bg-[#0b0f1a] transition-all cursor-pointer relative group">
            <input
              type="file"
              id="wizard-file-upload"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="wizard-file-upload" className="absolute inset-0 cursor-pointer z-10" />

            <div className="flex gap-4 mb-6 relative z-20">
              <div className="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center border border-outline-variant">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div className="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center border border-outline-variant">
                <Camera className="w-6 h-6 text-primary" />
              </div>
            </div>
            
            <div className="text-center space-y-2 relative z-20">
              <h3 className="font-headline-md text-lg text-on-surface font-bold">Drag & drop files here</h3>
              <p className="font-body-md text-xs text-on-surface-variant max-w-sm mx-auto">
                Upload image dataset files (JPG, PNG, WEBP supported)
              </p>
            </div>
            
            <div className="flex gap-4 mt-6 relative z-20">
              <button 
                onClick={() => document.getElementById('wizard-file-upload').click()}
                className="px-5 py-2 bg-primary hover:opacity-90 text-on-primary rounded-lg font-technical-sm text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5"
              >
                Choose Files
              </button>
              <button 
                onClick={() => document.getElementById('wizard-file-upload').click()}
                className="px-5 py-2 border border-outline-variant text-on-surface rounded-lg font-technical-sm text-xs font-semibold hover:bg-surface-container transition-all active:scale-95 flex items-center gap-1.5 bg-surface-container-lowest"
              >
                <Camera className="w-3.5 h-3.5 text-on-surface-variant" /> Use Webcam
              </button>
            </div>
          </section>

          {/* Right Sidebar: Ontology Builder */}
          <aside className="lg:col-span-3 glass-panel rounded-xl flex flex-col p-4">
            <div className="pb-3 border-b border-[#1f2937] mb-4">
              <h2 className="font-headline-md text-base text-on-surface flex items-center gap-2 font-semibold">
                <Tag className="w-4.5 h-4.5 text-primary" />
                Ontology Builder
              </h2>
              <p className="font-technical-xs text-[10px] text-on-surface-variant mt-1">
                What objects are you looking for?
              </p>
            </div>

            <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
              {/* Class input adder */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-3.5 h-3.5" />
                  <input
                    type="text"
                    value={classInput}
                    onChange={(e) => setClassInput(e.target.value)}
                    onKeyDown={handleClassInputKey}
                    className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-lg pl-9 pr-4 py-2 font-technical-sm text-xs text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40"
                    placeholder="Add class (e.g. 'hardhat')"
                  />
                </div>
              </div>

              {/* Suggestions chips */}
              <div className="space-y-2">
                <p className="font-technical-xs text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Suggestions</p>
                <div className="flex flex-wrap gap-2">
                  {["hardhat", "safety vest", "glasses", "person"].map((suggest, i) => (
                    <button
                      key={i}
                      onClick={() => handleAddClass(suggest)}
                      className="px-2.5 py-1 rounded-full border border-outline-variant text-on-surface-variant font-technical-xs text-[11px] hover:border-primary hover:text-primary transition-colors flex items-center gap-1 bg-surface-container-lowest"
                    >
                      + {suggest}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active list */}
              <div className="space-y-2">
                <p className="font-technical-xs text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Active Classes</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {classes.map((cls, idx) => {
                    const colors = ["bg-primary", "bg-tertiary", "bg-secondary", "bg-purple-400"];
                    const color = colors[idx % colors.length];

                    return (
                      <div key={idx} className="flex items-center justify-between p-2 rounded border border-outline-variant bg-surface-container-lowest/50">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${color}`}></div>
                          <span className="font-technical-sm text-xs text-on-surface font-medium">{cls}</span>
                        </div>
                        <button 
                          onClick={() => handleRemoveClass(idx)}
                          className="text-on-surface-variant hover:text-red-400 transition-colors p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* Bottom Fixed Footer controls */}
          <div className="col-span-12 flex justify-between items-center mt-6 pt-4 border-t border-[#1f2937]">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 border border-outline-variant rounded-full text-on-surface-variant font-technical-sm text-xs font-bold hover:brightness-110 transition-all active:scale-95 bg-transparent"
            >
              Back
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || selectedFiles.length === 0}
              className="px-6 py-2 bg-primary disabled:bg-surface-container disabled:text-on-surface-variant/40 text-on-primary rounded-full font-bold font-technical-sm text-xs hover:opacity-90 transition-all active:scale-95 shadow-[0_0_15px_rgba(173,198,255,0.3)] flex items-center gap-1.5"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingesting Files...
                </>
              ) : (
                <>
                  Upload & Parse Dataset
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Auto-Label Progress and Polling */}
      {step === 3 && (
        <div className="max-w-2xl mx-auto glass-panel rounded-3xl p-8 shadow-xl space-y-8 w-full mt-4 relative overflow-hidden">
          {/* Laser scanning line animation overlay during autolabel run */}
          {jobStatus === "running" && (
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent animate-scan pointer-events-none" />
          )}

          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-primary/10 border border-primary/25 rounded-2xl flex items-center justify-center text-primary mx-auto glow-blue mb-4">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <h2 className="text-2xl font-extrabold text-on-surface font-display-lg tracking-tight">Agentic Auto-Labeling</h2>
            <p className="text-on-surface-variant/70 text-sm max-w-sm mx-auto">
              Run zero-shot detectors to generate bounding box proposals automatically.
            </p>
          </div>

          {uploadResult && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface-container-lowest border border-outline-variant/30 rounded-xl text-center">
              <div>
                <span className="text-on-surface-variant/60 text-[10px] font-bold uppercase tracking-wider block font-technical-xs">Images Ingested</span>
                <span className="text-2xl font-black text-on-surface block mt-1 font-metric-lg">{uploadResult.images_ingested}</span>
              </div>
              <div>
                <span className="text-on-surface-variant/60 text-[10px] font-bold uppercase tracking-wider block font-technical-xs">Deduplicated</span>
                <span className="text-2xl font-black text-on-surface block mt-1 font-metric-lg">{uploadResult.images_deduplicated}</span>
              </div>
            </div>
          )}

          {/* Config Mock toggle */}
          <div className="p-4 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl flex items-center justify-between">
            <div className="space-y-1 pr-4">
              <span className="text-xs font-bold text-on-surface block">Mock Agent Execution</span>
              <span className="text-[10px] text-on-surface-variant/60 block">Runs simulated coordinates mapping for rapid testing. Toggle off to load local weights.</span>
            </div>
            <button
              onClick={() => setUseMock(!useMock)}
              disabled={jobStatus === "queued" || jobStatus === "running"}
              className={`w-12 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 ${
                useMock ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            >
              <div className={`bg-white w-5 h-5 rounded-full shadow-md transform duration-300 ${useMock ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Polling monitor status */}
          {jobStatus && (
            <div className="p-6 bg-surface-container border border-outline-variant/30 rounded-2xl space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface font-technical-sm">
                  {jobStatus === "queued" && "Queuing auto-label agent..."}
                  {jobStatus === "running" && "Agent scanning and labeling..."}
                  {jobStatus === "completed" && "Label proposals generated!"}
                  {jobStatus === "failed" && "Agent task failed"}
                </span>
                {jobStatus !== "completed" && jobStatus !== "failed" && (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                )}
              </div>

              <div className="space-y-2">
                <div className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${jobProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-on-surface-variant/60">
                  <span>Progress</span>
                  <span>{jobProgress}%</span>
                </div>
              </div>

              {jobError && (
                <div className="p-3 bg-red-950/20 border border-red-900/35 text-red-300 text-xs rounded-xl">
                  {jobError}
                </div>
              )}
            </div>
          )}

          {/* Footer controls */}
          <div className="pt-4 flex justify-between items-center border-t border-[#1f2937]/60">
            <button
              onClick={() => setStep(2)}
              disabled={jobStatus === "queued" || jobStatus === "running"}
              className="px-4 py-2 bg-transparent border border-gray-850 hover:border-gray-750 disabled:text-gray-650 text-gray-400 hover:text-gray-200 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Back
            </button>
            
            {jobStatus === "completed" ? (
              <button
                onClick={() => onStartReview(projectId, name)}
                className="flex items-center px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-emerald-500/10 transition-all hover:scale-[1.01]"
              >
                Start Reviewing Labels
                <Check className="w-4.5 h-4.5 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleTriggerAutolabel}
                disabled={jobStatus === "queued" || jobStatus === "running"}
                className="flex items-center px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg transition-all hover:scale-[1.01]"
              >
                <Sparkles className="w-4 h-4 mr-2" /> Run Auto-Labeling
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
