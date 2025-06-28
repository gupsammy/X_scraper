// Modal Component - Reusable modal for media viewing and other content
export class Modal {
  constructor() {
    this.modal = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    this.createModal();
    this.attachEventListeners();
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay';
    this.modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" aria-label="Close modal">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        <div class="modal-body">
          <!-- Content will be inserted here -->
        </div>
      </div>
    `;

    // Apply styles
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    `;

    const modalContent = this.modal.querySelector('.modal-content');
    modalContent.style.cssText = `
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      transform: scale(0.9);
      transition: transform 0.3s ease;
    `;

    const modalClose = this.modal.querySelector('.modal-close');
    modalClose.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 1001;
      transition: background 0.2s ease;
    `;

    const modalCloseIcon = modalClose.querySelector('svg');
    modalCloseIcon.style.cssText = `
      width: 16px;
      height: 16px;
      fill: white;
    `;

    const modalBody = this.modal.querySelector('.modal-body');
    modalBody.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    document.body.appendChild(this.modal);
  }

  attachEventListeners() {
    // Close button
    const closeBtn = this.modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
      this.close();
    });

    // Close on overlay click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Prevent content clicks from closing modal
    const modalContent = this.modal.querySelector('.modal-content');
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  open(content, options = {}) {
    if (this.isOpen) return;

    const modalBody = this.modal.querySelector('.modal-body');
    modalBody.innerHTML = '';

    // Handle different content types
    if (typeof content === 'string') {
      modalBody.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      modalBody.appendChild(content);
    }

    // Apply custom options
    if (options.maxWidth) {
      this.modal.querySelector('.modal-content').style.maxWidth = options.maxWidth;
    }
    if (options.maxHeight) {
      this.modal.querySelector('.modal-content').style.maxHeight = options.maxHeight;
    }

    // Show modal
    this.modal.style.visibility = 'visible';
    this.modal.style.opacity = '1';
    
    // Animate content
    setTimeout(() => {
      this.modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }, 10);

    this.isOpen = true;
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  close() {
    if (!this.isOpen) return;

    // Animate out
    this.modal.querySelector('.modal-content').style.transform = 'scale(0.9)';
    this.modal.style.opacity = '0';

    setTimeout(() => {
      this.modal.style.visibility = 'hidden';
      this.modal.querySelector('.modal-body').innerHTML = '';
    }, 300);

    this.isOpen = false;
    document.body.style.overflow = ''; // Restore scrolling
  }

  openMedia(mediaUrl, mediaType) {
    let mediaElement;

    if (mediaType === 'image') {
      mediaElement = document.createElement('img');
      mediaElement.src = mediaUrl;
      mediaElement.alt = 'Full size image';
      mediaElement.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
      `;
    } else if (mediaType === 'video') {
      mediaElement = document.createElement('video');
      mediaElement.src = mediaUrl;
      mediaElement.controls = true;
      mediaElement.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        border-radius: 8px;
      `;
    }

    if (mediaElement) {
      this.open(mediaElement, {
        maxWidth: '95vw',
        maxHeight: '95vh'
      });
    }
  }

  openConfirmation(message, onConfirm, onCancel) {
    const confirmationContent = document.createElement('div');
    confirmationContent.className = 'confirmation-modal';
    confirmationContent.innerHTML = `
      <div class="confirmation-message">${message}</div>
      <div class="confirmation-actions">
        <button class="btn btn-secondary cancel-btn">Cancel</button>
        <button class="btn btn-danger confirm-btn">Confirm</button>
      </div>
    `;

    confirmationContent.style.cssText = `
      text-align: center;
      padding: 20px;
      min-width: 300px;
    `;

    const message_el = confirmationContent.querySelector('.confirmation-message');
    message_el.style.cssText = `
      margin-bottom: 20px;
      font-size: 16px;
      line-height: 1.5;
    `;

    const actions = confirmationContent.querySelector('.confirmation-actions');
    actions.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: center;
    `;

    const buttons = confirmationContent.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.style.cssText = `
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.2s ease;
      `;
    });

    const cancelBtn = confirmationContent.querySelector('.cancel-btn');
    cancelBtn.style.background = '#6c757d';
    cancelBtn.style.color = 'white';

    const confirmBtn = confirmationContent.querySelector('.confirm-btn');
    confirmBtn.style.background = '#dc3545';
    confirmBtn.style.color = 'white';

    // Event listeners
    cancelBtn.addEventListener('click', () => {
      this.close();
      if (onCancel) onCancel();
    });

    confirmBtn.addEventListener('click', () => {
      this.close();
      if (onConfirm) onConfirm();
    });

    this.open(confirmationContent);
  }

  destroy() {
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
    document.body.style.overflow = '';
  }
}