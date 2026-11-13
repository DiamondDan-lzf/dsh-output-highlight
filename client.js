/**
 * dsh-output-highlight — Client half.
 *
 * Codex-TUI-like emphasis for Chat replies:
 *
 *  1. Markdown semantics become colored inside Assistant rows and the
 *     right-sidebar plan preview: `strong`/headings use the link accent
 *     (bold weight kept), `em` uses violet, `del` uses the error color,
 *     inline code gets an accent-tinted chip, blockquote rules and list
 *     markers pick up the accent.
 *
 *  2. A bolded phrase that carries a status meaning is recolored by meaning
 *     instead of the default accent: success is green, attention is amber,
 *     and a problem is red. This is intentionally restricted to phrases the
 *     model already emphasized with `**...**`, so ordinary prose (for example
 *     "异常清理" inside a long sentence) is never recolored by heuristic.
 *     Ranges are painted with the CSS Custom Highlight API; the DOM is never
 *     mutated, so React streaming stays untouched.
 *
 * Everything is scoped to the assistant Chat row
 * (`[data-chat-flow-kind="assistant-step"]`) and the right-sidebar plan
 * preview (`[data-plan-preview]`, rendered by `@deepseek-ai/dsh-client-ui-plan`),
 * and colors resolve from `--dsw-alias-*` / `--dsw-static-*` tokens so light
 * and dark themes keep working.
 *
 * Escape hatches:
 *  - `window.__dshOutputHighlight.refresh()` re-scans after manual DOM edits.
 *  - Set `BOLD_STATUS_COLORS` to `false` to leave every bold phrase on the
 *    default accent color (Markdown styling only).
 */

