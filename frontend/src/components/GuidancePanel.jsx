import React from 'react';
import { Info, Lightbulb } from 'lucide-react';

/**
 * GuidancePanel — reusable right-side contextual panel
 * Used across all pipeline stages to guide the user.
 *
 * Props:
 *   title: string
 *   description?: string
 *   actions?: Array<{ label, description, onClick, icon, variant: 'primary'|'secondary' }>
 *   tip?: string
 *   children?: ReactNode (for custom content)
 */
export default function GuidancePanel({ title, description, actions = [], tip, children }) {
  return (
    <aside className="w-64 guidance-panel flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{description}</p>
        )}
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="p-4 space-y-2 border-b border-gray-100">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className={`guidance-action-card w-full text-left ${action.active ? 'active' : ''}`}
            >
              <div className="flex items-start gap-3">
                {action.icon && (
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    action.variant === 'primary' ? 'bg-purple-100' : 'bg-gray-100'
                  }`}>
                    <action.icon className={`w-4 h-4 ${action.variant === 'primary' ? 'text-purple-600' : 'text-gray-500'}`} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-gray-800">{action.label}</p>
                  {action.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{action.description}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Custom children */}
      {children && (
        <div className="p-4 flex-1 overflow-y-auto">
          {children}
        </div>
      )}

      {/* Tip */}
      {tip && (
        <div className="m-4 mt-auto p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-start gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-purple-700 leading-relaxed">{tip}</p>
        </div>
      )}
    </aside>
  );
}
