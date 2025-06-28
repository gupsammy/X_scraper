// Toast Component - Notification system
export class Toast {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.init();
  }

  init() {
    this.createContainer();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1100;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  show(message, type = 'success', duration = 3000) {
    const toastId = Date.now() + Math.random();
    const toast = this.createToast(message, type, toastId);
    
    this.container.appendChild(toast);
    this.toasts.set(toastId, toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    // Auto-remove
    if (duration > 0) {
      setTimeout(() => {
        this.remove(toastId);
      }, duration);
    }

    return toastId;
  }

  createToast(message, type, id) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.toastId = id;

    const colors = {
      success: { bg: '#10ac84', color: 'white' },
      error: { bg: '#ff4757', color: 'white' },
      warning: { bg: '#ffa502', color: 'white' },
      info: { bg: '#3742fa', color: 'white' }
    };

    const colorScheme = colors[type] || colors.info;

    toast.style.cssText = `
      background: ${colorScheme.bg};
      color: ${colorScheme.color};
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
      pointer-events: auto;
      cursor: pointer;
      max-width: 300px;
      word-wrap: break-word;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // Add icon based on type
    const icon = this.getIcon(type);
    if (icon) {
      const iconEl = document.createElement('span');
      iconEl.innerHTML = icon;
      iconEl.style.flexShrink = '0';
      toast.appendChild(iconEl);
    }

    // Add message
    const messageEl = document.createElement('span');
    messageEl.textContent = message;
    messageEl.style.flex = '1';
    toast.appendChild(messageEl);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      margin-left: 8px;
      opacity: 0.8;
      transition: opacity 0.2s ease;
    `;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove(id);
    });
    toast.appendChild(closeBtn);

    // Click to dismiss
    toast.addEventListener('click', () => {
      this.remove(id);
    });

    return toast;
  }

  getIcon(type) {
    const icons = {
      success: `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>`,
      error: `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>`,
      warning: `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>`,
      info: `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>`
    };

    return icons[type] || icons.info;
  }

  remove(toastId) {
    const toast = this.toasts.get(toastId);
    if (!toast) return;

    // Animate out
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.toasts.delete(toastId);
    }, 300);
  }

  clear() {
    this.toasts.forEach((toast, id) => {
      this.remove(id);
    });
  }

  // Convenience methods
  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  destroy() {
    this.clear();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}