window.__ModuleLoader__.load({
  id: 'dsh-output-highlight',
  factory() {
    'use strict';

    const PLUGIN_ID = 'dsh-output-highlight';
    const STYLE_ID = 'dsh-output-highlight-style';
    /** Assistant Chat rows (the primary scope). */
    const ROW_SELECTOR = '[data-chat-flow-kind="assistant-step"]';
    /**
     * Right-sidebar plan preview. `@deepseek-ai/dsh-client-ui-plan` renders
     * `<section data-plan-preview>` around a MarkdownText of the submitted
     * plan, so the same Markdown emphasis applies there.
     */
    const PLAN_SELECTOR = '[data-plan-preview]';
    const SCOPE_SELECTOR = `${ROW_SELECTOR}, ${PLAN_SELECTOR}`;
    const STYLE_SCOPE = `:is(${ROW_SELECTOR}, ${PLAN_SELECTOR})`;
    const RANGE_SKIP_ANCESTOR = 'pre, code, a';

    /** Recolor bolded status phrases; false keeps every bold phrase on the accent color. */
    const BOLD_STATUS_COLORS = true;

    const HIGHLIGHT_NAMES = {
      problem: 'dsh-output-problem',
      warn: 'dsh-output-warn',
      success: 'dsh-output-success',
    };

    // A bolded clean-report phrase ("无异常", "0 错误") reads as success even
    // though it contains a problem word, so it is classified before the
    // problem category. Priority after this check: problem > warn > success.
    const CLEAN_STATUS_PATTERN =
      /(?:无|没有|未发现|未见|暂无)(?:明显)?(?:异常|错误|失败|风险|问题)|0\s*(?:个|项)?\s*(?:错误|异常|失败)|零(?:错误|异常|失败)/iu;

    const STATUS_PATTERNS = [
      [
        'problem',
        /没有通过|未通过|没通过|失败|错误|报错|异常|崩溃|超时|阻塞|风险|缺失|遗漏|缺陷|不一致|不可用|未接入|未实现|未完成|未修复|未解决|拒绝|\b(?:FAIL(?:ED|URE)?|ERROR|EXCEPTION|TIMEOUT|CRASH|BROKEN)\b/iu,
      ],
      [
        'warn',
        /注意|待确认|待验证|待定|待办|下一步|尚未|还未|未验证|未测试|未覆盖|遗留|限制|警告|隐患|\b(?:TODO|FIXME|WARN(?:ING)?|PENDING|RISK)\b/iu,
      ],
      [
        'success',
        /全部通过|测试通过|验证通过|通过|成功|已完成|已经完成|已实现|已接入|已修复|已确认|已解决|已就绪|正常|可用|就绪|生效|完成|无异常|无错误|无误|\b(?:PASSED|SUCCESS|DONE)\b/iu,
      ],
    ];

    const STYLE_TEXT = `
/* Scoped to assistant rows and the sidebar plan preview: Markdown emphasis becomes colorful. */
body {
  --dsh-oh-accent: var(--dsw-alias-link, #4176e6);
  --dsh-oh-violet: color-mix(in srgb, var(--dsw-static-violet-600, #7c3aed) 68%, var(--dsw-alias-label-primary, #0f1115));
  --dsh-oh-code: color-mix(in srgb, var(--dsw-static-deepseek-500, #4176e6) 72%, var(--dsw-alias-label-primary, #0f1115));
  --dsh-oh-problem: color-mix(in srgb, var(--dsw-static-red-500, #ef4444) 64%, var(--dsw-alias-label-primary, #0f1115));
  --dsh-oh-warn: color-mix(in srgb, var(--dsw-static-amber-500, #f59e0b) 66%, var(--dsw-alias-label-primary, #0f1115));
  --dsh-oh-success: color-mix(in srgb, var(--dsw-static-green-500, #22c55e) 58%, var(--dsw-alias-label-primary, #0f1115));
  --dsh-oh-problem-bg: color-mix(in srgb, var(--dsw-static-red-500, #ef4444) 14%, transparent);
  --dsh-oh-warn-bg: color-mix(in srgb, var(--dsw-static-amber-500, #f59e0b) 15%, transparent);
  --dsh-oh-success-bg: color-mix(in srgb, var(--dsw-static-green-500, #22c55e) 15%, transparent);
}

html ${STYLE_SCOPE} strong {
  color: var(--dsh-oh-accent);
  font-weight: 700;
}

html ${STYLE_SCOPE} em {
  color: var(--dsh-oh-violet);
}

html ${STYLE_SCOPE} del {
  color: var(--dsh-oh-problem);
  text-decoration-color: var(--dsh-oh-problem);
}

html ${STYLE_SCOPE} :is(h1, h2, h3, h4, h5, h6) {
  color: var(--dsh-oh-accent);
}

html ${STYLE_SCOPE} :not(pre) > code {
  color: var(--dsh-oh-code);
  background-color: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 10%, var(--dsw-alias-markdown-inline-code, transparent));
  border-color: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 28%, var(--dsw-alias-border-l1, transparent));
}

html ${STYLE_SCOPE} blockquote {
  color: var(--dsw-alias-label-secondary, #61666b);
  border-left-color: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 55%, var(--dsw-alias-border-l2, transparent));
}

html ${STYLE_SCOPE} li::marker {
  color: color-mix(in srgb, var(--dsw-alias-link, #4176e6) 58%, var(--dsw-alias-label-secondary, #61666b));
}

html ${STYLE_SCOPE} th {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 600;
}

/* The mark element is not emitted by the current parser but is styled if it appears. */
html ${STYLE_SCOPE} mark {
  color: var(--dsh-oh-warn);
  background-color: var(--dsh-oh-warn-bg);
  border-radius: 3px;
  padding: 0 2px;
}

/* Bolded status phrases, painted over the default strong accent. */
::highlight(dsh-output-problem) {
  color: var(--dsh-oh-problem, #f25a5a);
  background-color: var(--dsh-oh-problem-bg, rgb(242 90 90 / 14%));
}

::highlight(dsh-output-warn) {
  color: var(--dsh-oh-warn, #f59e0b);
  background-color: var(--dsh-oh-warn-bg, rgb(245 158 11 / 15%));
}

::highlight(dsh-output-success) {
  color: var(--dsh-oh-success, #22c55e);
  background-color: var(--dsh-oh-success-bg, rgb(34 197 94 / 15%));
}
`;

    function warn(message, error) {
      // A styling plugin must never break page boot.
      try {
        console.warn(`[${PLUGIN_ID}] ${message}`, error);
      } catch {
        /* ignore console failures */
      }
    }

    function installStyle() {
      const previous = document.getElementById(STYLE_ID);
      if (previous !== null) previous.remove();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.dataset.plugin = PLUGIN_ID;
      style.dataset.pluginCss = `${PLUGIN_ID}/styles.css`;
      style.textContent = STYLE_TEXT;
      const parent = document.head ?? document.documentElement;
      parent.appendChild(style);
      return () => style.remove();
    }

    /** @returns {boolean} */
    function supportsHighlightApi() {
      return (
        typeof CSS !== 'undefined' &&
        CSS.highlights !== undefined &&
        typeof Highlight === 'function' &&
        typeof document.createRange === 'function'
      );
    }

    /** @param {Element} element */
    function isVisible(element) {
      if (typeof element.checkVisibility === 'function') {
        try {
          return element.checkVisibility();
        } catch {
          /* fall through to geometry */
        }
      }
      return element.getClientRects().length > 0;
    }

    /** @param {string} text */
    function classifyBoldText(text) {
      if (CLEAN_STATUS_PATTERN.test(text)) return 'success';
      for (const [kind, pattern] of STATUS_PATTERNS) {
        if (pattern.test(text)) return kind;
      }
      return undefined;
    }

    /** @param {Element} root */
    function collectTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.nodeValue;
        if (text !== null && text.trim() !== '') nodes.push(node);
      }
      return nodes;
    }

    /** @param {Element} strong @param {Range[]} ranges */
    function pushStrongRanges(strong, ranges) {
      if (!isVisible(strong)) return;
      for (const node of collectTextNodes(strong)) {
        const parent = node.parentElement;
        if (parent === null) continue;
        if (parent.closest(RANGE_SKIP_ANCESTOR) !== null) continue;
        const value = node.nodeValue;
        if (value === null || value.length === 0) continue;
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, value.length);
        ranges.push(range);
      }
    }

    function rebuildBoldHighlights() {
      const buckets = { problem: [], warn: [], success: [] };
      for (const root of document.querySelectorAll(SCOPE_SELECTOR)) {
        for (const strong of root.querySelectorAll('strong')) {
          if (strong.closest('pre, code') !== null) continue;
          // The compact Markdown variant marks reasoning prose; skip it inside
          // assistant rows, but never inside the plan preview (where a compact
          // variant would otherwise suppress the semantic colors).
          const compact = strong.closest('[data-markdown-variant="compact"]');
          if (compact !== null && compact.closest(PLAN_SELECTOR) === null) continue;
          const text = strong.textContent ?? '';
          if (text.trim() === '') continue;
          const kind = classifyBoldText(text);
          if (kind === undefined) continue;
          const ranges = buckets[kind];
          try {
            pushStrongRanges(strong, ranges);
          } catch (error) {
            warn('could not measure a bold phrase', error);
          }
        }
      }
      for (const [kind, name] of Object.entries(HIGHLIGHT_NAMES)) {
        const ranges = buckets[kind];
        if (ranges.length === 0) {
          CSS.highlights.delete(name);
          continue;
        }
        try {
          CSS.highlights.set(name, new Highlight(...ranges));
        } catch (error) {
          warn('could not register a bold status highlight', error);
        }
      }
    }

    function installBoldStatusColors() {
      if (!BOLD_STATUS_COLORS || !supportsHighlightApi()) {
        return () => {};
      }

      let pendingCancel = null;
      const run = () => {
        try {
          rebuildBoldHighlights();
        } catch (error) {
          warn('bold status scan failed', error);
        }
      };
      const schedule = () => {
        if (pendingCancel !== null) return;
        if (typeof requestAnimationFrame === 'function') {
          const frame = requestAnimationFrame(() => {
            pendingCancel = null;
            run();
          });
          pendingCancel = () => {
            cancelAnimationFrame(frame);
            pendingCancel = null;
          };
        } else {
          const timer = setTimeout(() => {
            pendingCancel = null;
            run();
          }, 80);
          pendingCancel = () => {
            clearTimeout(timer);
            pendingCancel = null;
          };
        }
      };

      /** @param {Node} node */
      const isInsideScope = (node) => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return element !== null && typeof element.closest === 'function' && element.closest(SCOPE_SELECTOR) !== null;
      };

      /** @param {MutationRecord} mutation */
      const isRelevant = (mutation) => {
        if (mutation.type === 'characterData') return isInsideScope(mutation.target);
        if (mutation.type === 'attributes') return isInsideScope(mutation.target);
        if (isInsideScope(mutation.target)) return true;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches(SCOPE_SELECTOR)) return true;
          if (node.querySelector(SCOPE_SELECTOR) !== null) return true;
        }
        // A removed row leaves stale ranges behind until the next scan.
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches(SCOPE_SELECTOR)) return true;
          if (node.querySelector(SCOPE_SELECTOR) !== null) return true;
        }
        return false;
      };

      const observer = new MutationObserver((mutations) => {
        if (mutations.some(isRelevant)) schedule();
      });
      observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        attributes: true,
        // Only disclosure/visibility toggles can reveal bold text that was
        // skipped while hidden; unrelated attribute churn stays unobserved.
        attributeFilter: ['hidden', 'open', 'aria-expanded', 'data-expanded', 'data-streaming'],
        subtree: true,
      });

      const onReady = () => schedule();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
      } else {
        schedule();
      }

      const api = { refresh: schedule };
      try {
        Object.defineProperty(window, '__dshOutputHighlight', {
          value: api,
          configurable: true,
        });
      } catch {
        /* a foreign non-configurable value wins; highlighting still works */
      }

      return () => {
        observer.disconnect();
        pendingCancel?.();
        pendingCancel = null;
        document.removeEventListener('DOMContentLoaded', onReady);
        for (const name of Object.values(HIGHLIGHT_NAMES)) CSS.highlights.delete(name);
        try {
          if (window.__dshOutputHighlight === api) delete window.__dshOutputHighlight;
        } catch {
          /* ignore */
        }
      };
    }

    return {
      apply(ctx) {
        if (typeof document === 'undefined') return;
        ctx.effect(() => {
          const disposers = [];
          try {
            disposers.push(installStyle());
          } catch (error) {
            warn('could not install the highlight stylesheet', error);
          }
          try {
            disposers.push(installBoldStatusColors());
          } catch (error) {
            warn('could not install bold status colors', error);
          }
          return () => {
            for (let index = disposers.length - 1; index >= 0; index -= 1) {
              try {
                disposers[index]();
              } catch (error) {
                warn('cleanup failed', error);
              }
            }
          };
        }, 'output-highlight: assistant reply and plan preview emphasis');
      },
    };
  },
});
