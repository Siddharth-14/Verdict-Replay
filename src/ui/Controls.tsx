import { useRef, type KeyboardEvent } from "react";
import type { Scenario } from "../sim/types";

interface Props {
  scenarios: Scenario[];
  selectedId: string;
  onSelect: (id: string) => void;
  freshnessHours: number;
  onFreshness: (hours: number) => void;
  onExport: () => void;
}

export function Controls({ scenarios, selectedId, onSelect, freshnessHours, onFreshness, onExport }: Props) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % scenarios.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + scenarios.length) % scenarios.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = scenarios.length - 1;
    else return;
    e.preventDefault();
    onSelect(scenarios[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="controls">
      <div role="tablist" aria-label="Scenarios" className="tabs">
        {scenarios.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={s.id === selectedId}
            aria-controls="scenario-panel"
            tabIndex={s.id === selectedId ? 0 : -1}
            className="tab"
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="tab-num">{i + 1}</span> {s.title}
          </button>
        ))}
      </div>

      <div className="control-row">
        <div className="slider">
          <label htmlFor="freshness">
            Freshness limit (rule C): <strong>{freshnessHours} h</strong>
          </label>
          <input
            id="freshness"
            type="range"
            min={6}
            max={72}
            step={1}
            value={freshnessHours}
            onChange={(e) => onFreshness(Number(e.target.value))}
            aria-valuetext={`${freshnessHours} hours`}
          />
          <div className="slider-scale" aria-hidden="true">
            <span>6 h</span>
            <span>72 h</span>
          </div>
        </div>
        <button type="button" className="btn" onClick={onExport}>
          Export fixtures (JSON)
        </button>
      </div>
    </div>
  );
}
