import { createElement, clearElement } from '../core/dom.js';

export class StageResultList {
  constructor(options = {}) {
    this.element = typeof options.element === 'string'
      ? globalThis.document?.getElementById(options.element)
      : options.element;
    this.onView = options.onView || (() => {});
    this.onVisibilityChange = options.onVisibilityChange;
    this.onDownload = options.onDownload || (() => {});
    this.stageLabels = options.stageLabels || {};
  }

  render(results = {}, stageOrder = Object.keys(results)) {
    if (!this.element) return;
    clearElement(this.element);
    const doc = this.element.ownerDocument;
    if (!stageOrder.length) {
      this.element.appendChild(createElement('p', { className: 'nd-empty-state', text: 'No results yet', ownerDocument: doc }));
      return;
    }
    for (const stage of stageOrder) {
      const result = results[stage];
      const label = this.stageLabels[stage] || result?.description || stage;
      const viewControl = typeof result?.visible === 'boolean' && this.onVisibilityChange
        ? createElement('label', {
          className: 'nd-result-visibility',
          title: `Show or hide ${label}`,
          ownerDocument: doc,
        }, [
          createElement('input', {
            type: 'checkbox',
            checked: result.visible,
            'aria-label': `Show ${label}`,
            ownerDocument: doc,
            onchange: (event) => this.onVisibilityChange(stage, event.currentTarget.checked, result, event.currentTarget),
          }),
        ])
        : createElement('button', {
          className: 'nd-view-btn',
          type: 'button',
          title: 'View',
          text: 'View',
          ownerDocument: doc,
          onclick: () => this.onView(stage, result)
        });
      const row = createElement('div', { className: 'nd-volume-toggle', ownerDocument: doc }, [
        viewControl,
        createElement('span', {
          className: 'nd-stage-label',
          text: label,
          ownerDocument: doc
        }),
        createElement('button', {
          className: 'nd-download-btn',
          type: 'button',
          title: 'Download',
          text: 'Download',
          ownerDocument: doc,
          onclick: () => this.onDownload(stage, result)
        })
      ]);
      this.element.appendChild(row);
    }
  }
}
