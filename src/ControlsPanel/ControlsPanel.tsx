import { CONTROLS } from './controls.ts'
import './ControlsPanel.scss'

// A framed list of the keyboard controls, beside the view pane or under it.
function ControlsPanel() {
  return (
    <aside className="controls-panel" aria-labelledby="controls-heading">
      <h2 id="controls-heading" className="controls-panel-heading">
        Controls
      </h2>
      <dl className="controls-panel-list">
        {CONTROLS.map(({ keys, action }) => (
          <div key={action} className="controls-panel-entry">
            <dt>
              {keys.map(({ label, name }, index) => (
                <span key={label}>
                  {index > 0 && '/'}
                  {name ? (
                    // The symbol is shown and the name read: a <kbd> can't
                    // reliably take an aria-label, as it has no role.
                    <kbd>
                      <span aria-hidden="true">{label}</span>
                      <span className="controls-panel-hidden">{name}</span>
                    </kbd>
                  ) : (
                    <kbd>{label}</kbd>
                  )}
                </span>
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

export default ControlsPanel
