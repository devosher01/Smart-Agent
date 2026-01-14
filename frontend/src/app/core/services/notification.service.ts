import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
    providedIn: 'root',
})
export class NotificationService {
    private _snackBar = inject(MatSnackBar);

    /**
     * Show a success notification
     * @param message Message to show
     */
    success(message: string): void {
        this._snackBar.open(message, 'Close', {
            duration: 5000,
            panelClass: ['success-snackbar'],
            horizontalPosition: 'end',
            verticalPosition: 'top',
        });
    }

    /**
     * Show an error notification
     * @param message Message to show
     */
    error(message: string): void {
        this._snackBar.open(message, 'Close', {
            duration: 10000,
            panelClass: ['error-snackbar'],
            horizontalPosition: 'end',
            verticalPosition: 'top',
        });
    }

    /**
     * Show an info notification
     * @param message Message to show
     */
    info(message: string): void {
        this._snackBar.open(message, 'Close', {
            duration: 5000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
        });
    }
}
