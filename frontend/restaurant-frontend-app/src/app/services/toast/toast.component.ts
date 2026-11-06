import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export interface ToastData {
  title?: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; handler: () => void };
}

@Component({
  selector: 'app-toast',
  template: `
    <div class="toast-content">
      @if (data.type === 'success') {
        <img src="assets/svg/check-circle.svg" alt="" class="toast-icon" />
      }
      @if (data.title) {
        <strong class="toast-title">{{ data.title }}</strong>
      }
      <span class="toast-message">{{ data.message }}</span>
      @if (data.action; as action) {
        <button type="button" class="toast-action" (click)="onAction(action.handler)">{{ action.label }}</button>
      }
    </div>
    <button class="toast-close" (click)="snackBarRef.dismiss()">✕</button>
  `,
  styleUrl: './toast.component.scss',
})
export class ToastComponent {
  data = inject<ToastData>(MAT_SNACK_BAR_DATA);
  snackBarRef = inject(MatSnackBarRef);

  onAction(handler: () => void): void {
    this.snackBarRef.dismiss();
    handler();
  }
}
