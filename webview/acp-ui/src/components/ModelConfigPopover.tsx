import {
    type ReactElement,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import "./ModelConfigPopover.css";

export type ModelConfigPopoverProps = {
    options: AcpUiSessionConfigOption[];
    summaryLabel: string;
    disabled: boolean;
    onPick: (configId: string, value: string | boolean) => void;
};

/**
 * Popover for agent-provided `model_config` and derived model-parameter selectors.
 */
export function ModelConfigPopover({
    options,
    summaryLabel,
    disabled,
    onPick,
}: ModelConfigPopoverProps): ReactElement | null {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const panelId = useId();

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (event: MouseEvent): void => {
            const root = rootRef.current;
            if (root !== null && !root.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
        };
    }, [open]);

    if (options.length === 0) {
        return null;
    }

    return (
        <div className="model-config-popover-root" ref={rootRef}>
            <button
                type="button"
                className="model-config-popover-trigger"
                aria-expanded={open}
                aria-controls={panelId}
                title={summaryLabel}
                disabled={disabled}
                onClick={() => {
                    setOpen((current) => !current);
                }}
            >
                {summaryLabel}
            </button>
            {open ? (
                <div
                    id={panelId}
                    className="model-config-popover-panel"
                    role="dialog"
                    aria-label="Model parameters"
                >
                    {options.map((option) => (
                        <section
                            key={option.configId}
                            className="model-config-popover-section"
                        >
                            <div className="model-config-popover-section-title">
                                {option.name}
                            </div>
                            {option.type === "boolean" ? (
                                <label className="model-config-popover-boolean">
                                    <input
                                        type="checkbox"
                                        checked={option.currentValue}
                                        disabled={disabled}
                                        onChange={(event) => {
                                            onPick(
                                                option.configId,
                                                event.target.checked,
                                            );
                                        }}
                                    />
                                    <span>{option.name}</span>
                                </label>
                            ) : (
                                <div
                                    className="model-config-popover-choices"
                                    role="radiogroup"
                                    aria-label={option.name}
                                >
                                    {option.options.map((choice) => {
                                        const selected =
                                            option.currentValue === choice.value;
                                        return (
                                            <button
                                                key={`${option.configId}:${choice.value}`}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                className={
                                                    selected
                                                        ? "model-config-popover-choice model-config-popover-choice--active"
                                                        : "model-config-popover-choice"
                                                }
                                                disabled={disabled}
                                                title={choice.description}
                                                onClick={() => {
                                                    onPick(
                                                        option.configId,
                                                        choice.value,
                                                    );
                                                }}
                                            >
                                                <span
                                                    className="model-config-popover-choice-marker"
                                                    aria-hidden="true"
                                                >
                                                    {selected ? "\u25cf" : "\u25cb"}
                                                </span>
                                                <span>{choice.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
