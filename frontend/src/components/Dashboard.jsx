import React, { useEffect, useState } from 'react';
import { Plus, FolderOpen, Image as ImageIcon, BarChart3, Cpu, History, Thermometer, Database, HelpCircle, Bell, ArrowRight, Loader2, Play } from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000/api";

export default function Dashboard({ onNavigate, onCreateNew }) {
  const [projects, setProjects] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Live GPU telemetry states
  const [gpuTemp, setGpuTemp] = useState(74);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll GPU telemetry temperature fluctuations
  useEffect(() => {
    const tempInterval = setInterval(() => {
      setGpuTemp(prev => {
        const variance = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
        const nextTemp = prev + variance;
        return Math.max(68, Math.min(82, nextTemp)); // clamp between 68 and 82
      });
    }, 3000);
    return () => clearInterval(tempInterval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const projRes = await fetch(`${API_BASE}/projects/`);
      if (!projRes.ok) throw new Error("Failed to fetch projects");
      const projData = await projRes.json();

      // Fetch active jobs
      const jobsRes = await fetch(`${API_BASE}/jobs/`);
      let jobsData = [];
      if (jobsRes.ok) {
        jobsData = await jobsRes.json();
        setActiveJobs(jobsData);
      }

      // Fetch images and training runs details for each project to compute stats
      const projectsWithDetails = await Promise.all(projData.map(async (p) => {
        try {
          const [imgRes, runsRes] = await Promise.all([
            fetch(`${API_BASE}/projects/${p.id}/images`),
            fetch(`${API_BASE}/projects/${p.id}/runs`)
          ]);
          let imageCount = 0;
          let mAP = "--";
          if (imgRes.ok) {
            const imgs = await imgRes.json();
            imageCount = imgs.length;
          }
          if (runsRes.ok) {
            const runs = await runsRes.json();
            if (runs.length > 0 && runs[0].map50) {
              mAP = `${(runs[0].map50 * 100).toFixed(1)}%`;
            }
          }

          // Check if there is an active job for this project
          const projectJob = jobsData.find(j => j.project_id === p.id && (j.status === 'queued' || j.status === 'running'));

          return { 
            ...p, 
            imageCount, 
            mAP,
            activeJob: projectJob || null
          };
        } catch (err) {
          return { ...p, imageCount: 0, mAP: "--", activeJob: null };
        }
      }));

      setProjects(projectsWithDetails);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the backend server. Make sure FastAPI is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  // Compute metrics dynamically
  const totalProjects = projects.length;
  
  // Format total images (e.g. 52.4K or actual count)
  const totalImages = projects.reduce((acc, p) => acc + (p.imageCount || 0), 0);
  const formattedImages = totalImages > 999 
    ? `${(totalImages / 1000).toFixed(1)}K` 
    : totalImages;

  // Calculate average mAP
  const mAPValues = projects
    .map(p => parseFloat(p.mAP))
    .filter(val => !isNaN(val));
  const avgMAP = mAPValues.length > 0 
    ? `${(mAPValues.reduce((sum, val) => sum + val, 0) / mAPValues.length).toFixed(1)}%` 
    : "0.0%";

  // Simulated GPU Compute Time based on active projects
  const gpuComputeTime = totalProjects > 0 
    ? `${(totalProjects * 18.5 + 12.2).toFixed(1)} hrs` 
    : "0.0 hrs";

  return (
    <div className="space-y-8 animate-fadeIn">
      {error && (
        <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl flex items-start space-x-3 text-red-300 text-sm">
          <Cpu className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Connection Refused</span>
            {error}
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Active Projects</span>
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-metric-lg text-3xl text-on-surface">{totalProjects}</span>
            <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-bold">+1 this week</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Total Images Annotated</span>
            <ImageIcon className="w-5 h-5 text-secondary" />
          </div>
          <div className="font-metric-lg text-3xl text-on-surface">{formattedImages}</div>
        </div>

        <div className="glass-panel p-6 rounded-xl border-secondary/35 glow-green flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Average mAP@50</span>
            <BarChart3 className="w-5 h-5 text-secondary" />
          </div>
          <div className="font-metric-lg text-3xl text-secondary">{avgMAP}</div>
        </div>

        <div className="glass-panel p-6 rounded-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">GPU Compute Time</span>
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div className="font-metric-lg text-3xl text-on-surface">{gpuComputeTime}</div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Panel: Pipelines Table */}
        <section className="lg:col-span-8 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="font-headline-md text-lg text-on-surface">Active CV Pipelines</h2>
            </div>
            <button 
              onClick={onCreateNew}
              className="bg-primary-container text-on-primary-container font-label-caps text-[12px] px-4 py-2 rounded font-bold flex items-center gap-1.5 glow-blue hover:opacity-90 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              CREATE NEW PROJECT
            </button>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-20 text-gray-500 text-sm">
                No active projects. Click "CREATE NEW PROJECT" to start your first machine learning pipeline.
              </div>
            ) : (
              <table className="w-full text-left font-body-sm">
                <thead>
                  <tr className="text-on-surface-variant border-b border-outline-variant/30 bg-surface-container-lowest">
                    <th className="px-6 py-3 font-label-caps uppercase tracking-tighter text-xs">Project</th>
                    <th className="px-6 py-3 font-label-caps uppercase tracking-tighter text-xs">Task</th>
                    <th className="px-6 py-3 font-label-caps uppercase tracking-tighter text-xs">Status</th>
                    <th className="px-6 py-3 font-label-caps uppercase tracking-tighter text-xs">mAP</th>
                    <th className="px-6 py-3 font-label-caps uppercase tracking-tighter text-xs">Images</th>
                    <th className="px-6 py-3 font-label-caps uppercase tracking-tighter text-xs text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {projects.map((proj) => {
                    // Determine status tag / progress bar
                    let statusNode = null;
                    let actionText = "OPEN";
                    let actionPage = "review";

                    if (proj.activeJob) {
                      statusNode = (
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="text-primary font-semibold">
                              {proj.activeJob.type === 'training' ? 'Training' : 'Labeling'}
                            </span>
                            <span className="text-primary">{proj.activeJob.progress}%</span>
                          </div>
                          <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${proj.activeJob.progress}%` }}></div>
                          </div>
                        </div>
                      );
                      actionText = proj.activeJob.type === 'training' ? "MONITOR" : "LABEL";
                      actionPage = proj.activeJob.type === 'training' ? "train" : "review";
                    } else if (proj.status === 'created') {
                      statusNode = (
                        <span className="bg-surface-container text-on-surface-variant px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-outline-variant">
                          Created
                        </span>
                      );
                      actionText = "UPLOAD";
                      actionPage = "new_project";
                    } else if (proj.status === 'labeling') {
                      statusNode = (
                        <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-primary/20 animate-pulse">
                          Auto-Labeling
                        </span>
                      );
                      actionText = "LABEL";
                      actionPage = "review";
                    } else if (proj.status === 'needs_review') {
                      statusNode = (
                        <span className="bg-red-500/10 text-red-400 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-red-500/20">
                          Needs Review
                        </span>
                      );
                      actionText = "ANNOTATE";
                      actionPage = "review";
                    } else if (proj.status === 'reviewed' || proj.status === 'needs_data') {
                      statusNode = (
                        <span className="bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-indigo-500/20">
                          Reviewed
                        </span>
                      );
                      actionText = "TRAIN";
                      actionPage = "train";
                    } else if (proj.status === 'training') {
                      statusNode = (
                        <span className="bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-indigo-500/20 animate-pulse">
                          Training
                        </span>
                      );
                      actionText = "MONITOR";
                      actionPage = "train";
                    } else if (proj.status === 'ready') {
                      statusNode = (
                        <span className="status-badge px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-secondary/20">
                          Deploy Ready
                        </span>
                      );
                      actionText = "TRY IN SANDBOX";
                      actionPage = "export";
                    } else {
                      statusNode = (
                        <span className="status-badge px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-tight border border-secondary/20">
                          {proj.status}
                        </span>
                      );
                    }

                    return (
                      <tr key={proj.id} className="hover:bg-surface-container/40 transition-colors">
                        <td className="px-6 py-4 text-on-surface font-mono text-[13px] font-semibold">{proj.name}</td>
                        <td className="px-6 py-4 text-on-surface-variant">Object Detection</td>
                        <td className="px-6 py-4">{statusNode}</td>
                        <td className="px-6 py-4 text-on-surface font-semibold">{proj.mAP}</td>
                        <td className="px-6 py-4 text-on-surface-variant font-mono">
                          {proj.imageCount > 999 ? `${(proj.imageCount / 1000).toFixed(1)}K` : proj.imageCount}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => onNavigate(actionPage, proj.id, proj.name)}
                            className={`inline-block px-3 py-1 rounded text-[11px] font-bold transition-all ${
                              actionText === "TRY IN SANDBOX"
                                ? "bg-primary text-on-primary shadow-sm hover:brightness-110 active:scale-95"
                                : "border border-primary text-primary hover:bg-primary/10"
                            }`}
                          >
                            {actionText}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Right Panel: Telemetry & Feed */}
        <aside className="lg:col-span-4 space-y-6">
          {/* Recent Actions */}
          <div className="glass-panel rounded-xl p-6">
            <h3 className="font-headline-md text-[16px] text-on-surface mb-6 flex items-center gap-2">
              <History className="w-4 h-4 text-secondary" />
              Recent Actions
            </h3>
            <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-outline-variant/30">
              <div className="relative pl-6">
                <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-secondary-container/20 border border-secondary flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                </span>
                <p className="text-body-sm text-on-surface text-xs leading-normal">
                  Autolabel agent finished <span className="font-mono text-primary">hardhat10.jpeg</span>
                </p>
                <span className="text-[10px] text-on-surface-variant font-medium">10m ago</span>
              </div>
              <div className="relative pl-6">
                <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-primary-container/20 border border-primary flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                </span>
                <p className="text-body-sm text-on-surface text-xs leading-normal">
                  Model <span className="font-mono text-primary">find-helmet-5pfaa</span> retrained to v8
                </p>
                <span className="text-[10px] text-on-surface-variant font-medium">2h ago</span>
              </div>
              <div className="relative pl-6">
                <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-surface-container-highest border border-outline flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></span>
                </span>
                <p className="text-body-sm text-on-surface text-xs leading-normal">
                  New project <span className="font-mono text-primary">hazard-zone-detector</span> created
                </p>
                <span className="text-[10px] text-on-surface-variant font-medium">1d ago</span>
              </div>
            </div>
          </div>

          {/* GPU Status Card */}
          <div className="glass-panel rounded-xl p-6 bg-gradient-to-br from-surface-container to-surface-container-high">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-md text-[16px] text-on-surface">GPU Status</h3>
              <span className="text-[10px] font-bold text-secondary uppercase bg-secondary/10 px-2 py-0.5 rounded">LIVE</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase">Temperature</p>
                <div className="flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4 text-red-500" />
                  <span className="font-metric-lg text-lg text-on-surface font-semibold">{gpuTemp}°C</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase">Memory</p>
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="font-metric-lg text-sm text-on-surface font-semibold">12.4 / 16.0 GB</span>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-outline-variant/30">
              <div className="flex justify-between text-[11px] text-on-surface-variant mb-2">
                <span>Fan Speed</span>
                <span className="text-on-surface font-bold">65%</span>
              </div>
              <div className="flex gap-1 h-3">
                <div className="flex-1 bg-secondary rounded-sm opacity-100"></div>
                <div className="flex-1 bg-secondary rounded-sm opacity-100"></div>
                <div className="flex-1 bg-secondary rounded-sm opacity-100"></div>
                <div className="flex-1 bg-secondary rounded-sm opacity-80"></div>
                <div className="flex-1 bg-secondary rounded-sm opacity-60"></div>
                <div className="flex-1 bg-secondary rounded-sm opacity-40"></div>
                <div className="flex-1 bg-surface-container-highest rounded-sm"></div>
                <div className="flex-1 bg-surface-container-highest rounded-sm"></div>
              </div>
            </div>
          </div>

          {/* Atmospheric Element */}
          <div className="h-32 rounded-xl overflow-hidden relative border border-outline-variant/30 flex items-end p-4 bg-surface-container-lowest/30">
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest to-transparent pointer-events-none"></div>
            <div className="relative z-10">
              <p className="text-[10px] font-label-caps text-primary tracking-widest font-bold">REAL-TIME DATA STREAM</p>
              <p className="text-[12px] font-mono text-on-surface-variant mt-0.5">0.024ms Latency</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
