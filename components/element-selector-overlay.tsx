'use client';

export interface SelectedElement {
  selector: string;
  outerHTML: string;
  label: string;
  rect: { top: number; left: number; width: number; height: number };
}

/**
 * Script embedded directly into the iframe srcDoc when selector mode is active.
 * Runs immediately on page load — no postMessage handshake needed.
 */
export const PICKER_SCRIPT = `
<style>
  .__gdn_highlight__ {
    outline: 2px solid #3b82f6 !important;
    outline-offset: 2px !important;
    cursor: crosshair !important;
    background-color: rgba(59,130,246,0.08) !important;
  }
</style>
<script>
(function() {
  var hovered = null;

  function getCssSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    var parts = [];
    var current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      var selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += '#' + current.id;
        parts.unshift(selector);
        break;
      } else {
        var siblings = Array.prototype.filter.call(
          current.parentElement ? current.parentElement.children : [],
          function(s) { return s.tagName === current.tagName; }
        );
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
        parts.unshift(selector);
        current = current.parentElement;
      }
    }
    return parts.join(' > ');
  }

  function getLabel(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    return tag + id + cls;
  }

  function clearHighlight() {
    if (hovered) {
      hovered.classList.remove('__gdn_highlight__');
      hovered = null;
    }
  }

  document.addEventListener('mouseover', function(e) {
    clearHighlight();
    var el = e.target;
    if (el && el !== document.body && el !== document.documentElement) {
      el.classList.add('__gdn_highlight__');
      hovered = el;
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (e.target === hovered) clearHighlight();
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || el === document.body || el === document.documentElement) return;
    var selector = getCssSelector(el);
    var outerHTML = el.outerHTML.slice(0, 3000);
    var label = getLabel(el);
    var r = el.getBoundingClientRect();
    window.parent.postMessage({
      type: 'guidenco_element_selected',
      selector: selector,
      outerHTML: outerHTML,
      label: label,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height }
    }, '*');
  }, true);

  document.body.style.cursor = 'crosshair';
})();
</script>
`;
