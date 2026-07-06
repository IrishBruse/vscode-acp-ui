import "./AgentMarkdown.css";
import {
    Children,
    isValidElement,
    type ReactElement,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    languageFromClassName,
    renderHighlightedCode,
} from "./codeHighlighting";

export type AgentMarkdownProps = {
    /** Full assistant message text; updates as streaming chunks arrive. */
    text: string;
};

const CODE_TEXT_ATTR = "data-code-text";

function codeTextFromPreChild(children: ReactNode): string {
    const child = Children.toArray(children)[0];
    if (!isValidElement<Record<string, string | undefined>>(child)) {
        return "";
    }
    return child.props[CODE_TEXT_ATTR] ?? "";
}

async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}

function CopyCodeButton({ text }: { text: string }): ReactElement {
    const [copied, setCopied] = useState(false);
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    useEffect(() => {
        return () => {
            if (resetTimerRef.current !== undefined) {
                clearTimeout(resetTimerRef.current);
            }
        };
    }, []);

    const onCopy = useCallback(() => {
        if (text.length === 0) {
            return;
        }
        void copyTextToClipboard(text).then(() => {
            setCopied(true);
            if (resetTimerRef.current !== undefined) {
                clearTimeout(resetTimerRef.current);
            }
            resetTimerRef.current = setTimeout(() => {
                setCopied(false);
            }, 1500);
        });
    }, [text]);

    return (
        <button
            type="button"
            className="agent-markdown-code-block-copy"
            onClick={onCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            title={copied ? "Copied" : "Copy"}
        >
            {copied ? (
                <svg
                    className="agent-markdown-code-block-copy-icon"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                >
                    <path
                        fill="currentColor"
                        d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
                    />
                </svg>
            ) : (
                <svg
                    className="agent-markdown-code-block-copy-icon"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                >
                    <path
                        fill="currentColor"
                        d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2Zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6ZM2 5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1H9v1H2V7a1 1 0 0 1 1-1h1V5Z"
                    />
                </svg>
            )}
        </button>
    );
}

/**
 * Renders assistant markdown with GFM (tables, strikethrough, task lists). Re-parses on each text
 * update so streaming chunks render incrementally without a separate streaming parser.
 */
export function AgentMarkdown({ text }: AgentMarkdownProps): ReactElement {
    if (text.length === 0) {
        return (
            <div
                className="agent-markdown agent-markdown-empty"
                aria-hidden="true"
            />
        );
    }
    return (
        <div className="agent-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    pre({ children, ...rest }) {
                        const codeText = codeTextFromPreChild(children);
                        return (
                            <div className="agent-markdown-code-block">
                                <CopyCodeButton text={codeText} />
                                <pre {...rest}>{children}</pre>
                            </div>
                        );
                    },
                    code(props) {
                        const { className, children, ...rest } = props;
                        const language = languageFromClassName(className);
                        const codeText = String(children).replace(/\n$/, "");
                        if (!className) {
                            return (
                                <code {...rest} className={className}>
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code
                                {...rest}
                                className={className}
                                {...{ [CODE_TEXT_ATTR]: codeText }}
                            >
                                {renderHighlightedCode(language, codeText)}
                            </code>
                        );
                    },
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}
